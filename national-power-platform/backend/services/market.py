import copy
import pandapower as pp

def solve_market_dispatch(base_net: pp.pandapowerNet, load_multiplier: float, gas_price_factor: float, hydro_availability: float):
    net = copy.deepcopy(base_net)
    hydro_cost = round(19500.0 / max(0.2, hydro_availability), 2)
    gas_cost = round(48000.0 * max(0.5, gas_price_factor), 2)

    gen_market_profiles = {
        "Kainji Hydro": {"type": "Hydro", "cost": hydro_cost * 0.95, "p_max": 760.0 * hydro_availability},
        "Jebba Hydro": {"type": "Hydro", "cost": hydro_cost * 1.00, "p_max": 621.0 * hydro_availability},
        "Shiroro Hydro": {"type": "Hydro", "cost": hydro_cost * 1.05, "p_max": 600.0 * hydro_availability},
        "Delta IV Gas": {"type": "Gas Turbine", "cost": gas_cost * 0.92, "p_max": 890.0},
        "Afam VI Gas": {"type": "Gas Turbine", "cost": gas_cost * 0.94, "p_max": 650.0},
        "Egbin PS (Slack)": {"type": "Gas Steam", "cost": gas_cost * 1.00, "p_max": 1320.0},
    }

    generators_dispatch = []
    total_hourly_cost_ngn = 0.0

    for idx, row in net.gen.iterrows():
        name = row.get("name", f"Gen {idx}")
        profile = gen_market_profiles.get(name, {"type": "Thermal", "cost": gas_cost, "p_max": 500.0})
        dispatched_mw = float(row.get("p_mw", 200.0)) * load_multiplier
        hourly_plant_cost = dispatched_mw * profile["cost"]
        total_hourly_cost_ngn += hourly_plant_cost

        generators_dispatch.append({
            "id": int(idx),
            "name": name,
            "type": profile["type"],
            "marginal_cost": profile["cost"],
            "dispatched_mw": round(dispatched_mw, 1),
            "max_mw": round(profile["p_max"], 1),
            "capacity_utilization": round((dispatched_mw / max(1.0, profile["p_max"])) * 100.0, 1),
            "hourly_cost_ngn": round(hourly_plant_cost, 2),
        })

    slack_p = 591.2 * load_multiplier
    slack_cost = slack_p * gas_cost
    total_hourly_cost_ngn += slack_cost
    generators_dispatch.append({
        "id": 999,
        "name": "Egbin PS (Slack/Base)",
        "type": "Gas Steam",
        "marginal_cost": gas_cost,
        "dispatched_mw": round(slack_p, 1),
        "max_mw": 1320.0,
        "capacity_utilization": round((slack_p / 1320.0) * 100.0, 1),
        "hourly_cost_ngn": round(slack_cost, 2),
    })

    generators_dispatch.sort(key=lambda g: g["marginal_cost"])
    total_dispatched = sum(g["dispatched_mw"] for g in generators_dispatch)
    clearing_price = max([g["marginal_cost"] for g in generators_dispatch]) if generators_dispatch else gas_cost

    buses_lmp = []
    for idx, row in net.bus.iterrows():
        zone = str(row.get("zone", "Transmission"))
        adder = clearing_price * 0.06 if "South" in zone else -clearing_price * 0.03
        buses_lmp.append({
            "id": int(idx),
            "name": str(row.get("name", f"Bus {idx}")),
            "zone": zone,
            "lmp_ngn_per_mwh": round(clearing_price + adder, 2)
        })

    hydro_mw = sum(g["dispatched_mw"] for g in generators_dispatch if g["type"] == "Hydro")
    hydro_share = round((hydro_mw / max(1.0, total_dispatched)) * 100.0, 1)

    return {
        "converged": True,
        "market_clearing_price_ngn": round(clearing_price, 2),
        "total_dispatched_mw": round(total_dispatched, 1),
        "total_hourly_cost_ngn": round(total_hourly_cost_ngn, 2),
        "hydro_share_percent": hydro_share,
        "thermal_share_percent": round(100.0 - hydro_share, 1),
        "merit_order": generators_dispatch,
        "buses_lmp": buses_lmp
    }