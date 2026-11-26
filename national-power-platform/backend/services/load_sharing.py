"""Decentralized governor droop load-sharing and parallel corridor current division."""

from typing import Dict, List, Optional, Tuple

import pandapower as pp

from config import settings
from services.power_flow import clean_float


def solve_load_sharing(
    net: Optional[pp.pandapowerNet],
    model_name: str = "Active Model",
    load_step_mw: float = 300.0,
    system_damping_d: float = 1.2,
    droop_overrides: Optional[Dict[str, float]] = None,
) -> dict:
    """
    Computes steady-state primary frequency deviation and generator droop pickup
    across all online synchronous units in `net`, plus impedance-based flow sharing
    across parallel multi-circuit corridors.

    Governing relations:
      - Per-unit governor gain: K_i = P_rated,i / (R_pu,i * f_0)   [MW/Hz]
      - Composite grid stiffness: beta = sum(K_i) + D * P_load / f_0
      - Settling frequency shift: delta_f = -delta_P / beta
      - Unit allocation: delta_P_i = (K_i / sum(K_j)) * delta_P
    """
    f0 = settings.F_NOMINAL_HZ
    overrides = droop_overrides or {}

    if net is None or len(net.bus) == 0:
        return {
            "model_name": "No Active Model",
            "nominal_frequency_hz": f0,
            "settling_frequency_hz": f0,
            "frequency_deviation_hz": 0.0,
            "load_step_mw": load_step_mw,
            "system_stiffness_mw_per_hz": 0.0,
            "allocations": [],
            "parallel_corridors": [],
        }

    # Ensure res_ext_grid is populated when reading slack base dispatch
    has_ext_res = hasattr(net, "res_ext_grid") and len(net.res_ext_grid) > 0
    discovered_gens: List[dict] = []

    if hasattr(net, "ext_grid") and len(net.ext_grid) > 0:
        for idx in net.ext_grid.index:
            b_id = int(net.ext_grid.at[idx, "bus"])
            b_name = str(net.bus.at[b_id, "name"]) if "name" in net.bus else f"Bus #{b_id}"
            res_p = (
                abs(clean_float(net.res_ext_grid.at[idx, "p_mw"], 0.0))
                if (has_ext_res and idx in net.res_ext_grid.index)
                else 0.0
            )
            base_p = res_p if res_p > 1.0 else 500.0
            max_p_col = net.ext_grid.at[idx, "max_p_mw"] if "max_p_mw" in net.ext_grid else None
            max_p = clean_float(max_p_col, 0.0)
            if max_p <= 0.0:
                max_p = max(base_p * 1.5, 600.0)

            discovered_gens.append({
                "id": f"ext_{idx}",
                "name": f"{b_name} (Slack)",
                "bus_id": b_id,
                "rated_p_mw": round(max_p, 1),
                "current_p_mw": round(base_p, 1),
            })

    if hasattr(net, "gen") and len(net.gen) > 0:
        for idx in net.gen.index:
            if "in_service" in net.gen and not bool(net.gen.at[idx, "in_service"]):
                continue
            b_id = int(net.gen.at[idx, "bus"])
            b_name = str(net.bus.at[b_id, "name"]) if "name" in net.bus else f"Bus #{b_id}"
            p_mw = clean_float(net.gen.at[idx, "p_mw"] if "p_mw" in net.gen else 120.0, 120.0)
            max_p = clean_float(
                net.gen.at[idx, "max_p_mw"] if "max_p_mw" in net.gen else None,
                max(p_mw * 1.25, 180.0),
            )
            if max_p <= 0.0:
                max_p = max(p_mw * 1.25, 180.0)

            gen_name = str(net.gen.at[idx, "name"]) if ("name" in net.gen and net.gen.at[idx, "name"]) else b_name
            discovered_gens.append({
                "id": f"gen_{idx}",
                "name": gen_name,
                "bus_id": b_id,
                "rated_p_mw": round(max_p, 1),
                "current_p_mw": round(p_mw, 1),
            })

    # Compute individual governor gains K_i (MW/Hz)
    gains: List[float] = []
    gen_droops: List[float] = []
    for gen in discovered_gens:
        # Honor override keyed either by generator ID ("gen_0") or bus ID ("17")
        r_pct = overrides.get(gen["id"], overrides.get(str(gen["bus_id"]), 4.0))
        r_pu = max(0.01, float(r_pct) / 100.0)
        gen_droops.append(round(float(r_pct), 2))
        gains.append(gen["rated_p_mw"] / (r_pu * f0))

    total_gain = sum(gains)
    model_load_mw = (
        clean_float(net.load["p_mw"].sum(), 0.0)
        if (hasattr(net, "load") and len(net.load) > 0)
        else 0.0
    )
    load_base_mw = model_load_mw if model_load_mw > 10.0 else max(sum(g["rated_p_mw"] for g in discovered_gens) * 0.7, 500.0)
    damping_mw_per_hz = system_damping_d * load_base_mw / f0
    system_stiffness = total_gain + damping_mw_per_hz if total_gain > 0 else 1.0

    delta_f = -load_step_mw / system_stiffness
    settling_freq = round(f0 + delta_f, 3)

    allocations = []
    for i, gen in enumerate(discovered_gens):
        participation = (gains[i] / total_gain) if total_gain > 0 else (1.0 / len(discovered_gens))
        delta_p = participation * load_step_mw
        new_dispatch = gen["current_p_mw"] + delta_p
        headroom_left = gen["rated_p_mw"] - new_dispatch

        allocations.append({
            "id": gen["id"],
            "name": gen["name"],
            "bus_id": gen["bus_id"],
            "rated_mw": gen["rated_p_mw"],
            "droop_percent": gen_droops[i],
            "participation_factor_percent": round(participation * 100.0, 2),
            "base_p_mw": gen["current_p_mw"],
            "allocated_delta_mw": round(delta_p, 2),
            "new_p_mw": round(new_dispatch, 2),
            "remaining_headroom_mw": round(headroom_left, 2),
            "exceeded_rating": new_dispatch > gen["rated_p_mw"],
        })

    # Identify parallel multi-circuit corridors and theoretical susceptance share
    parallel_corridors = []
    if hasattr(net, "line") and len(net.line) > 0:
        pair_map: Dict[Tuple[int, int], List[int]] = {}
        for idx in net.line.index:
            u = int(net.line.at[idx, "from_bus"])
            v = int(net.line.at[idx, "to_bus"])
            pair_map.setdefault((min(u, v), max(u, v)), []).append(int(idx))

        for (u, v), line_ids in pair_map.items():
            if len(line_ids) <= 1:
                continue

            u_name = str(net.bus.at[u, "name"]) if "name" in net.bus else f"Bus #{u}"
            v_name = str(net.bus.at[v, "name"]) if "name" in net.bus else f"Bus #{v}"

            admittances = []
            for lid in line_ids:
                length = clean_float(net.line.at[lid, "length_km"] if "length_km" in net.line else 1.0, 1.0)
                x_per_km = clean_float(net.line.at[lid, "x_ohm_per_km"] if "x_ohm_per_km" in net.line else 0.3, 0.3)
                admittances.append(1.0 / max(1e-4, x_per_km * length))

            sum_y = sum(admittances)
            circuits = []
            for idx_pos, lid in enumerate(line_ids):
                share = (admittances[idx_pos] / sum_y) if sum_y > 0 else (1.0 / len(line_ids))
                circuits.append({
                    "line_id": lid,
                    "name": str(net.line.at[lid, "name"]) if "name" in net.line else f"Line #{lid}",
                    "reactance_ohm": round(1.0 / admittances[idx_pos], 4),
                    "theoretical_share_percent": round(share * 100.0, 1),
                })

            parallel_corridors.append({
                "corridor": f"{u_name} <-> {v_name}",
                "from_bus": u,
                "to_bus": v,
                "circuits_count": len(line_ids),
                "circuits": circuits,
            })

    return {
        "model_name": model_name,
        "nominal_frequency_hz": f0,
        "settling_frequency_hz": settling_freq,
        "frequency_deviation_hz": round(delta_f, 3),
        "load_step_mw": load_step_mw,
        "system_stiffness_mw_per_hz": round(system_stiffness, 1),
        "allocations": allocations,
        "parallel_corridors": parallel_corridors,
    }
