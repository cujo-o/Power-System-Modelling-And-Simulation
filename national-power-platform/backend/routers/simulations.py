from fastapi import APIRouter
from models.schemas import (
    SimulationRequest,
    DynamicSimRequest,
    MarketSimulationRequest,
    CascadeSimulationRequest,
    MultiMachineSimRequest
)
from services.power_flow import solve_power_flow
from services.dynamics import simulate_transient_swing
from services.market import solve_market_dispatch
from services.cascade import run_cascading_simulation
from services.multi_machine import simulate_multi_machine

def get_sim_router(model_registry: dict, get_active_fn):
    router = APIRouter(prefix="/api/simulate", tags=["Simulations"])

    @router.post("/power-flow")
    def run_power_flow(req: SimulationRequest):
        net, name = get_active_fn()
        res = solve_power_flow(
            base_net=net,
            load_multiplier=req.load_multiplier,
            target_power_factor=req.target_power_factor,
            slack_voltage_pu=req.slack_voltage_pu,
            shunt_mvar_compensation=req.shunt_mvar_compensation,
            thermal_derating_factor=req.thermal_derating_factor,
            tripped_lines=req.tripped_lines,
            new_buses=req.new_buses,
            new_lines=req.new_lines,
            new_generators=req.new_generators
        )
        res["model_name"] = name
        return res

    @router.post("/cascade")
    def run_cascade(req: CascadeSimulationRequest):
        net, _ = get_active_fn()
        return run_cascading_simulation(
            base_net=net,
            initial_tripped_lines=req.initial_tripped_lines,
            overload_threshold_percent=req.overload_threshold_percent,
            max_cascade_steps=req.max_cascade_steps,
            load_multiplier=req.load_multiplier,
            slack_voltage_pu=req.slack_voltage_pu,
            target_power_factor=req.target_power_factor
        )

    @router.post("/dynamics")
    def run_dynamic_sim(req: DynamicSimRequest):
        net, _ = get_active_fn()
        base_load = float(net.load.p_mw.sum()) if net and len(net.load) > 0 else 3800.0
        base_cap = float(net.gen.p_mw.sum()) if net and len(net.gen) > 0 else 5200.0
        if net and len(net.ext_grid) > 0:
            base_cap += 1200.0

        return simulate_transient_swing(
            disturbance_mw=req.disturbance_mw,
            inertia_constant_H=req.inertia_constant_H,
            damping_D=req.damping_coefficient_D,
            enable_governor=req.enable_governor,
            droop_R=req.droop_R,
            Tg=req.governor_time_constant_Tg,
            Tt=req.turbine_time_constant_Tt,
            enable_pss=req.enable_pss,
            pss_gain_K=req.pss_gain_K,
            enable_ufls=req.enable_ufls,
            sim_duration_s=req.sim_duration_s,
            base_load_mw=base_load,
            base_gen_capacity_mw=base_cap
        )

    @router.post("/multi-machine")
    def run_multi_machine_sim(req: MultiMachineSimRequest):
        net, _ = get_active_fn()
        return simulate_multi_machine(
            base_net=net,
            fault_bus_id=req.fault_bus_id,
            fault_start_s=req.fault_start_time_s,
            fault_duration_ms=req.fault_duration_ms,
            sim_duration_s=req.sim_duration_s,
            calc_cct=req.calc_cct
        )

    @router.post("/market-dispatch")
    def run_market_sim(req: MarketSimulationRequest):
        net, _ = get_active_fn()
        return solve_market_dispatch(net, req.load_multiplier, req.gas_price_factor, req.hydro_availability)

    return router