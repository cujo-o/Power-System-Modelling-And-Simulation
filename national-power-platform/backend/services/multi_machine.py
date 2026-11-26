"""Multi-machine classical rotor-angle transient stability and CCT simulator."""

import math
from typing import Dict, List, Optional

import networkx as nx
import numpy as np
import pandapower as pp

from config import settings
from services.power_flow import clean_float

# Typical inertia H (s) and damping D parameters for Nigerian generating stations
PLANT_INERTIA_DEFAULTS = {
    "kainji": (4.5, 2.0),
    "jebba": (4.6, 2.0),
    "shiroro": (4.0, 1.8),
    "zungeru": (4.4, 1.9),
    "egbin": (5.2, 2.2),
    "delta": (3.5, 1.5),
    "afam": (4.8, 2.0),
    "sapele": (3.6, 1.6),
    "azura": (4.4, 2.0),
    "geregu": (4.1, 1.9),
    "okpai": (4.3, 1.9),
}


def _lookup_machine_params(name: str, is_slack: bool) -> tuple[float, float]:
    lower = name.lower()
    for key, params in PLANT_INERTIA_DEFAULTS.items():
        if key in lower:
            return params
    return (5.0, 2.0) if is_slack else (4.0, 1.8)


def _compute_electrical_distances(net: pp.pandapowerNet, fault_bus_id: int) -> Dict[int, float]:
    """
    Computes reactance-weighted shortest path distances from `fault_bus_id` to all
    reachable buses using NetworkX Dijkstra traversal on in-service lines.
    """
    graph = nx.Graph()
    for b_id in net.bus.index:
        graph.add_node(int(b_id))

    if hasattr(net, "line") and len(net.line) > 0:
        for idx, row in net.line.iterrows():
            if not bool(row.get("in_service", True)):
                continue
            u = int(row["from_bus"])
            v = int(row["to_bus"])
            length = max(0.1, clean_float(row.get("length_km"), 1.0))
            x_per_km = max(1e-4, clean_float(row.get("x_ohm_per_km"), 0.32))
            # Convert ohms to approximate per-unit reactance on 100 MVA base
            vn_kv = clean_float(net.bus.at[u, "vn_kv"], 330.0) if u in net.bus.index else 330.0
            z_base = max(1.0, (vn_kv ** 2) / 100.0)
            x_pu = max(0.005, (x_per_km * length) / z_base)

            if graph.has_edge(u, v):
                # Parallel circuits reduce equivalent reactance
                existing = graph[u][v]["weight"]
                graph[u][v]["weight"] = (existing * x_pu) / (existing + x_pu)
            else:
                graph.add_edge(u, v, weight=x_pu)

    if fault_bus_id not in graph:
        return {}

    try:
        return {int(k): float(v) for k, v in nx.single_source_dijkstra_path_length(graph, fault_bus_id, weight="weight").items()}
    except Exception:
        return {}


