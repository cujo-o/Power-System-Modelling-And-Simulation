import copy
import math
import pandapower as pp
from config import settings

def clean_float(val, fallback: float = 0.0) -> float:
    try:
        f = float(val)
        return fallback if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return fallback

def solve_power_flow(base_net: pp.pandapowerNet, load_multiplier: float, tripped_lines: list):
    net = copy.deepcopy(base_net)

    if load_multiplier != 1.0 and len(net.load) > 0:
        net.load["p_mw"] *= load_multiplier
        net.load["q_mvar"] *= load_multiplier

    for line_id in tripped_lines:
        if line_id in net.line.index:
            net.line.at[line_id, "in_service"] = False

    try:
        pp.runpp(net, algorithm="nr", max_iteration=35, tolerance_mva=1e-3, numba=False)
        converged = bool(net.converged)
    except Exception:
        converged = False

    if not converged:
        return {
            "converged": False,
            "message": "Power flow diverged under the current contingency state.",
            "buses": [],
            "lines": [],
            "frequency": 49.20,
            "total_gen_mw": 0.0,
            "total_load_mw": 0.0,
            "total_losses_mw": 0.0
        }

    # Identify which buses hold generators or loads
    gen_buses = set(net.gen.bus) if len(net.gen) > 0 else set()
    if len(net.ext_grid) > 0:
        gen_buses = gen_buses.union(set(net.ext_grid.bus))
    load_buses = set(net.load.bus) if len(net.load) > 0 else set()

    buses = []
    for idx, row in net.bus.iterrows():
        gx = float(net.bus_geodata.at[idx, "x"]) if hasattr(net, "bus_geodata") and idx in net.bus_geodata.index else 250.0
        gy = float(net.bus_geodata.at[idx, "y"]) if hasattr(net, "bus_geodata") and idx in net.bus_geodata.index else 250.0
        vm_pu = float(net.res_bus.at[idx, "vm_pu"]) if hasattr(net, "res_bus") and idx in net.res_bus.index else 1.0
        va_deg = float(net.res_bus.at[idx, "va_degree"]) if hasattr(net, "res_bus") and idx in net.res_bus.index else 0.0
        p_mw = float(net.res_bus.at[idx, "p_mw"]) if hasattr(net, "res_bus") and idx in net.res_bus.index else 0.0
        q_mvar = float(net.res_bus.at[idx, "q_mvar"]) if hasattr(net, "res_bus") and idx in net.res_bus.index else 0.0
        vn_kv = float(row.get("vn_kv", 330.0))

        buses.append({
            "id": int(idx),
            "name": str(row.get("name", f"Bus {idx}")),
            "zone": str(row.get("zone", "Substation")),
            "vn_kv": vn_kv,
            "x": gx,
            "y": gy,
            "v_pu": round(clean_float(vm_pu, 1.0), 3),
            "va_deg": round(clean_float(va_deg, 0.0), 2),
            "p_mw": round(clean_float(p_mw, 0.0), 1),
            "q_mvar": round(clean_float(q_mvar, 0.0), 1),
            "is_gen": (idx in gen_buses),
            "is_load": (idx in load_buses)
        })

    lines = []
    for idx, row in net.line.iterrows():
        is_in = bool(row["in_service"])
        loading = round(clean_float(net.res_line.at[idx, "loading_percent"], 0.0), 1) if is_in and hasattr(net, "res_line") and idx in net.res_line.index else 0.0
        flow = round(clean_float(net.res_line.at[idx, "p_from_mw"], 0.0), 1) if is_in and hasattr(net, "res_line") and idx in net.res_line.index else 0.0
        ploss = round(clean_float(net.res_line.at[idx, "pl_mw"], 0.0), 2) if is_in and hasattr(net, "res_line") and idx in net.res_line.index else 0.0

        lines.append({
            "id": int(idx),
            "name": str(row.get("name", f"Line {row['from_bus']}-{row['to_bus']}")),
            "from_bus": int(row["from_bus"]),
            "to_bus": int(row["to_bus"]),
            "in_service": is_in,
            "loading_percent": loading,
            "flow_mw": flow,
            "losses_mw": ploss
        })

    gen_sum = float(net.res_gen.p_mw.sum()) if hasattr(net, "res_gen") and len(net.res_gen) > 0 else 0.0
    ext_sum = float(net.res_ext_grid.p_mw.sum()) if hasattr(net, "res_ext_grid") and len(net.res_ext_grid) > 0 else 0.0
    total_gen = round(clean_float(gen_sum + ext_sum, 0.0), 1)
    total_load = round(clean_float(net.res_load.p_mw.sum() if hasattr(net, "res_load") and len(net.res_load) > 0 else 0.0), 1)
    total_losses = round(clean_float(net.res_line.pl_mw.sum() if hasattr(net, "res_line") and len(net.res_line) > 0 else 0.0), 1)

    imbalance = total_gen - total_load - total_losses
    frequency = round(settings.F_NOMINAL_HZ + (imbalance / settings.GRID_STIFFNESS_MW_PER_HZ), 2)

    return {
        "converged": True,
        "frequency": frequency,
        "total_gen_mw": total_gen,
        "total_load_mw": total_load,
        "total_losses_mw": total_losses,
        "buses": buses,
        "lines": lines
    }