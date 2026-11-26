"""Simulation API endpoints delegating to the core power system analysis services."""

from typing import Callable, Optional, Tuple

import pandapower as pp
from fastapi import APIRouter

from models.schemas import (
    CascadeRequest,
    DynamicSimRequest,
    LoadSharingRequest,
    MultiMachineRequest,
    PowerFlowRequest,
)
from services.cascade import run_cascading_simulation
from services.dynamics import simulate_transient_swing
from services.load_sharing import solve_load_sharing
from services.multi_machine import simulate_multi_machine
from services.power_flow import solve_power_flow


def get_sim_router(
    get_active_net_fn: Callable[[], Tuple[Optional[pp.pandapowerNet], str]],
) -> APIRouter:
    """Creates the simulation router bound to the active-network resolver."""
    router = APIRouter(tags=["Simulations"])

    @router.post("/power-flow")
    def run_power_flow(req: PowerFlowRequest):
        """Runs steady-state AC power flow with operational overrides and N-1 trips."""
        net, model_name = get_active_net_fn()
        return solve_power_flow(
            base_net=net,
            model_name=model_name,
            pf_variables=req.pf_variables,
            tripped_lines=req.tripped_lines,
        )

    @router.post("/load-sharing/solve")
    def run_load_sharing(req: LoadSharingRequest):
        """Computes governor droop pickup allocations and parallel corridor sharing."""
        net, model_name = get_active_net_fn()
        return solve_load_sharing(
            net=net,
            model_name=model_name,
            load_step_mw=req.load_step_mw,
            system_damping_d=req.system_damping_d,
            droop_overrides=req.droop_overrides,
        )

    @router.post("/cascade")
    def run_cascade(req: CascadeRequest):
        """Simulates sequential overcurrent tripping and topological islanding."""
        net, model_name = get_active_net_fn()
        return run_cascading_simulation(
            base_net=net,
            model_name=model_name,
            initial_tripped_lines=req.initial_tripped_lines,
            overload_threshold_percent=req.overload_threshold_percent,
            max_cascade_steps=req.max_cascade_steps,
            load_multiplier=req.load_multiplier,
            slack_voltage_pu=req.slack_voltage_pu,
            target_power_factor=req.target_power_factor,
        )

    @router.post("/dynamics")
    def run_frequency_dynamics(req: DynamicSimRequest):
        """Simulates center-of-inertia transient frequency response and 4-stage UFLS."""
        net, _ = get_active_net_fn()
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
            active_net=net,
        )

    @router.post("/multi-machine")
    def run_multi_machine(req: MultiMachineRequest):
        """Simulates multi-machine rotor-angle swings and computes Critical Clearing Time."""
        net, _ = get_active_net_fn()
        return simulate_multi_machine(
            net=net,
            fault_bus_id=req.fault_bus_id,
            fault_duration_ms=req.fault_duration_ms,
            fault_start_s=req.fault_start_time_s,
            sim_duration_s=req.sim_duration_s,
            calc_cct=req.calc_cct,
        )

    return router
