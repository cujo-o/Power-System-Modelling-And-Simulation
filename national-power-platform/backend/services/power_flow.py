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

# Conductor standard catalog for transmission planning
CONDUCTOR_CATALOG = {
    "Bison 330kV": {"r": 0.035, "x": 0.320, "c": 11.2, "max_i": 1.25},
    "Bear 330kV": {"r": 0.045, "x": 0.340, "c": 10.5, "max_i": 1.01},
    "Panther 132kV": {"r": 0.095, "x": 0.380, "c": 9.8, "max_i": 0.70},
    "Wolf 132kV": {"r": 0.145, "x": 0.400, "c": 9.2, "max_i": 0.55},
    "Bear 132kV": {"r": 0.085, "x": 0.360, "c": 10.0, "max_i": 0.65}
}

def solve_power_flow(
    base_net: pp.pandapowerNet = None,
    load_multiplier: float = 1.0,
    target_power_factor: float = 0.90,
    slack_voltage_pu: float = 1.05,
    shunt_mvar_compensation: float = 0.0,
    thermal_derating_factor: float = 1.0,
    tripped_lines: list = None,
    new_buses: list = None,
    new_lines: list = None,
    new_generators: list = None
):
    if tripped_lines is None:
        tripped_lines = []
    if new_buses is None:
        new_buses = []
    if new_lines is None:
        new_lines = []
    if new_generators is None:
        new_generators = []

    if base_net is None or len(base_net.bus) == 0:
        return {
            "converged": False,
            "message": "No active grid model loaded. Upload a network case to simulate.",
            "frequency": 50.0,
            "total_gen_mw": 0.0,
            "total_load_mw": 0.0,
            "total_losses_mw": 0.0,
            "buses": [],
            "lines": []
        }

    net = copy.deepcopy(base_net)

    # 1. Apply Planning Elements (Dynamic Grid Expansion)
    bus_index_offset = int(net.bus.index.max()) + 1 if len(net.bus) > 0 else 1
    added_bus_ids = {}

    for i, nb in enumerate(new_buses):
        new_id = bus_index_offset + i
        added_bus_ids[nb.name] = new_id
        # Estimate position near regional anchor
        pp.create_bus(
            net,
            vn_kv=nb.vn_kv,
            name=nb.name,
            zone=nb.zone,
            index=new_id,
            geodata=(450.0 + (i * 40), 350.0 + (i * 40))
        )
        if nb.p_mw > 0:
            pp.create_load(net, bus=new_id, p_mw=nb.p_mw, q_mvar=nb.q_mvar, name=f"Load {nb.name}")

    for nl in new_lines:
        fb = added_bus_ids.get(str(nl.from_bus), nl.from_bus)
        tb = added_bus_ids.get(str(nl.to_bus), nl.to_bus)
        if fb in net.bus.index and tb in net.bus.index:
            cond = CONDUCTOR_CATALOG.get(nl.conductor_type, CONDUCTOR_CATALOG["Bison 330kV"])
            pp.create_line_from_parameters(
                net,
                from_bus=fb,
                to_bus=tb,
                length_km=max(1.0, nl.length_km),
                r_ohm_per_km=cond["r"],
                x_ohm_per_km=cond["x"],
                c_nf_per_km=cond["c"],
                max_i_ka=cond["max_i"] * max(0.5, thermal_derating_factor),
                name=nl.name
            )

    for ng in new_generators:
        gb = added_bus_ids.get(str(ng.bus), ng.bus)
        if gb in net.bus.index:
            pp.create_gen(
                net,
                bus=gb,
                p_mw=ng.p_mw,
                vm_pu=ng.vm_pu,
                name=ng.name,
                min_p_mw=0.0,
                max_p_mw=ng.p_max_mw
            )

    # 2. Apply Engineering Variables (Load, Power Factor, Slack Voltage, Shunt, Thermal Derating)
    if len(net.load) > 0:
        net.load["p_mw"] *= max(0.1, load_multiplier)
        if 0.70 <= target_power_factor <= 1.0:
            tan_phi = math.tan(math.acos(target_power_factor))
            net.load["q_mvar"] = net.load["p_mw"] * tan_phi
        else:
            net.load["q_mvar"] *= max(0.1, load_multiplier)

    if len(net.line) > 0 and thermal_derating_factor != 1.0:
        net.line["max_i_ka"] *= max(0.5, min(1.5, thermal_derating_factor))

    # Apply Shunt Compensation (Inject MVAR into high-demand central nodes)
    if shunt_mvar_compensation != 0.0 and len(net.bus) > 0:
        target_shunt_bus = net.load.p_mw.idxmax() if len(net.load) > 0 else net.bus.index[0]
        actual_bus = net.load.at[target_shunt_bus, "bus"] if len(net.load) > 0 else target_shunt_bus
        pp.create_shunt(net, bus=actual_bus, q_mvar=-shunt_mvar_compensation, name="Switched Shunt Compensation")

    # 3. Apply N-1 Line Trips
    for line_id in tripped_lines:
        if line_id in net.line.index:
            net.line.at[line_id, "in_service"] = False

    # 4. Enforce Slack Bus Setpoint
    if len(net.ext_grid) == 0:
        if len(net.gen) > 0:
            slack_gen_idx = net.gen.p_mw.idxmax()
            slack_bus = int(net.gen.at[slack_gen_idx, "bus"])
            pp.create_ext_grid(net, bus=slack_bus, vm_pu=slack_voltage_pu, name="Auto Slack Infeed")
            net.gen.drop(slack_gen_idx, inplace=True)
        elif len(net.bus) > 0:
            pp.create_ext_grid(net, bus=net.bus.index[0], vm_pu=slack_voltage_pu, name="Auto Slack Bus")
    else:
        net.ext_grid["vm_pu"] = slack_voltage_pu

    # 5. Radial & Island Isolation
    try:
        unsupplied = top.unsupplied_buses(net)
        if len(unsupplied) > 0:
            net.bus.loc[list(unsupplied), "in_service"] = False
    except Exception:
        pass

    # 6. Multi-Pass Numerical Solver
    converged = False
    solver_notice = "AC Newton-Raphson Solved."

    try:
        pp.runpp(net, algorithm="nr", init="auto", max_iteration=45, tolerance_mva=1e-3, numba=False)
        converged = bool(net.converged)
    except Exception:
        converged = False

    if not converged:
        try:
            pp.runpp(net, algorithm="nr", init="flat", max_iteration=50, tolerance_mva=1e-3, numba=False)
            converged = bool(net.converged)
            if converged:
                solver_notice = "Solved via Flat-Start Newton-Raphson."
        except Exception:
            converged = False

    if not converged:
        try:
            pp.rundcpp(net, numba=False)
            converged = True
            solver_notice = "Grid stressed. Solved via DC Linearized Load Flow."
        except Exception as e:
            converged = False
            solver_notice = f"System non-convergence: {str(e)}"

    gen_buses = set(net.gen.bus) if len(net.gen) > 0 else set()
    if len(net.ext_grid) > 0:
        gen_buses = gen_buses.union(set(net.ext_grid.bus))
    load_buses = set(net.load.bus) if len(net.load) > 0 else set()

    buses = []
    for idx, row in net.bus.iterrows():
        gx = float(net.bus_geodata.at[idx, "x"]) if hasattr(net, "bus_geodata") and idx in net.bus_geodata.index else 250.0
        gy = float(net.bus_geodata.at[idx, "y"]) if hasattr(net, "bus_geodata") and idx in net.bus_geodata.index else 250.0

        vm_pu = 1.0
        va_deg = 0.0
        p_mw = 0.0
        q_mvar = 0.0

        if hasattr(net, "res_bus") and idx in net.res_bus.index:
            vm_pu = clean_float(net.res_bus.at[idx, "vm_pu"], 1.0)
            va_deg = clean_float(net.res_bus.at[idx, "va_degree"], 0.0)
            p_mw = clean_float(net.res_bus.at[idx, "p_mw"], 0.0)
            q_mvar = clean_float(net.res_bus.at[idx, "q_mvar"], 0.0)

        if not bool(net.bus.at[idx, "in_service"]):
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
    for idx, row in net.line.iterrows():
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