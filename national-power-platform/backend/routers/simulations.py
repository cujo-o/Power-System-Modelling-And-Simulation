from fastapi import APIRouter
from models.schemas import SimulationRequest, DynamicSimRequest, MarketSimulationRequest
from services.power_flow import solve_power_flow
from services.dynamics import simulate_transient_swing
from services.market import solve_market_dispatch

def get_sim_router(model_registry: dict, get_active_fn):
    router = APIRouter(prefix="/api/simulate", tags=["Simulations"])

    @router.post("/power-flow")
    def run_power_flow(req: SimulationRequest):
        net, name = get_active_fn()
        res = solve_power_flow(net, req.load_multiplier, req.tripped_lines)
        res["model_name"] = name
        return res

    @router.post("/dynamics")
    def run_dynamic_sim(req: DynamicSimRequest):
        return simulate_transient_swing(
            req.disturbance_mw, req.inertia_constant_H, req.enable_governor,
            req.droop_R, req.enable_pss, req.pss_gain_K
        )

    @router.post("/market-dispatch")
    def run_market_sim(req: MarketSimulationRequest):
        net, _ = get_active_fn()
        return solve_market_dispatch(net, req.load_multiplier, req.gas_price_factor, req.hydro_availability)

    return router