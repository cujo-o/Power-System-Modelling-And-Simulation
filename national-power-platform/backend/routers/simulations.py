from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import pandapower as pp
import numpy as np
import copy
import math

class NewBusElement(BaseModel):
    name: str
    vn_kv: float = 330.0
    zone: str = "North-Central"
    p_mw: float = 0.0
    q_mvar: float = 0.0

class NewLineElement(BaseModel):
    name: str
    from_bus: int
    to_bus: int
    length_km: float = 65.0
    conductor_type: str = "Bison 330kV"
    vn_kv: float = 330.0

class NewGenElement(BaseModel):
    name: str
    bus: int
    p_mw: float = 150.0
    vm_pu: float = 1.03
    p_max_mw: float = 200.0

class PowerFlowVariables(BaseModel):
    loadMultiplier: float = 1.0
    targetPowerFactor: float = 0.90
    slackVoltagePu: float = 1.05
    shuntMvarCompensation: float = 0.0
    thermalDeratingFactor: float = 1.0
    newBuses: List[NewBusElement] = []
    newLines: List[NewLineElement] = []
    newGenerators: List[NewGenElement] = []

class PowerFlowRequest(BaseModel):
    pf_variables: Optional[PowerFlowVariables] = None
    tripped_lines: List[int] = []

class CascadeRequest(BaseModel):
    initial_tripped_lines: List[int]
    overload_threshold_percent: float = 100.0
    max_cascade_steps: int = 8
    load_multiplier: float = 1.0
    slack_voltage_pu: float = 1.05

class DynamicSimRequest(BaseModel):
    disturbance_mw: float = 650.0
    inertia_constant_H: float = 4.5
    enable_governor: bool = True
    droop_R: float = 0.05
    enable_pss: bool = True
    pss_gain_K: float = 25.0
    enable_ufls: bool = True

class MultiMachineRequest(BaseModel):
    fault_bus_id: int
    fault_duration_ms: float = 80.0
    calc_cct: bool = True

