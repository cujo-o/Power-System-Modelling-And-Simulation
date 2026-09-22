import copy
import networkx as nx
import pandapower as pp
import pandapower.topology as top
from services.power_flow import solve_power_flow

def run_cascading_simulation(
    base_net: pp.pandapowerNet,
    initial_tripped_lines: list,
    overload_threshold_percent: float = 100.0,
    max_cascade_steps: int = 8,
    load_multiplier: float = 1.0,
    slack_voltage_pu: float = 1.05,
    target_power_factor: float = 0.90
) -> dict:
    """
    Simulates sequential cascading line outages and network islanding following
    an initial disturbance or contingency.
    """
    if base_net is None or len(base_net.bus) == 0:
        return {
            "status": "NO_MODEL",
            "message": "No active grid model to simulate cascade.",
            "total_steps": 0,
            "timeline": [],
            "islands": [],
            "all_tripped_lines": [],
            "converged": False
        }

    net = copy.deepcopy(base_net)
    all_tripped = list(initial_tripped_lines)
    timeline = []
    
    # Step 0: Record initial disturbance
    step = 0
    current_sol = solve_power_flow(
        base_net=net,
        load_multiplier=load_multiplier,
        target_power_factor=target_power_factor,
        slack_voltage_pu=slack_voltage_pu,
        tripped_lines=all_tripped
    )

    initial_names = [
        str(net.line.at[lid, "name"]) if lid in net.line.index else f"Line {lid}"
        for lid in initial_tripped_lines
    ]

    timeline.append({
        "step": step,
        "event_type": "INITIAL_TRIP",
        "description": f"Initial outage applied: {', '.join(initial_names) if initial_names else 'None'}",
        "tripped_in_this_step": initial_tripped_lines,
        "total_tripped_so_far": list(all_tripped),
        "converged": current_sol["converged"],
        "max_loading_percent": max([l["loading_percent"] for l in current_sol["lines"]], default=0.0),
        "total_losses_mw": current_sol["total_losses_mw"],
        "frequency_hz": current_sol["frequency"]
    })

    # Cascading Loop
    grid_stabilized = False

    while step < max_cascade_steps and not grid_stabilized:
        step += 1
        
        # Check in-service lines for thermal overloads
        overloaded_lines = [
            l for l in current_sol["lines"]
            if l["in_service"] and l["loading_percent"] >= overload_threshold_percent
        ]

        if not overloaded_lines:
            grid_stabilized = True
            break

        # Sort by most severe overload first
        overloaded_lines.sort(key=lambda x: x["loading_percent"], reverse=True)
        
        # Trip the top overloaded lines (protection relay trip)
        lines_to_trip = [l["id"] for l in overloaded_lines[:2]]  # Trip up to 2 worst simultaneously
        all_tripped.extend(lines_to_trip)
        all_tripped = list(set(all_tripped))

        # Re-solve power flow under the new degraded topology
        current_sol = solve_power_flow(
            base_net=net,
            load_multiplier=load_multiplier,
            target_power_factor=target_power_factor,
            slack_voltage_pu=slack_voltage_pu,
            tripped_lines=all_tripped
        )

        tripped_names = [
            f"{l['name']} ({l['loading_percent']}%)"
            for l in overloaded_lines[:2]
        ]

        timeline.append({
            "step": step,
            "event_type": "OVERLOAD_CASCADE",
            "description": f"Overcurrent relay tripped: {', '.join(tripped_names)}",
            "tripped_in_this_step": lines_to_trip,
            "total_tripped_so_far": list(all_tripped),
            "converged": current_sol["converged"],
            "max_loading_percent": max([l["loading_percent"] for l in current_sol["lines"]], default=0.0),
            "total_losses_mw": current_sol["total_losses_mw"],
            "frequency_hz": current_sol["frequency"]
        })

        if not current_sol["converged"]:
            # Voltage collapse or island separation halted iteration
            break

    # Analyze Topological Islanding using NetworkX
    active_net = copy.deepcopy(net)
    for lid in all_tripped:
        if lid in active_net.line.index:
            active_net.line.at[lid, "in_service"] = False

    island_details = []
    try:
        nx_graph = top.create_nxgraph(active_net, respect_switches=True, in_service_only=True)
        connected_groups = list(nx.connected_components(nx_graph))

        for idx, bus_set in enumerate(connected_groups):
            b_ids = [int(b) for b in bus_set if b in active_net.bus.index]
            if not b_ids:
                continue

            # Compute generation and load inside this specific island
            p_gen_island = float(active_net.gen[active_net.gen.bus.isin(b_ids)]["p_mw"].sum()) if len(active_net.gen) > 0 else 0.0
            if len(active_net.ext_grid) > 0:
                p_gen_island += float(active_net.ext_grid[active_net.ext_grid.bus.isin(b_ids)]["p_mw"].sum())

            p_load_island = float(active_net.load[active_net.load.bus.isin(b_ids)]["p_mw"].sum()) if len(active_net.load) > 0 else 0.0
            
            # Determine Island Status
            if p_gen_island == 0.0 and p_load_island > 0.0:
                status = "BLACKOUT_ISLAND"  # Zero generation = instant de-energization
            elif p_load_island > p_gen_island * 1.5:
                status = "DEFICIT_COLLAPSE"  # Severe under-frequency collapse
            else:
                status = "SYNCHRONOUS_ONLINE"  # Island can self-sustain

            bus_names = [str(active_net.bus.at[b, "name"]) for b in b_ids[:6]]
            island_details.append({
                "island_id": idx + 1,
                "bus_count": len(b_ids),
                "generation_mw": round(p_gen_island, 1),
                "demand_mw": round(p_load_island, 1),
                "status": status,
                "sample_buses": bus_names
            })
    except Exception as e:
        island_details.append({
            "island_id": 1,
            "bus_count": len(base_net.bus),
            "generation_mw": current_sol["total_gen_mw"],
            "demand_mw": current_sol["total_load_mw"],
            "status": "SYNCHRONOUS_ONLINE",
            "sample_buses": ["Grid unified"]
        })

    # Overall Status Classification
    blackout_islands = [i for i in island_details if i["status"] != "SYNCHRONOUS_ONLINE"]
    if len(island_details) > 1 and len(blackout_islands) == len(island_details):
        overall_status = "TOTAL_BLACKOUT"
    elif len(island_details) > 1 or len(blackout_islands) > 0:
        overall_status = "PARTIAL_SYSTEM_COLLAPSE"
    else:
        overall_status = "STABILIZED_POST_CONTINGENCY"

    return {
        "status": overall_status,
        "total_steps": len(timeline) - 1,
        "timeline": timeline,
        "islands": island_details,
        "all_tripped_lines": all_tripped,
        "final_sol": current_sol,
        "converged": current_sol["converged"]
    }