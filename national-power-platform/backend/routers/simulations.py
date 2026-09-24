from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import numpy as np
import math

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
    router = APIRouter(prefix="/api/simulations", tags=["Simulations"])

    @router.post("/dynamics")
    def run_frequency_dynamics(req: DynamicSimRequest):
        """Simulates Center-of-Inertia frequency trajectory with 4-stage UFLS."""
        f0 = 50.0
        dt = 0.02
        t_max = 12.0
        time = np.arange(0.0, t_max + dt, dt)
        n_steps = len(time)

        # Trajectory arrays
        f_unmitigated = np.zeros(n_steps)
        f_protected = np.zeros(n_steps)

        # Baseline system parameters
        P_base = 5000.0  # MVA base
        delta_P = req.disturbance_mw / P_base
        H = max(1.5, req.inertia_constant_H)
        D = 1.2          # Load-damping constant

        # 1. Unmitigated Trajectory (No governor, no UFLS)
        f_curr = f0
        for i, t in enumerate(time):
            if t < 0.5:
                f_unmitigated[i] = f0
            else:
                df_dt = (f0 / (2.0 * H)) * (-delta_P - D * (f_curr - f0) / f0)
                f_curr += df_dt * dt
                f_unmitigated[i] = max(45.0, round(float(f_curr), 3))

        # 2. Protected Trajectory (Governor + PSS + 4-Stage NERC UFLS)
        f_curr = f0
        P_gov = 0.0
        P_shed_total = 0.0
        ufls_stages = [
            {"stage": 1, "thresh": 48.80, "shed_mw": 290.0, "triggered": False, "t_trip": None},
            {"stage": 2, "thresh": 48.60, "shed_mw": 290.0, "triggered": False, "t_trip": None},
            {"stage": 3, "thresh": 48.40, "shed_mw": 580.0, "triggered": False, "t_trip": None},
            {"stage": 4, "thresh": 48.20, "shed_mw": 580.0, "triggered": False, "t_trip": None},
        ]

        active_shed_events = []
        for i, t in enumerate(time):
            if t < 0.5:
                f_protected[i] = f0
                continue

            # UFLS Relay Logic (with 100ms intentional relay/breaker delay)
            if req.enable_ufls:
                for stage in ufls_stages:
                    if not stage["triggered"] and f_curr <= stage["thresh"]:
                        stage["triggered"] = True
                        stage["t_trip"] = round(t + 0.10, 2)
                        active_shed_events.append({
                            "stage": stage["stage"],
                            "timestamp": stage["t_trip"],
                            "threshold_hz": stage["thresh"],
                            "shed_mw": stage["shed_mw"]
                        })

                # Apply load shed once delay expires
                current_shed_mw = sum(s["shed_mw"] for s in active_shed_events if t >= s["timestamp"])
                P_shed_total = current_shed_mw / P_base

            # Governor Response
            if req.enable_governor:
                freq_error = (f0 - f_curr) / f0
                P_gov_target = min(0.35, freq_error / max(0.02, req.droop_R))
                P_gov += (P_gov_target - P_gov) * (dt / 1.5)  # 1.5s turbine servo time constant
            else:
                P_gov = 0.0

            # Power System Stabilizer auxiliary damping
            pss_damping = (req.pss_gain_K * 0.002 * (f0 - f_curr)) if req.enable_pss else 0.0

            # Net power acceleration
            P_acc = -delta_P + P_gov + P_shed_total - (D * (f_curr - f0) / f0) + pss_damping
            df_dt = (f0 / (2.0 * H)) * P_acc
            f_curr += df_dt * dt
            f_protected[i] = round(float(f_curr), 3)

        nadir_hz = float(np.min(f_protected[time >= 0.5]))
        initial_rocof = float((f_protected[int(0.6/dt)] - f0) / 0.1)
        settling_hz = float(np.mean(f_protected[-25:]))
        total_shed_mw = sum(s["shed_mw"] for s in active_shed_events)

        return {
            "time": [round(float(x), 2) for x in time],
            "f_unmitigated": [float(x) for x in f_unmitigated],
            "f_protected": [float(x) for x in f_protected],
            "nadir_hz": round(nadir_hz, 2),
            "initial_rocof": round(initial_rocof, 2),
            "settling_hz": round(settling_hz, 2),
            "total_shed_mw": total_shed_mw,
            "stages_tripped": len(active_shed_events),
            "ufls_events": active_shed_events
        }

    @router.post("/multi-machine")
    def run_multi_machine_cct(req: MultiMachineRequest):
        """Simulates generator swing equations and computes machine-specific CCTs."""
        net, model_name = get_active_net_fn()

        # Known plant configurations across Nigerian 330kV Grid
        GENERATOR_PROFILES = [
            {"id": 0, "name": "Egbin PS 330 (Slack)", "bus": 3, "p_mw": 880.0, "h": 5.2, "x_d_prime": 0.18},
            {"id": 1, "name": "Kainji Hydro GS 330", "bus": 1, "p_mw": 480.0, "h": 4.5, "x_d_prime": 0.25},
            {"id": 2, "name": "Jebba Hydro GS 330", "bus": 2, "p_mw": 450.0, "h": 4.2, "x_d_prime": 0.24},
            {"id": 3, "name": "Shiroro Hydro GS 330", "bus": 4, "p_mw": 420.0, "h": 4.0, "x_d_prime": 0.22},
            {"id": 4, "name": "Delta IV Gas GS 330", "bus": 6, "p_mw": 520.0, "h": 3.8, "x_d_prime": 0.20},
            {"id": 5, "name": "Afam VI Gas Combined", "bus": 9, "p_mw": 600.0, "h": 4.6, "x_d_prime": 0.19},
            {"id": 6, "name": "Geregu I Gas GS 330", "bus": 10, "p_mw": 414.0, "h": 3.6, "x_d_prime": 0.21},
            {"id": 7, "name": "Azura-Edo IPP 330", "bus": 8, "p_mw": 461.0, "h": 4.8, "x_d_prime": 0.17},
            {"id": 8, "name": "Odukpani (Calabar) 330", "bus": 12, "p_mw": 380.0, "h": 3.5, "x_d_prime": 0.22},
            {"id": 9, "name": "Okpai Gas IPP 330", "bus": 15, "p_mw": 480.0, "h": 4.4, "x_d_prime": 0.18},
        ]

        t_fault_start = 1.0
        t_clear = t_fault_start + (req.fault_duration_ms / 1000.0)
        dt = 0.01
        time_arr = np.arange(0.0, 4.0 + dt, dt)
        f0 = 50.0
        omega_s = 2.0 * math.pi * f0

        trajectories = []
        machine_table = []
        any_pole_slip = False
        lowest_cct_overall = 999.0

        for gen in GENERATOR_PROFILES:
            # Electrical distance approximation between generator bus and fault bus
            bus_dist = abs(gen["bus"] - req.fault_bus_id)
            if bus_dist == 0:
                coupling = 0.05   # Bolted fault directly at plant terminal
                raw_cct = 45.0 + (gen["h"] * 6.5)
            elif bus_dist <= 2:
                coupling = 0.25   # Very close electrically
                raw_cct = 80.0 + (gen["h"] * 12.0)
            elif bus_dist <= 5:
                coupling = 0.65   # Moderate distance
                raw_cct = 140.0 + (gen["h"] * 18.0)
            else:
                coupling = 0.90   # Remote electrical distance
                raw_cct = 220.0 + (gen["h"] * 25.0)

            cct_val_ms = round(raw_cct, 1)
            lowest_cct_overall = min(lowest_cct_overall, cct_val_ms)

            # Swing Equation numerical integration: d2_delta/dt2 = (omega_s / 2H) * (Pm - Pe)
            delta = math.radians(12.0 + (gen["id"] * 4.5))
            omega = 0.0
            angles = []
            max_angle_deg = 0.0

            P_m = gen["p_mw"] / 1000.0

            for t in time_arr:
                if t < t_fault_start:
                    P_e = P_m
                elif t_fault_start <= t < t_clear:
                    P_e = P_m * coupling  # Fault depresses electrical power
                else:
                    P_e = P_m * 1.15 * math.sin(delta)  # Post-fault restorative torque

                P_acc = P_m - P_e
                d_omega = (omega_s / (2.0 * gen["h"])) * P_acc * dt
                omega += d_omega
                omega *= 0.985  # PSS / physical mechanical damping
                delta += omega * dt

                deg = math.degrees(delta)
                max_angle_deg = max(max_angle_deg, deg)
                angles.append(round(deg, 2))

            has_slipped = (req.fault_duration_ms > cct_val_ms) or (max_angle_deg >= 180.0)
            if has_slipped:
                any_pole_slip = True

            cct_margin = round(cct_val_ms - req.fault_duration_ms, 1)

            trajectories.append({
                "id": gen["id"],
                "name": gen["name"],
                "bus_id": gen["bus"],
                "angles": angles
            })

            machine_table.append({
                "id": gen["id"],
                "name": gen["name"],
                "bus_node": f"Bus #{gen['bus']}",
                "inertia_h": f"{gen['h']} s",
                "max_excursion": f"{round(max_angle_deg, 1)}°",
                "cct_ms": cct_val_ms,
                "cct_margin_ms": cct_margin,
                "status": "POLE SLIP" if has_slipped else "SYNCHRONOUS"
            })

        return {
            "time": [round(float(t), 2) for t in time_arr],
            "fault_duration_ms": req.fault_duration_ms,
            "fault_start_s": t_fault_start,
            "fault_clear_s": round(t_clear, 3),
            "system_status": "POLE_SLIP" if any_pole_slip else "STABLE",
            "lowest_cct_ms": lowest_cct_overall,
            "trajectories": trajectories,
            "machines": machine_table
        }

    return router