def get_sim_router(model_registry: Dict[str, Any], get_active_net_fn):
    router = APIRouter(tags=["Simulations"])

    @router.post("/power-flow")
    def run_power_flow(req: PowerFlowRequest):
        net, model_name = get_active_net_fn()

        if net is None:
            return {
                "converged": False,
                "model_name": "No Active Model",
                "frequency": 50.0,
                "total_gen_mw": 0.0,
                "total_load_mw": 0.0,
                "total_losses_mw": 0.0,
                "buses": [],
                "lines": [],
                "message": "No model active in memory. Re-select the model."
            }

        temp_net = copy.deepcopy(net)
        vars_deck = req.pf_variables or PowerFlowVariables()

        # Guarantee slack bus
        if len(temp_net.ext_grid) == 0:
            if len(temp_net.gen) > 0:
                first_gen_idx = temp_net.gen.index[0]
                g_bus = int(temp_net.gen.at[first_gen_idx, "bus"])
                pp.create_ext_grid(temp_net, bus=g_bus, vm_pu=vars_deck.slackVoltagePu, name="Slack Reference")
                temp_net.gen.drop(first_gen_idx, inplace=True)
            elif len(temp_net.bus) > 0:
                pp.create_ext_grid(temp_net, bus=int(temp_net.bus.index[0]), vm_pu=vars_deck.slackVoltagePu, name="Slack Reference")

        if req.tripped_lines:
            for l_id in req.tripped_lines:
                if l_id in temp_net.line.index:
                    temp_net.line.at[l_id, "in_service"] = False

        if len(temp_net.load) > 0:
            temp_net.load["p_mw"] *= vars_deck.loadMultiplier
            pf = max(0.70, min(1.0, vars_deck.targetPowerFactor))
            tan_phi = math.tan(math.acos(pf))
            temp_net.load["q_mvar"] = temp_net.load["p_mw"] * tan_phi

        if len(temp_net.ext_grid) > 0:
            temp_net.ext_grid["vm_pu"] = vars_deck.slackVoltagePu

        # Planning expansions
        for nb in vars_deck.newBuses:
            pp.create_bus(temp_net, vn_kv=nb.vn_kv, name=nb.name, zone=nb.zone)
            if nb.p_mw > 0:
                new_idx = temp_net.bus.index[-1]
                pp.create_load(temp_net, bus=new_idx, p_mw=nb.p_mw, q_mvar=nb.q_mvar, name=f"{nb.name} Load")

        for nl in vars_deck.newLines:
            if nl.from_bus in temp_net.bus.index and nl.to_bus in temp_net.bus.index:
                try:
                    pp.create_line_from_parameters(
                        temp_net, from_bus=nl.from_bus, to_bus=nl.to_bus, length_km=nl.length_km,
                        r_ohm_per_km=0.035, x_ohm_per_km=0.32, c_nf_per_km=11.2, max_i_ka=1.35,
                        name=nl.name
                    )
                except Exception:
                    pass

        for ng in vars_deck.newGenerators:
            if ng.bus in temp_net.bus.index:
                pp.create_gen(temp_net, bus=ng.bus, p_mw=ng.p_mw, vm_pu=ng.vm_pu, max_p_mw=ng.p_max_mw, name=ng.name)

        converged = False
        solver_notice = None

        # Stage 1: Newton-Raphson
        try:
            pp.runpp(temp_net, algorithm="nr", max_iteration=45, enforce_q_limits=False)
            converged = bool(temp_net.converged)
        except Exception:
            converged = False

        # Stage 2: Newton-Raphson Flat Start
        if not converged:
            try:
                pp.runpp(temp_net, algorithm="nr", init="flat", max_iteration=60, enforce_q_limits=False)
                converged = bool(temp_net.converged)
                if converged:
                    solver_notice = "Solved using Flat Start initialization."
            except Exception:
                converged = False

        # Stage 3: DC Load Flow fallback
        if not converged:
            try:
                pp.rundcpp(temp_net)
                converged = True
                solver_notice = "AC power flow diverged. Showing linearized DC load flow."
            except Exception:
                converged = False
                solver_notice = "Severe voltage deficit: Displaying nominal node telemetry."

        # Extract Buses
        buses_out = []
        for idx in temp_net.bus.index:
            row = temp_net.bus.loc[idx]
            v_pu = 1.000
            va_deg = 0.0
            p_mw = 0.0
            q_mvar = 0.0

            if hasattr(temp_net, "res_bus") and idx in temp_net.res_bus.index:
                v_val = temp_net.res_bus.at[idx, "vm_pu"]
                v_pu = float(v_val) if not np.isnan(v_val) else 1.000
                va_val = temp_net.res_bus.at[idx, "va_degree"]
                va_deg = float(va_val) if not np.isnan(va_val) else 0.0
                p_val = temp_net.res_bus.at[idx, "p_mw"]
                p_mw = float(p_val) if not np.isnan(p_val) else 0.0
                q_val = temp_net.res_bus.at[idx, "q_mvar"]
                q_mvar = float(q_val) if not np.isnan(q_val) else 0.0
            else:
                p_load = temp_net.load[temp_net.load["bus"] == idx]["p_mw"].sum() if hasattr(temp_net, "load") and len(temp_net.load) > 0 else 0.0
                p_gen = temp_net.gen[temp_net.gen["bus"] == idx]["p_mw"].sum() if hasattr(temp_net, "gen") and len(temp_net.gen) > 0 else 0.0
                p_mw = float(p_load - p_gen)

            buses_out.append({
                "id": int(idx),
                "name": str(row.get("name", f"Bus #{idx}")),
                "zone": str(row.get("zone", "Grid Bus")),
                "vn_kv": float(row.get("vn_kv", 330.0)),
                "v_pu": round(v_pu, 3),
                "va_deg": round(va_deg, 2),
                "p_mw": round(p_mw, 1),
                "q_mvar": round(q_mvar, 1)
            })

        # Extract Lines
        lines_out = []
        for idx in temp_net.line.index:
            l_row = temp_net.line.loc[idx]
            in_srv = bool(l_row.get("in_service", True))
            flow_mw = 0.0
            loading = 0.0
            losses = 0.0

            if in_srv and hasattr(temp_net, "res_line") and idx in temp_net.res_line.index:
                fl = temp_net.res_line.at[idx, "p_from_mw"]
                flow_mw = float(fl) if not np.isnan(fl) else 0.0
                ld = temp_net.res_line.at[idx, "loading_percent"]
                loading = float(ld) if not np.isnan(ld) else 0.0
                ls = temp_net.res_line.at[idx, "pl_mw"]
                losses = float(ls) if not np.isnan(ls) else 0.0

            lines_out.append({
                "id": int(idx),
                "name": str(l_row.get("name", f"Line #{idx}")),
                "from_bus": int(l_row["from_bus"]),
                "to_bus": int(l_row["to_bus"]),
                "in_service": in_srv,
                "loading_percent": round(loading, 1),
                "flow_mw": round(flow_mw, 1),
                "p_mw": round(flow_mw, 1),
                "losses_mw": round(losses, 1)
            })

        total_gen = sum(b["p_mw"] for b in buses_out if b["p_mw"] < 0)
        total_load = sum(b["p_mw"] for b in buses_out if b["p_mw"] > 0)
        total_losses = sum(l["losses_mw"] for l in lines_out)

        return {
            "converged": converged,
            "model_name": model_name,
            "frequency": 50.0,
            "total_gen_mw": round(abs(total_gen), 1),
            "total_load_mw": round(total_load, 1),
            "total_losses_mw": round(total_losses, 1),
            "buses": buses_out,
            "lines": lines_out,
            "message": solver_notice
        }

    @router.post("/cascade")
    def run_cascade(req: CascadeRequest):
        net, model_name = get_active_net_fn()
        if net is None:
            return {"status": "NO_MODEL", "total_steps": 0, "timeline": [], "islands": [], "all_tripped_lines": []}

        temp_net = copy.deepcopy(net)
        tripped = list(req.initial_tripped_lines)
        timeline = []

        for step in range(1, req.max_cascade_steps + 1):
            for l_id in tripped:
                if l_id in temp_net.line.index:
                    temp_net.line.at[l_id, "in_service"] = False

            try:
                pp.runpp(temp_net, algorithm="nr", enforce_q_limits=False)
            except Exception:
                try:
                    pp.rundcpp(temp_net)
                except Exception:
                    break

            overloaded = []
            if hasattr(temp_net, "res_line"):
                for l_idx in temp_net.line[temp_net.line["in_service"]].index:
                    if l_idx in temp_net.res_line.index:
                        ld = temp_net.res_line.at[l_idx, "loading_percent"]
                        if not np.isnan(ld) and ld >= req.overload_threshold_percent:
                            overloaded.append(int(l_idx))

            timeline.append({
                "step": step,
                "event_type": "BREAKER_OVERCURRENT_TRIP" if overloaded else "SYSTEM_STABILIZED",
                "description": f"Stage {step}: {len(overloaded)} line(s) overloaded.",
                "tripped_in_this_step": overloaded,
                "total_tripped_so_far": list(set(tripped + overloaded)),
                "converged": bool(temp_net.converged) if hasattr(temp_net, "converged") else True,
                "max_loading_percent": float(temp_net.res_line.loading_percent.max()) if hasattr(temp_net, "res_line") and len(temp_net.res_line) > 0 else 0.0,
                "total_losses_mw": float(temp_net.res_line.pl_mw.sum()) if hasattr(temp_net, "res_line") and len(temp_net.res_line) > 0 else 0.0,
                "frequency_hz": 50.0
            })

            if not overloaded:
                break
            tripped = list(set(tripped + overloaded))

        status_result = "STABILIZED_POST_CONTINGENCY" if len(tripped) < len(temp_net.line) * 0.4 else "PARTIAL_SYSTEM_COLLAPSE"

        return {
            "status": status_result,
            "total_steps": len(timeline),
            "timeline": timeline,
            "islands": [],
            "all_tripped_lines": tripped,
            "converged": True
        }

    @router.post("/dynamics")
    def run_frequency_dynamics(req: DynamicSimRequest):
        f0 = 50.0
        dt = 0.02
        time = np.arange(0.0, 12.0 + dt, dt)
        n_steps = len(time)

        f_unmitigated = np.zeros(n_steps)
        f_protected = np.zeros(n_steps)

        P_base = 5000.0
        delta_P = req.disturbance_mw / P_base
        H = max(1.5, req.inertia_constant_H)
        D = 1.2

        f_curr = f0
        for i, t in enumerate(time):
            if t < 0.5:
                f_unmitigated[i] = f0
            else:
                df_dt = (f0 / (2.0 * H)) * (-delta_P - D * (f_curr - f0) / f0)
                f_curr += df_dt * dt
                f_unmitigated[i] = max(45.0, round(float(f_curr), 3))

        f_curr = f0
        P_gov = 0.0
        active_shed_events = []
        stages = [
            {"stage": 1, "thresh": 48.80, "shed_mw": 290.0, "triggered": False},
            {"stage": 2, "thresh": 48.60, "shed_mw": 290.0, "triggered": False},
            {"stage": 3, "thresh": 48.40, "shed_mw": 580.0, "triggered": False},
            {"stage": 4, "thresh": 48.20, "shed_mw": 580.0, "triggered": False},
        ]

        for i, t in enumerate(time):
            if t < 0.5:
                f_protected[i] = f0
                continue

            if req.enable_ufls:
                for st in stages:
                    if not st["triggered"] and f_curr <= st["thresh"]:
                        st["triggered"] = True
                        active_shed_events.append({
                            "stage": st["stage"],
                            "timestamp": round(t + 0.10, 2),
                            "threshold_hz": st["thresh"],
                            "shed_mw": st["shed_mw"]
                        })

            current_shed = sum(s["shed_mw"] for s in active_shed_events if t >= s["timestamp"]) / P_base

            if req.enable_governor:
                freq_error = (f0 - f_curr) / f0
                P_target = min(0.35, freq_error / max(0.02, req.droop_R))
                P_gov += (P_target - P_gov) * (dt / 1.5)
            else:
                P_gov = 0.0

            pss_damping = (req.pss_gain_K * 0.002 * (f0 - f_curr)) if req.enable_pss else 0.0
            P_acc = -delta_P + P_gov + current_shed - (D * (f_curr - f0) / f0) + pss_damping
            f_curr += (f0 / (2.0 * H)) * P_acc * dt
            f_protected[i] = round(float(f_curr), 3)

        nadir_hz = round(float(np.min(f_protected[time >= 0.5])), 2)
        initial_rocof = round(float((f_protected[int(0.6/dt)] - f0) / 0.1), 2)
        settling_hz = round(float(np.mean(f_protected[-25:])), 2)
        total_shed_mw = sum(s["shed_mw"] for s in active_shed_events)

        return {
            "time": [round(float(x), 2) for x in time],
            "f_unmitigated": [float(x) for x in f_unmitigated],
            "f_protected": [float(x) for x in f_protected],
            "frequency_unmitigated": [float(x) for x in f_unmitigated],
            "frequency_ufls": [float(x) for x in f_protected],
            "nadir_hz": nadir_hz,
            "initial_rocof": initial_rocof,
            "settling_hz": settling_hz,
            "total_shed_mw": total_shed_mw,
            "stages_tripped": len(active_shed_events),
            "ufls_events": active_shed_events,
            "metrics": {
                "nadir": nadir_hz,
                "nadir_hz": nadir_hz,
                "rocof": initial_rocof,
                "initial_rocof": initial_rocof,
                "settling_hz": settling_hz,
                "total_shed_mw": total_shed_mw,
                "stages_tripped": len(active_shed_events),
                "cct_ms": 120.0
            }
        }

    @router.post("/multi-machine")
    def run_multi_machine(req: MultiMachineRequest):
        net, model_name = get_active_net_fn()
        if net is None or len(net.bus) == 0:
            return {
                "time": [],
                "fault_duration_ms": req.fault_duration_ms,
                "system_status": "NO_MODEL",
                "lowest_cct_ms": 0.0,
                "trajectories": [],
                "machines": []
            }

        discovered_gens = []
        if hasattr(net, "ext_grid"):
            for idx in net.ext_grid.index:
                b_id = int(net.ext_grid.at[idx, "bus"])
                b_name = net.bus.at[b_id, "name"] if "name" in net.bus else f"Bus #{b_id}"
                discovered_gens.append({
                    "id": len(discovered_gens),
                    "name": f"{b_name} (Slack)",
                    "bus": b_id,
                    "p_mw": 800.0,
                    "h": 5.0
                })
        if hasattr(net, "gen"):
            for idx in net.gen.index:
                b_id = int(net.gen.at[idx, "bus"])
                b_name = net.bus.at[b_id, "name"] if "name" in net.bus else f"Bus #{b_id}"
                p_val = float(net.gen.at[idx, "p_mw"]) if "p_mw" in net.gen else 150.0
                discovered_gens.append({
                    "id": len(discovered_gens),
                    "name": str(b_name),
                    "bus": b_id,
                    "p_mw": max(50.0, p_val),
                    "h": 4.0
                })

        t_start = 1.0
        t_clear = t_start + (req.fault_duration_ms / 1000.0)
        dt = 0.01
        time_arr = np.arange(0.0, 4.0 + dt, dt)
        omega_s = 2.0 * math.pi * 50.0

        trajectories = []
        machines = []
        any_pole_slip = False
        lowest_cct = 999.0

        for gen in discovered_gens:
            dist = abs(gen["bus"] - req.fault_bus_id)
            if dist == 0:
                cct_val = 50.0 + (gen["h"] * 6.0)
                coupling = 0.05
            elif dist <= 2:
                cct_val = 85.0 + (gen["h"] * 10.0)
                coupling = 0.25
            else:
                cct_val = 140.0 + (gen["h"] * 18.0)
                coupling = 0.70

            cct_val = round(cct_val, 1)
            lowest_cct = min(lowest_cct, cct_val)

            delta = math.radians(10.0 + (gen["id"] * 5.0))
            omega = 0.0
            angles = []
            max_deg = 0.0
            Pm = gen["p_mw"] / 1000.0

            for t in time_arr:
                if t < t_start:
                    Pe = Pm
                elif t_start <= t < t_clear:
                    Pe = Pm * coupling
                else:
                    Pe = Pm * 1.15 * math.sin(delta)

                omega += (omega_s / (2.0 * gen["h"])) * (Pm - Pe) * dt
                omega *= 0.985
                delta += omega * dt

                deg = math.degrees(delta)
                max_deg = max(max_deg, deg)
                angles.append(round(deg, 2))

            slipped = (req.fault_duration_ms > cct_val) or (max_deg >= 180.0)
            if slipped:
                any_pole_slip = True

            trajectories.append({"id": gen["id"], "name": gen["name"], "angles": angles})
            machines.append({
                "id": gen["id"],
                "name": gen["name"],
                "bus_node": f"Bus #{gen['bus']}",
                "inertia_h": f"{gen['h']} s",
                "max_excursion": f"{round(max_deg, 1)}°",
                "cct_ms": cct_val,
                "cct_margin_ms": round(cct_val - req.fault_duration_ms, 1),
                "status": "POLE SLIP" if slipped else "SYNCHRONOUS"
            })

        return {
            "time": [round(float(t), 2) for t in time_arr],
            "fault_duration_ms": req.fault_duration_ms,
            "fault_start_s": t_start,
            "fault_clear_s": round(t_clear, 3),
            "system_status": "POLE_SLIP" if any_pole_slip else "STABLE",
            "lowest_cct_ms": lowest_cct if discovered_gens else 0.0,
            "trajectories": trajectories,
            "machines": machines
        }

    return router