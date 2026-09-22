import copy
import pandapower as pp
from services.power_flow import clean_float

def solve_market_dispatch(base_net: pp.pandapowerNet = None, load_multiplier: float = 1.0, gas_price_factor: float = 1.0, hydro_availability: float = 1.0):
    if base_net is None or (len(base_net.gen) == 0 and len(base_net.ext_grid) == 0):
        return {
            "converged": True,
            "market_clearing_price_ngn": 0.0,
            "total_dispatched_mw": 0.0,
            "total_hourly_cost_ngn": 0.0,
            "hydro_share_percent": 0.0,
            "thermal_share_percent": 0.0,
            "merit_order": [],
            "buses_lmp": []
        }

    net = copy.deepcopy(base_net)
    hydro_base_cost = round(19500.0 / max(0.2, hydro_availability), 2)
    gas_base_cost = round(48000.0 * max(0.5, gas_price_factor), 2)

    generators_dispatch = []
    total_hourly_cost_ngn = 0.0

    # Dispatch standard generators
    for idx, row in net.gen.iterrows():
        name = str(row.get("name", f"Generator {idx}"))
        is_hydro = "hydro" in name.lower() or "gs" in name.lower() and "thermal" not in name.lower()
        marginal_cost = hydro_base_cost if is_hydro else gas_base_cost
        gen_type = "Hydro" if is_hydro else "Thermal Gas"

        p_rated = float(row.get("max_p_mw", row.get("p_mw", 100.0) * 1.5))
        dispatched_mw = float(row.get("p_mw", 50.0)) * load_multiplier
        hourly_cost = dispatched_mw * marginal_cost
        total_hourly_cost_ngn += hourly_cost

        generators_dispatch.append({
            "id": int(idx),
            "name": name,
            "type": gen_type,
            "marginal_cost": marginal_cost,
            "dispatched_mw": round(dispatched_mw, 1),
            "max_mw": round(p_rated, 1),
            "capacity_utilization": round((dispatched_mw / max(1.0, p_rated)) * 100.0, 1),
            "hourly_cost_ngn": round(hourly_cost, 2),
        })

    # Dispatch external slack grid
    for idx, row in net.ext_grid.iterrows():
        name = str(row.get("name", f"Slack Infeed {idx}"))
        dispatched_mw = 350.0 * load_multiplier
        hourly_cost = dispatched_mw * gas_base_cost
        total_hourly_cost_ngn += hourly_cost

        generators_dispatch.append({
            "id": 900 + int(idx),
            "name": name,
            "type": "Base/Slack Thermal",
            "marginal_cost": gas_base_cost,
            "dispatched_mw": round(dispatched_mw, 1),
            "max_mw": 1200.0,
            "capacity_utilization": round((dispatched_mw / 1200.0) * 100.0, 1),
            "hourly_cost_ngn": round(hourly_cost, 2),
        })

    generators_dispatch.sort(key=lambda g: g["marginal_cost"])
    total_dispatched = sum(g["dispatched_mw"] for g in generators_dispatch)
    clearing_price = max([g["marginal_cost"] for g in generators_dispatch]) if generators_dispatch else gas_base_cost

    buses_lmp = []
    for idx, row in net.bus.iterrows():
        zone = str(row.get("zone", "Transmission"))
        adder = clearing_price * 0.05 if "South" in zone else -clearing_price * 0.03
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