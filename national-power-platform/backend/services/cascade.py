"""Sequential cascading thermal outage and islanding simulator."""

import copy
from typing import List, Optional

import networkx as nx
import pandapower as pp

from models.schemas import PowerFlowVariables
from services.power_flow import clean_float, solve_power_flow


def run_cascading_simulation(
    base_net: Optional[pp.pandapowerNet],
    model_name: str = "Active Model",
    initial_tripped_lines: Optional[List[int]] = None,
    overload_threshold_percent: float = 100.0,
    max_cascade_steps: int = 8,
    load_multiplier: float = 1.0,
    slack_voltage_pu: float = 1.05,
    target_power_factor: float = 0.90,
) -> dict:
    """
    Simulates sequential overcurrent relay trips following an initial branch outage.

    At each stage, up to two most severely overloaded lines (`loading >= threshold`)
    are tripped and steady-state power flow is re-evaluated until the network
    stabilizes, diverges, or hits `max_cascade_steps`. Post-cascade connected
    components are then analyzed via NetworkX to identify electrical islands.
    """
    if base_net is None or len(base_net.bus) == 0:
        return {
            "status": "NO_MODEL",
            "message": "No active grid model in memory.",
            "total_steps": 0,
            "timeline": [],
            "islands": [],
            "all_tripped_lines": [],
            "converged": False,
        }

    pf_vars = PowerFlowVariables(
        loadMultiplier=load_multiplier,
        slackVoltagePu=slack_voltage_pu,
        targetPowerFactor=target_power_factor,
    )

    initial_list = list(dict.fromkeys(initial_tripped_lines or []))
    all_tripped = list(initial_list)
    timeline = []

    # Step 0: Apply initiating contingency and evaluate post-contingency flow
    current_sol = solve_power_flow(
        base_net=base_net,
        model_name=model_name,
        pf_variables=pf_vars,
        tripped_lines=all_tripped,
    )

    initial_names = [
        str(base_net.line.at[lid, "name"]) if lid in base_net.line.index else f"Line #{lid}"
        for lid in initial_list
    ]
    timeline.append({
        "step": 0,
        "event_type": "INITIAL_TRIP",
        "description": f"Initial contingency: {', '.join(initial_names) if initial_names else 'None'}",
        "tripped_in_this_step": list(initial_list),
        "total_tripped_so_far": list(all_tripped),
        "converged": current_sol["converged"],
        "max_loading_percent": max((l["loading_percent"] for l in current_sol["lines"]), default=0.0),
        "total_losses_mw": current_sol["total_losses_mw"],
        "frequency_hz": current_sol["frequency"],
    })

    # Sequential overcurrent tripping stages
    for step in range(1, max_cascade_steps + 1):
        if not current_sol["converged"]:
            break

        overloaded = [
            line
            for line in current_sol["lines"]
            if line["in_service"] and line["loading_percent"] >= overload_threshold_percent
        ]
        if not overloaded:
            break

        overloaded.sort(key=lambda item: item["loading_percent"], reverse=True)
        batch = overloaded[:2]
        newly_tripped = [int(item["id"]) for item in batch]
        for lid in newly_tripped:
            if lid not in all_tripped:
                all_tripped.append(lid)

        current_sol = solve_power_flow(
            base_net=base_net,
            model_name=model_name,
            pf_variables=pf_vars,
            tripped_lines=all_tripped,
        )

        trip_labels = [f"{item['name']} ({item['loading_percent']}%)" for item in batch]
        timeline.append({
            "step": step,
            "event_type": "OVERLOAD_CASCADE",
            "description": f"Overcurrent trip: {', '.join(trip_labels)}",
            "tripped_in_this_step": newly_tripped,
            "total_tripped_so_far": list(all_tripped),
            "converged": current_sol["converged"],
            "max_loading_percent": max((l["loading_percent"] for l in current_sol["lines"]), default=0.0),
            "total_losses_mw": current_sol["total_losses_mw"],
            "frequency_hz": current_sol["frequency"],
        })

    # Topological island analysis on post-cascade network
    post_net = copy.deepcopy(base_net)
    for lid in all_tripped:
        if lid in post_net.line.index:
            post_net.line.at[lid, "in_service"] = False

    island_details = []
    try:
        # Build connectivity graph directly from in-service buses, lines, and transformers
        graph = nx.Graph()
        for b_id, row in post_net.bus.iterrows():
            if bool(row.get("in_service", True)):
                graph.add_node(int(b_id))

        if hasattr(post_net, "line") and len(post_net.line) > 0:
            for _, row in post_net.line.iterrows():
                if bool(row.get("in_service", True)):
                    u, v = int(row["from_bus"]), int(row["to_bus"])
                    if u in graph and v in graph:
                        graph.add_edge(u, v)

        if hasattr(post_net, "trafo") and len(post_net.trafo) > 0:
            for _, row in post_net.trafo.iterrows():
                if bool(row.get("in_service", True)):
                    u, v = int(row["hv_bus"]), int(row["lv_bus"])
                    if u in graph and v in graph:
                        graph.add_edge(u, v)

        for idx, component in enumerate(nx.connected_components(graph), start=1):
            b_ids = [int(b) for b in component if b in post_net.bus.index]
            if not b_ids:
                continue

            p_gen = (
                clean_float(post_net.gen[post_net.gen["bus"].isin(b_ids)]["p_mw"].sum())
                if len(post_net.gen) > 0
                else 0.0
            )
            has_slack = len(post_net.ext_grid) > 0 and bool(post_net.ext_grid["bus"].isin(b_ids).any())
            if has_slack and hasattr(post_net, "res_ext_grid") and len(post_net.res_ext_grid) > 0:
                slack_rows = post_net.ext_grid[post_net.ext_grid["bus"].isin(b_ids)].index
                p_gen += clean_float(post_net.res_ext_grid.loc[post_net.res_ext_grid.index.intersection(slack_rows), "p_mw"].abs().sum())

            p_load = (
                clean_float(post_net.load[post_net.load["bus"].isin(b_ids)]["p_mw"].sum()) * load_multiplier
                if len(post_net.load) > 0
                else 0.0
            )

            if not has_slack and p_gen <= 0.0 and p_load > 0.0:
                island_status = "BLACKOUT_ISLAND"
            elif not has_slack and p_load > p_gen * 1.5:
                island_status = "DEFICIT_COLLAPSE"
            else:
                island_status = "SYNCHRONOUS_ONLINE"

            island_details.append({
                "island_id": idx,
                "bus_count": len(b_ids),
                "generation_mw": round(p_gen, 1),
                "demand_mw": round(p_load, 1),
                "status": island_status,
                "sample_buses": [str(post_net.bus.at[b, "name"]) for b in b_ids[:6]],
            })
    except Exception:
        island_details = []

    degraded_islands = [isl for isl in island_details if isl["status"] != "SYNCHRONOUS_ONLINE"]
    if island_details and len(degraded_islands) == len(island_details):
        overall_status = "TOTAL_BLACKOUT"
    elif len(island_details) > 1 or degraded_islands or len(all_tripped) >= max(1, int(len(base_net.line) * 0.4)):
        overall_status = "PARTIAL_SYSTEM_COLLAPSE"
    else:
        overall_status = "STABILIZED_POST_CONTINGENCY"

    return {
        "status": overall_status,
        "total_steps": max(0, len(timeline) - 1),
        "timeline": timeline,
        "islands": island_details,
        "all_tripped_lines": all_tripped,
        "converged": current_sol["converged"],
    }
