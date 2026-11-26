"""Steady-state AC power flow solver with adaptive fallback stages and planning sandbox."""

import copy
import math
from typing import Dict, List, Optional

import numpy as np
import pandapower as pp
import pandapower.topology as top

from config import CONDUCTOR_CATALOG, settings
from models.schemas import PowerFlowVariables


def clean_float(val, fallback: float = 0.0) -> float:
    """Safely converts a numeric value to a finite Python float."""
    try:
        parsed = float(val)
        return fallback if (math.isnan(parsed) or math.isinf(parsed)) else parsed
    except (TypeError, ValueError):
        return fallback


def solve_power_flow(
    base_net: Optional[pp.pandapowerNet],
    model_name: str = "Active Model",
    pf_variables: Optional[PowerFlowVariables] = None,
    tripped_lines: Optional[List[int]] = None,
) -> dict:
    """
    Solves steady-state AC power flow on a deep copy of `base_net`.

    Applies regional planning additions (new buses, tie lines, generators), operational
    setpoints (demand scaling, power factor, slack voltage, switched shunt MVAR, thermal
    derating), and N-1 line outages before executing a multi-stage numerical solver.
    """
    if base_net is None or len(base_net.bus) == 0:
        return {
            "converged": False,
            "model_name": "No Active Model",
            "frequency": settings.F_NOMINAL_HZ,
            "total_gen_mw": 0.0,
            "total_load_mw": 0.0,
            "total_losses_mw": 0.0,
            "buses": [],
            "lines": [],
            "message": "No active grid model in memory. Select or upload a model.",
        }

    net = copy.deepcopy(base_net)
    vars_deck = pf_variables or PowerFlowVariables()
    outages = set(tripped_lines or [])

    # 1. Apply regional planning additions with deterministic bus IDs
    next_bus_id = int(net.bus.index.max()) + 1 if len(net.bus) > 0 else 1
    for nb in vars_deck.newBuses:
        assigned_id = next_bus_id
        next_bus_id += 1
        pp.create_bus(net, vn_kv=nb.vn_kv, name=nb.name, zone=nb.zone, index=assigned_id)
        if nb.p_mw > 0:
            pp.create_load(
                net,
                bus=assigned_id,
                p_mw=nb.p_mw,
                q_mvar=nb.q_mvar,
                name=f"{nb.name} Load",
            )

    for nl in vars_deck.newLines:
        if nl.from_bus in net.bus.index and nl.to_bus in net.bus.index and nl.from_bus != nl.to_bus:
            spec = CONDUCTOR_CATALOG.get(nl.conductor_type, CONDUCTOR_CATALOG["Bison 330kV"])
            pp.create_line_from_parameters(
                net,
                from_bus=nl.from_bus,
                to_bus=nl.to_bus,
                length_km=max(1.0, nl.length_km),
                r_ohm_per_km=spec.r_ohm_per_km,
                x_ohm_per_km=spec.x_ohm_per_km,
                c_nf_per_km=spec.c_nf_per_km,
                max_i_ka=spec.max_i_ka,
                name=nl.name,
            )

    for ng in vars_deck.newGenerators:
        if ng.bus in net.bus.index:
            pp.create_gen(
                net,
                bus=ng.bus,
                p_mw=ng.p_mw,
                vm_pu=ng.vm_pu,
                max_p_mw=max(ng.p_max_mw, ng.p_mw),
                min_p_mw=0.0,
                name=ng.name,
            )

    # 2. Apply N-1 line breaker outages
    for line_id in outages:
        if line_id in net.line.index:
            net.line.at[line_id, "in_service"] = False

    # 3. Guarantee a valid slack reference bus
    if len(net.ext_grid) == 0:
        if len(net.gen) > 0:
            slack_gen_idx = net.gen["p_mw"].idxmax()
            slack_bus = int(net.gen.at[slack_gen_idx, "bus"])
            pp.create_ext_grid(net, bus=slack_bus, vm_pu=vars_deck.slackVoltagePu, name="Slack Reference")
            net.gen.drop(slack_gen_idx, inplace=True)
        else:
            pp.create_ext_grid(
                net, bus=int(net.bus.index[0]), vm_pu=vars_deck.slackVoltagePu, name="Slack Reference"
            )
    else:
        net.ext_grid["vm_pu"] = vars_deck.slackVoltagePu

    # 4. Apply load scaling, power factor, generation scaling, thermal derating, and shunts
    load_scale = max(0.2, min(3.0, vars_deck.loadMultiplier))
    pf = max(0.70, min(1.0, vars_deck.targetPowerFactor))
    tan_phi = math.tan(math.acos(pf))

    if len(net.load) > 0:
        net.load["p_mw"] = net.load["p_mw"] * load_scale
        net.load["q_mvar"] = net.load["p_mw"] * tan_phi

    if len(net.gen) > 0:
        net.gen["p_mw"] = net.gen["p_mw"] * load_scale
        if "max_p_mw" in net.gen:
            net.gen["max_p_mw"] = np.maximum(net.gen["max_p_mw"].fillna(0.0), net.gen["p_mw"]) * 1.25
        voltage_shift = vars_deck.slackVoltagePu - 1.05
        if "vm_pu" in net.gen:
            net.gen["vm_pu"] = np.clip(net.gen["vm_pu"] + voltage_shift, 0.95, 1.12)

    derating = max(0.5, min(1.5, vars_deck.thermalDeratingFactor))
    if len(net.line) > 0 and derating != 1.0:
        net.line["max_i_ka"] = net.line["max_i_ka"] * derating

    if vars_deck.shuntMvarCompensation != 0.0:
        if len(net.load) > 0:
            target_buses = net.load.sort_values(by="p_mw", ascending=False)["bus"].head(4).values
            q_split = -vars_deck.shuntMvarCompensation / len(target_buses)
            for b_id in target_buses:
                pp.create_shunt(net, bus=int(b_id), q_mvar=q_split, p_mw=0.0)
        else:
            pp.create_shunt(net, bus=int(net.bus.index[0]), q_mvar=-vars_deck.shuntMvarCompensation, p_mw=0.0)

    # 5. Isolate unsupplied buses to prevent singular Jacobians on split topologies
    try:
        pp.set_isolated_buses_out_of_service(net)
        unsupplied = top.unsupplied_buses(net)
        if unsupplied:
            net.bus.loc[list(unsupplied), "in_service"] = False
    except Exception:
        pass

    # Pre-aggregate per-bus loads and generators once (O(N)) for DC fallback and telemetry flags
    load_p_by_bus: Dict[int, float] = (
        net.load.groupby("bus")["p_mw"].sum().to_dict() if len(net.load) > 0 else {}
    )
    gen_p_by_bus: Dict[int, float] = (
        net.gen.groupby("bus")["p_mw"].sum().to_dict() if len(net.gen) > 0 else {}
    )
    gen_bus_set = set(net.gen["bus"].tolist()) if len(net.gen) > 0 else set()
    if len(net.ext_grid) > 0:
        gen_bus_set.update(net.ext_grid["bus"].tolist())
    load_bus_set = set(net.load["bus"].tolist()) if len(net.load) > 0 else set()

    # 6. Multi-stage AC solver with DC linearized approximation fallback
    converged = False
    used_dc_fallback = False
    solver_notice: Optional[str] = None

    solver_stages = [
        ("nr", {"init": "flat", "max_iteration": 50, "tolerance_mva": 1e-3, "enforce_q_limits": False}, None),
        ("nr", {"init": "auto", "max_iteration": 60, "tolerance_mva": 1e-3, "enforce_q_limits": False}, None),
        ("iwamoto", {"max_iteration": 80, "tolerance_mva": 1e-3}, "Solved via Iwamoto damped AC power flow."),
        ("fdpb", {"max_iteration": 80, "tolerance_mva": 1e-3}, "Solved via fast-decoupled AC power flow."),
    ]

    for algo, kwargs, notice in solver_stages:
        try:
            pp.runpp(net, algorithm=algo, numba=False, **kwargs)
            if bool(net.converged):
                converged = True
                solver_notice = notice
                break
        except Exception:
            continue

    if not converged:
        try:
            pp.rundcpp(net, numba=False)
            converged = True
            used_dc_fallback = True
            solver_notice = "AC power flow did not converge; showing DC linearized approximation."

            slack_v = vars_deck.slackVoltagePu
            shunt_boost = (vars_deck.shuntMvarCompensation / 1000.0) * 0.08
            has_res_bus = hasattr(net, "res_bus")

            for idx in net.bus.index:
                b_load_p = float(load_p_by_bus.get(idx, 0.0))
                b_load_q = b_load_p * tan_phi
                b_gen_p = float(gen_p_by_bus.get(idx, 0.0))
                if idx in gen_bus_set:
                    calc_v = slack_v
                    calc_q = b_gen_p * 0.35 - b_load_q
                else:
                    ang = abs(clean_float(net.res_bus.at[idx, "va_degree"], 2.0)) if (has_res_bus and idx in net.res_bus.index) else 2.0
                    v_drop = (b_load_p * 0.00028 + b_load_q * 0.00042) + (ang * 0.0075) * (load_scale ** 0.85)
                    calc_v = max(0.81, slack_v - v_drop + shunt_boost)
                    calc_q = b_load_q

                net.res_bus.at[idx, "vm_pu"] = round(calc_v, 3)
                net.res_bus.at[idx, "q_mvar"] = round(calc_q, 1)
        except Exception as exc:
            converged = False
            solver_notice = f"Power flow calculation failed: {exc}"

    # 7. Extract bus telemetry
    has_res_bus = hasattr(net, "res_bus")
    buses_out = []
    for idx in net.bus.index:
        row = net.bus.loc[idx]
        bus_in_service = bool(row.get("in_service", True))
        v_pu, va_deg, p_mw, q_mvar = 1.0, 0.0, 0.0, 0.0

        if has_res_bus and idx in net.res_bus.index:
            v_pu = clean_float(net.res_bus.at[idx, "vm_pu"], 1.0)
            va_deg = clean_float(net.res_bus.at[idx, "va_degree"], 0.0)
            p_mw = clean_float(net.res_bus.at[idx, "p_mw"], 0.0)
            raw_q = net.res_bus.at[idx, "q_mvar"]
            if pd_isna(raw_q):
                q_mvar = float(load_p_by_bus.get(idx, 0.0)) * tan_phi
            else:
                q_mvar = clean_float(raw_q, 0.0)

        if not bus_in_service:
            v_pu = 0.0

        zone_val = row.get("zone")
        zone_str = str(zone_val) if zone_val is not None and str(zone_val) != "nan" else "Transmission"

        buses_out.append({
            "id": int(idx),
            "name": str(row.get("name", f"Bus #{idx}")),
            "zone": zone_str,
            "vn_kv": clean_float(row.get("vn_kv"), 330.0),
            "v_pu": round(v_pu, 3),
            "va_deg": round(va_deg, 2),
            "p_mw": round(p_mw, 1),
            "q_mvar": round(q_mvar, 1),
            "is_gen": idx in gen_bus_set,
            "is_load": idx in load_bus_set,
        })

    # 8. Extract line telemetry (including physical parameters for property editing)
    has_res_line = hasattr(net, "res_line")
    lines_out = []
    for idx in net.line.index:
        l_row = net.line.loc[idx]
        in_srv = bool(l_row.get("in_service", True))
        flow_mw, loading, losses = 0.0, 0.0, 0.0

        if in_srv and has_res_line and idx in net.res_line.index:
            flow_mw = clean_float(net.res_line.at[idx, "p_from_mw"], 0.0)
            loading = clean_float(net.res_line.at[idx, "loading_percent"], 0.0)
            losses = clean_float(net.res_line.at[idx, "pl_mw"], 0.0)

        lines_out.append({
            "id": int(idx),
            "name": str(l_row.get("name", f"Line #{idx}")),
            "from_bus": int(l_row["from_bus"]),
            "to_bus": int(l_row["to_bus"]),
            "length_km": round(clean_float(l_row.get("length_km"), 1.0), 2),
            "r_ohm_per_km": round(clean_float(l_row.get("r_ohm_per_km"), 0.035), 4),
            "x_ohm_per_km": round(clean_float(l_row.get("x_ohm_per_km"), 0.32), 4),
            "max_i_ka": round(clean_float(l_row.get("max_i_ka"), 1.0), 3),
            "in_service": in_srv,
            "loading_percent": round(loading, 1),
            "flow_mw": round(flow_mw, 1),
            "p_mw": round(flow_mw, 1),
            "losses_mw": round(losses, 2),
        })

    # 9. Compute accurate system totals from generator/ext_grid/load results
    gen_res = clean_float(net.res_gen["p_mw"].sum(), 0.0) if (hasattr(net, "res_gen") and len(net.res_gen) > 0) else 0.0
    ext_res = clean_float(net.res_ext_grid["p_mw"].sum(), 0.0) if (hasattr(net, "res_ext_grid") and len(net.res_ext_grid) > 0) else 0.0
    load_res = clean_float(net.res_load["p_mw"].sum(), 0.0) if (hasattr(net, "res_load") and len(net.res_load) > 0) else 0.0
    loss_res = clean_float(net.res_line["pl_mw"].sum(), 0.0) if (has_res_line and len(net.res_line) > 0) else 0.0

    total_gen = round(max(0.0, gen_res + ext_res), 1)
    total_load = round(max(0.0, load_res), 1)
    total_losses = round(max(0.0, loss_res), 1)

    if total_gen == 0.0 and not used_dc_fallback:
        total_gen = round(sum(abs(b["p_mw"]) for b in buses_out if b["p_mw"] < 0), 1)
    if total_load == 0.0:
        total_load = round(sum(b["p_mw"] for b in buses_out if b["p_mw"] > 0), 1)

    return {
        "converged": converged,
        "model_name": model_name,
        "frequency": settings.F_NOMINAL_HZ,
        "total_gen_mw": total_gen,
        "total_load_mw": total_load,
        "total_losses_mw": total_losses,
        "buses": buses_out,
        "lines": lines_out,
        "message": solver_notice,
    }


def pd_isna(val) -> bool:
    """Checks whether a scalar value is None or NaN without importing pandas."""
    if val is None:
        return True
    try:
        return math.isnan(float(val))
    except (TypeError, ValueError):
        return False