def simulate_multi_machine(
    net: Optional[pp.pandapowerNet],
    fault_bus_id: int,
    fault_duration_ms: float = 80.0,
    fault_start_s: float = 1.0,
    sim_duration_s: float = 4.0,
    calc_cct: bool = True,
) -> dict:
    """
    Integrates the classical multi-machine swing equation for every generating unit
    in `net` following a balanced 3-phase fault at `fault_bus_id`.

    Each machine starts at an exact pre-fault equilibrium angle `delta_0` with
    `P_e_max = P_m / sin(delta_0)`. During the fault `[t_start, t_clear)`, electrical
    output drops according to its reactance-weighted electrical distance to the fault.
    Critical Clearing Time (CCT) is solved via binary search over clearing duration.
    """
    if net is None or len(net.bus) == 0:
        return {
            "time": [],
            "fault_bus_id": fault_bus_id,
            "fault_duration_ms": fault_duration_ms,
            "fault_start_s": fault_start_s,
            "fault_clear_s": round(fault_start_s + fault_duration_ms / 1000.0, 3),
            "system_status": "NO_MODEL",
            "lowest_cct_ms": 0.0,
            "trajectories": [],
            "machines": [],
        }

    # Discover slack and synchronous machines from active network
    discovered: List[dict] = []
    has_ext_res = hasattr(net, "res_ext_grid") and len(net.res_ext_grid) > 0

    if hasattr(net, "ext_grid") and len(net.ext_grid) > 0:
        for idx in net.ext_grid.index:
            b_id = int(net.ext_grid.at[idx, "bus"])
            b_name = str(net.bus.at[b_id, "name"]) if "name" in net.bus else f"Bus #{b_id}"
            p_res = abs(clean_float(net.res_ext_grid.at[idx, "p_mw"], 500.0)) if (has_ext_res and idx in net.res_ext_grid.index) else 500.0
            p_max = clean_float(net.ext_grid.at[idx, "max_p_mw"] if "max_p_mw" in net.ext_grid else None, max(p_res * 1.3, 700.0))
            h_val, d_val = _lookup_machine_params(b_name, is_slack=True)
            discovered.append({
                "id": len(discovered),
                "name": f"{b_name} (Slack)",
                "bus": b_id,
                "p_mw": max(100.0, p_res),
                "max_p_mw": max(p_res * 1.15, p_max, 500.0),
                "h": h_val,
                "d": d_val,
                "is_slack": True,
            })

    if hasattr(net, "gen") and len(net.gen) > 0:
        for idx in net.gen.index:
            if "in_service" in net.gen and not bool(net.gen.at[idx, "in_service"]):
                continue
            b_id = int(net.gen.at[idx, "bus"])
            b_name = str(net.bus.at[b_id, "name"]) if "name" in net.bus else f"Bus #{b_id}"
            g_name = str(net.gen.at[idx, "name"]) if ("name" in net.gen and net.gen.at[idx, "name"]) else b_name
            p_val = clean_float(net.gen.at[idx, "p_mw"] if "p_mw" in net.gen else 150.0, 150.0)
            p_max = clean_float(net.gen.at[idx, "max_p_mw"] if "max_p_mw" in net.gen else None, max(p_val * 1.25, 200.0))
            h_val, d_val = _lookup_machine_params(g_name, is_slack=False)
            discovered.append({
                "id": len(discovered),
                "name": g_name,
                "bus": b_id,
                "p_mw": max(50.0, p_val),
                "max_p_mw": max(p_val * 1.15, p_max, 100.0),
                "h": h_val,
                "d": d_val,
                "is_slack": False,
            })

    if not discovered:
        return {
            "time": [],
            "fault_bus_id": fault_bus_id,
            "fault_duration_ms": fault_duration_ms,
            "fault_start_s": fault_start_s,
            "fault_clear_s": round(fault_start_s + fault_duration_ms / 1000.0, 3),
            "system_status": "STABLE",
            "lowest_cct_ms": 0.0,
            "trajectories": [],
            "machines": [],
        }

    # Compute reactance distance from fault bus to every generator bus
    distances = _compute_electrical_distances(net, fault_bus_id)
    omega_s = 2.0 * math.pi * settings.F_NOMINAL_HZ
    dt = 0.005  # 5 ms step for crisp swing integration
    n_steps = int(round(sim_duration_s / dt)) + 1
    time_arr = np.linspace(0.0, sim_duration_s, n_steps)

    # Pre-compute per-machine classical swing parameters on each unit's own MVA rating base
    machine_specs = []
    for gen in discovered:
        x_dist = distances.get(gen["bus"], None)
        if x_dist is None:
            fault_coupling = 0.90
        elif x_dist <= 1e-6:
            # Fault directly on generator bus -> severe terminal voltage collapse
            fault_coupling = 0.05
        else:
            # Retained electrical transfer increases smoothly with electrical distance x_pu
            fault_coupling = min(0.85, max(0.08, x_dist / (x_dist + 0.12)))

        # Per-unit mechanical input on the machine's own MVA base (typically 0.55 - 0.88 pu)
        s_machine_mva = max(gen["max_p_mw"] / 0.85, gen["p_mw"] * 1.15, 100.0)
        pm_pu = min(0.90, max(0.50, gen["p_mw"] / s_machine_mva))
        delta0_rad = math.radians(24.0 + 18.0 * pm_pu)
        # Post-fault peak power transfer P_max ensures exact pre-fault equilibrium: P_max * sin(delta0) = Pm
        pe_max_pu = pm_pu / math.sin(delta0_rad)

        machine_specs.append({
            **gen,
            "pm_pu": pm_pu,
            "delta0_rad": delta0_rad,
            "pe_max_pu": pe_max_pu,
            "fault_coupling": fault_coupling,
        })

    def integrate_machine(spec: dict, clear_ms: float, record_curve: bool = False) -> tuple[bool, float, Optional[List[float]]]:
        """Integrates one machine's swing trajectory using RK2; returns (is_stable, max_deg, angles)."""
        t_clear = fault_start_s + (clear_ms / 1000.0)
        delta = spec["delta0_rad"]
        omega = 0.0  # Rotor speed deviation (rad/s)
        pm = spec["pm_pu"]
        pe_max = spec["pe_max_pu"]
        coupling = spec["fault_coupling"]
        h_val = spec["h"]
        d_pu = spec["d"] * 0.015  # Normalized damping factor
        coeff = omega_s / (2.0 * h_val)

        max_deg = math.degrees(delta)
        angles = [] if record_curve else None
        stable = True

        for idx, t in enumerate(time_arr):
            if record_curve and idx % 4 == 0:
                angles.append(round(math.degrees(delta), 2))

            if t < fault_start_s:
                pe1 = pm
            elif t < t_clear:
                pe1 = pm * coupling * math.sin(delta) / math.sin(spec["delta0_rad"])
            else:
                # Post-fault transmission weakening factor (0.92) models cleared-line impedance increase
                pe1 = 0.92 * pe_max * math.sin(delta)

            d_omega1 = coeff * (pm - pe1) - d_pu * omega
            d_delta1 = omega

            delta_mid = delta + d_delta1 * dt
            omega_mid = omega + d_omega1 * dt
            t_next = t + dt

            if t_next < fault_start_s:
                pe2 = pm
            elif t_next < t_clear:
                pe2 = pm * coupling * math.sin(delta_mid) / math.sin(spec["delta0_rad"])
            else:
                pe2 = 0.92 * pe_max * math.sin(delta_mid)

            d_omega2 = coeff * (pm - pe2) - d_pu * omega_mid
            d_delta2 = omega_mid

            delta += 0.5 * (d_delta1 + d_delta2) * dt
            omega += 0.5 * (d_omega1 + d_omega2) * dt

            deg = math.degrees(delta)
            if deg > max_deg:
                max_deg = deg
            if abs(deg) >= 180.0:
                stable = False
                if not record_curve:
                    return False, max_deg, None

        return stable, max_deg, angles

    def solve_cct_ms(spec: dict) -> float:
        """Solves Critical Clearing Time (ms) via 8-step binary search in [20 ms, 400 ms]."""
        low, high = 20.0, 400.0
        # Quick check if still stable at 400 ms
        if integrate_machine(spec, high, record_curve=False)[0]:
            return high
        if not integrate_machine(spec, low, record_curve=False)[0]:
            return low

        for _ in range(8):
            mid = 0.5 * (low + high)
            if integrate_machine(spec, mid, record_curve=False)[0]:
                low = mid
            else:
                high = mid
        return round(low, 1)

    trajectories = []
    machines = []
    any_pole_slip = False
    lowest_cct = 400.0

    for spec in machine_specs:
        is_stable, max_deg, angles = integrate_machine(spec, fault_duration_ms, record_curve=True)
        cct_val = solve_cct_ms(spec) if calc_cct else 150.0
        lowest_cct = min(lowest_cct, cct_val)

        slipped = (not is_stable) or (fault_duration_ms > cct_val)
        if slipped:
            any_pole_slip = True

        trajectories.append({
            "id": spec["id"],
            "name": spec["name"],
            "angles": angles or [],
        })
        machines.append({
            "id": spec["id"],
            "name": spec["name"],
            "bus_node": f"Bus #{spec['bus']}",
            "inertia_h": f"{spec['h']:.1f} s",
            "max_excursion": f"{round(min(max_deg, 360.0), 1)}°",
            "cct_ms": cct_val,
            "cct_margin_ms": round(cct_val - fault_duration_ms, 1),
            "status": "POLE SLIP" if slipped else "SYNCHRONOUS",
        })

    return {
        "time": [round(float(t), 2) for t in time_arr[::4]],
        "fault_bus_id": fault_bus_id,
        "fault_duration_ms": fault_duration_ms,
        "fault_start_s": fault_start_s,
        "fault_clear_s": round(fault_start_s + fault_duration_ms / 1000.0, 3),
        "system_status": "POLE_SLIP" if any_pole_slip else "STABLE",
        "lowest_cct_ms": round(lowest_cct, 1),
        "trajectories": trajectories,
        "machines": machines,
    }
