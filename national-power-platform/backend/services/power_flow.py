import copy
import math
import numpy as np
import pandapower as pp
import pandapower.topology as top
from config import settings

def clean_float(val, fallback: float = 0.0) -> float:
    try:
        f = float(val)
        return fallback if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return fallback

def solve_power_flow(base_net: pp.pandapowerNet, load_multiplier: float = 1.0, tripped_lines: list = None):
    if tripped_lines is None:
        tripped_lines = []

    net = copy.deepcopy(base_net)

    # 1. Scale Load & Generation
    if load_multiplier != 1.0 and len(net.load) > 0:
        net.load["p_mw"] *= load_multiplier
        net.load["q_mvar"] *= load_multiplier

    # 2. Apply N-1 Line Trips
    for line_id in tripped_lines:
        if line_id in net.line.index:
            net.line.at[line_id, "in_service"] = False

    # 3. Ensure a Slack Bus / External Grid exists (Critical for arbitrary test models)
    if len(net.ext_grid) == 0:
        if len(net.gen) > 0:
            slack_gen_idx = net.gen.p_mw.idxmax()
            slack_bus = int(net.gen.at[slack_gen_idx, "bus"])
            slack_vm = float(net.gen.at[slack_gen_idx, "vm_pu"]) if "vm_pu" in net.gen.columns else 1.05
            pp.create_ext_grid(net, bus=slack_bus, vm_pu=slack_vm, name="Auto-Assigned Slack Grid")
            net.gen.drop(slack_gen_idx, inplace=True)
        elif len(net.bus) > 0:
            pp.create_ext_grid(net, bus=net.bus.index[0], vm_pu=1.03, name="Auto-Assigned Slack Grid")

    # 4. Handle Disconnected Islands / Unsupplied 132kV Radials
    try:
        unsupplied = top.unsupplied_buses(net)
        if len(unsupplied) > 0:
            net.bus.loc[list(unsupplied), "in_service"] = False
    except Exception:
        pass

    # 5. Multi-Pass Robust Solver Pipeline
    converged = False
    solver_notice = "AC Newton-Raphson Solved."

    # Pass A: Standard Newton-Raphson
    try:
        pp.runpp(net, algorithm="nr", init="auto", max_iteration=45, tolerance_mva=1e-3, numba=False)
        converged = bool(net.converged)
    except Exception:
        converged = False

    # Pass B: Flat-Start Newton-Raphson (recovers depressed 132kV voltages)
    if not converged:
        try:
            pp.runpp(net, algorithm="nr", init="flat", max_iteration=50, tolerance_mva=1e-3, numba=False)
            converged = bool(net.converged)
            if converged:
                solver_notice = "Solved via Flat-Start Newton-Raphson."
        except Exception:
            converged = False

    # Pass C: Fast Decoupled Load Flow
    if not converged:
        try:
            pp.runpp(net, algorithm="fdxb", max_iteration=60, tolerance_mva=1e-2, numba=False)
            converged = bool(net.converged)
            if converged:
                solver_notice = "Solved via Fast-Decoupled AC."
        except Exception:
            converged = False

    # Pass D: Linearized DC Power Flow Fallback (Guarantees solution for ill-conditioned test models)
    if not converged:
        try:
            pp.rundcpp(net, numba=False)
            converged = True
            solver_notice = "AC flow reached nose-point on 132kV radials. Solved via DC Linearized Load Flow."
        except Exception as e:
            converged = False
            solver_notice = f"System non-convergence: {str(e)}"

    # 6. Extract Telemetry (NEVER RETURN EMPTY ARRAYS)
    gen_buses = set(net.gen.bus) if len(net.gen) > 0 else set()
    if len(net.ext_grid) > 0:
        gen_buses = gen_buses.union(set(net.ext_grid.bus))
    load_buses = set(net.load.bus) if len(net.load) > 0 else set()

    buses = []
    for idx, row in base_net.bus.iterrows():
        gx = float(base_net.bus_geodata.at[idx, "x"]) if hasattr(base_net, "bus_geodata") and idx in base_net.bus_geodata.index else 250.0
        gy = float(base_net.bus_geodata.at[idx, "y"]) if hasattr(base_net, "bus_geodata") and idx in base_net.bus_geodata.index else 250.0

        vm_pu = 1.0
        va_deg = 0.0
        p_mw = 0.0
        q_mvar = 0.0

        if hasattr(net, "res_bus") and idx in net.res_bus.index:
            vm_raw = net.res_bus.at[idx, "vm_pu"] if "vm_pu" in net.res_bus.columns else 1.0
            va_raw = net.res_bus.at[idx, "va_degree"] if "va_degree" in net.res_bus.columns else 0.0
            p_raw = net.res_bus.at[idx, "p_mw"] if "p_mw" in net.res_bus.columns else 0.0
            q_raw = net.res_bus.at[idx, "q_mvar"] if "q_mvar" in net.res_bus.columns else 0.0

            vm_pu = clean_float(vm_raw, 1.0)
            va_deg = clean_float(va_raw, 0.0)
            p_mw = clean_float(p_raw, 0.0)
            q_mvar = clean_float(q_raw, 0.0)

        # Check if bus is unsupplied/out of service
        if idx in net.bus.index and not bool(net.bus.at[idx, "in_service"]):
            vm_pu = 0.0

        buses.append({
            "id": int(idx),
            "name": str(row.get("name", f"Bus {idx}")),
            "zone": str(row.get("zone", "Transmission")),
            "vn_kv": float(row.get("vn_kv", 330.0)),
            "x": gx,
            "y": gy,
            "v_pu": round(vm_pu, 3),
            "va_deg": round(va_deg, 2),
            "p_mw": round(p_mw, 1),
            "q_mvar": round(q_mvar, 1),
            "is_gen": (idx in gen_buses),
            "is_load": (idx in load_buses),
        })

    lines = []
    for idx, row in base_net.line.iterrows():
        is_in = bool(row["in_service"]) and (idx not in tripped_lines)
        loading = 0.0
        flow = 0.0
        ploss = 0.0

        if is_in and hasattr(net, "res_line") and idx in net.res_line.index:
            loading = clean_float(net.res_line.at[idx, "loading_percent"], 0.0)
            flow = clean_float(net.res_line.at[idx, "p_from_mw"], 0.0)
            ploss = clean_float(net.res_line.at[idx, "pl_mw"], 0.0)

        lines.append({
            "id": int(idx),
            "name": str(row.get("name", f"Line {row['from_bus']}-{row['to_bus']}")),
            "from_bus": int(row["from_bus"]),
            "to_bus": int(row["to_bus"]),
            "in_service": is_in,
            "loading_percent": round(loading, 1),
            "flow_mw": round(flow, 1),
            "losses_mw": round(ploss, 2),
        })

    # Summary Power Balance
    gen_sum = float(net.res_gen.p_mw.sum()) if hasattr(net, "res_gen") and len(net.res_gen) > 0 else 0.0
    ext_sum = float(net.res_ext_grid.p_mw.sum()) if hasattr(net, "res_ext_grid") and len(net.res_ext_grid) > 0 else 0.0
    total_gen = round(clean_float(gen_sum + ext_sum, 0.0), 1)
    total_load = round(clean_float(net.res_load.p_mw.sum() if hasattr(net, "res_load") and len(net.res_load) > 0 else 0.0), 1)
    total_losses = round(clean_float(net.res_line.pl_mw.sum() if hasattr(net, "res_line") and len(net.res_line) > 0 else 0.0), 1)

    imbalance = total_gen - total_load - total_losses
    frequency = round(settings.F_NOMINAL_HZ + (imbalance / settings.GRID_STIFFNESS_MW_PER_HZ), 2)

    return {
        "converged": converged,
        "message": solver_notice,
        "frequency": frequency,
        "total_gen_mw": total_gen,
        "total_load_mw": total_load,
        "total_losses_mw": total_losses,
        "buses": buses,
        "lines": lines,
    }