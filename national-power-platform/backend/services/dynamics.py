import math
import numpy as np

def simulate_transient_swing(
    disturbance_mw: float = 450.0,
    inertia_constant_H: float = 4.5,
    damping_D: float = 1.8,
    enable_governor: bool = True,
    droop_R: float = 0.05,
    Tg: float = 0.2,
    Tt: float = 0.5,
    enable_pss: bool = True,
    pss_gain_K: float = 25.0,
    enable_ufls: bool = True,
    sim_duration_s: float = 12.0,
    base_load_mw: float = 3800.0,
    base_gen_capacity_mw: float = 5200.0
) -> dict:
    """
    Simulates center-of-inertia dynamic frequency response f(t), RoCoF (df/dt),
    and discrete 4-Stage NERC Under-Frequency Load Shedding (UFLS).
    """
    f0 = 50.00
    dt = 0.01  # 10 ms integration step
    time_steps = int(sim_duration_s / dt)
    time_arr = np.linspace(0, sim_duration_s, time_steps)

    # Statutory NERC 4-Stage UFLS Scheme Thresholds
    ufls_schedule = [
        {"stage": 1, "f_trigger": 48.80, "shed_ratio": 0.05, "delay_s": 0.10, "name": "Stage 1 (48.80 Hz - 5% Shed)"},
        {"stage": 2, "f_trigger": 48.60, "shed_ratio": 0.05, "delay_s": 0.10, "name": "Stage 2 (48.60 Hz - 5% Shed)"},
        {"stage": 3, "f_trigger": 48.40, "shed_ratio": 0.10, "delay_s": 0.10, "name": "Stage 3 (48.40 Hz - 10% Shed)"},
        {"stage": 4, "f_trigger": 48.20, "shed_ratio": 0.10, "delay_s": 0.10, "name": "Stage 4 (48.20 Hz - 10% Shed)"},
    ]

    def solve_trajectory(with_ufls: bool):
        freq_list = []
        rocof_list = []
        pss_signals = []
        power_gov_list = []
        tripped_stages = []

        # State Variables
        delta_f = 0.0        # Frequency deviation from 50.0 Hz
        x_gov = 0.0          # Governor valve position
        delta_Pm = 0.0       # Mechanical power increase
        x_pss = 0.0          # PSS state
        pss_out = 0.0        # Stabilizing signal

        # UFLS Trackers
        cumulative_shed_mw = 0.0
        stage_triggered_time = {}

        H_effective = max(1.5, inertia_constant_H)
        D_effective = damping_D / 100.0  # Convert %/Hz to p.u.

        for step_idx, t in enumerate(time_arr):
            f_current = f0 + delta_f

            # 1. Disturbance Step (occurs at t = 0.5s)
            p_dist = disturbance_mw if t >= 0.5 else 0.0

            # 2. Check UFLS Relays
            if with_ufls and t >= 0.5:
                for stage in ufls_schedule:
                    s_id = stage["stage"]
                    if s_id not in stage_triggered_time:
                        if f_current <= stage["f_trigger"]:
                            stage_triggered_time[s_id] = t
                    else:
                        # Check relay operating time delay
                        if s_id not in [x["stage"] for x in tripped_stages]:
                            if (t - stage_triggered_time[s_id]) >= stage["delay_s"]:
                                mw_shed = stage["shed_ratio"] * base_load_mw
                                cumulative_shed_mw += mw_shed
                                tripped_stages.append({
                                    "stage": s_id,
                                    "name": stage["name"],
                                    "timestamp_s": round(t, 2),
                                    "frequency_at_trip": round(f_current, 3),
                                    "mw_shed": round(mw_shed, 1),
                                    "cumulative_shed_mw": round(cumulative_shed_mw, 1)
                                })

            # 3. PSS Lead-Lag Dynamics
            if enable_pss and t >= 0.5:
                # High-pass washout + lead-lag phase advance
                T_washout = 2.0
                T1 = 0.15
                T2 = 0.03
                dx_pss = (delta_f - x_pss) / T_washout
                x_pss += dx_pss * dt
                pss_out = pss_gain_K * (delta_f - x_pss) * (T1 / max(0.01, T2))
                pss_out = np.clip(pss_out, -150.0, 150.0)
            else:
                pss_out = 0.0

            # 4. Turbine-Governor Dynamics (Droop primary response)
            if enable_governor and t >= 0.5:
                # Speed governing command with droop R and PSS damping injection
                gov_error = -(delta_f / (f0 * droop_R)) * base_gen_capacity_mw + pss_out
                # Valve actuator lag
                dx_gov = (gov_error - x_gov) / max(0.05, Tg)
                x_gov += dx_gov * dt
                # Turbine mechanical torque lag
                d_pm = (x_gov - delta_Pm) / max(0.1, Tt)
                delta_Pm += d_pm * dt
                # Governor headroom clamp (+/- 25% base capacity)
                delta_Pm = np.clip(delta_Pm, -base_gen_capacity_mw * 0.1, base_gen_capacity_mw * 0.3)
            else:
                delta_Pm = 0.0

            # 5. Core Swing Differential Equation
            # Net accelerating power
            P_acc = delta_Pm - p_dist - (D_effective * delta_f * base_load_mw) + cumulative_shed_mw
            d_delta_f = (f0 / (2.0 * H_effective * base_gen_capacity_mw)) * P_acc

            # Rate of Change of Frequency (RoCoF in Hz/s)
            rocof = d_delta_f

            # Integrate forward
            delta_f += d_delta_f * dt

            # Lower limit clamp to represent total blackout collapse if below 46.5 Hz
            if f_current < 46.50:
                delta_f = 46.50 - f0

            freq_list.append(round(f_current, 3))
            rocof_list.append(round(rocof, 3))
            pss_signals.append(round(pss_out, 2))
            power_gov_list.append(round(delta_Pm, 1))

        return {
            "frequency": freq_list,
            "rocof": rocof_list,
            "pss_output": pss_signals,
            "gov_power_mw": power_gov_list,
            "tripped_stages": tripped_stages,
            "final_shed_mw": round(cumulative_shed_mw, 1)
        }

    # Run dual trajectory (Comparison with & without UFLS)
    result_with_ufls = solve_trajectory(with_ufls=enable_ufls)
    result_unmitigated = solve_trajectory(with_ufls=False)

    f_ufls = result_with_ufls["frequency"]
    f_unmit = result_unmitigated["frequency"]

    nadir_ufls = min(f_ufls)
    nadir_unmit = min(f_unmit)
    settling_ufls = f_ufls[-1]
    settling_unmit = f_unmit[-1]

    # Initial RoCoF at moment of disturbance (t = 0.51s)
    initial_rocof = result_with_ufls["rocof"][int(0.55 / dt)]

    # Statutory Compliance Check
    rocf_compliant = abs(initial_rocof) <= 0.50
    nadir_compliant = nadir_ufls >= 48.80
    frequency_band_compliant = 49.75 <= settling_ufls <= 50.25

    return {
        "time": [round(t, 2) for t in time_arr[::5]],  # Downsample for network efficiency
        "frequency_ufls": f_ufls[::5],
        "frequency_unmitigated": f_unmit[::5],
        "rocof": result_with_ufls["rocof"][::5],
        "pss_output": result_with_ufls["pss_output"][::5],
        "gov_power_mw": result_with_ufls["gov_power_mw"][::5],
        "metrics": {
            "nadir_ufls_hz": nadir_ufls,
            "nadir_unmitigated_hz": nadir_unmit,
            "settling_ufls_hz": settling_ufls,
            "settling_unmitigated_hz": settling_unmit,
            "initial_rocof_hz_per_s": initial_rocof,
            "total_load_shed_mw": result_with_ufls["final_shed_mw"],
            "stages_tripped_count": len(result_with_ufls["tripped_stages"]),
            "rocf_compliant": rocf_compliant,
            "nadir_compliant": nadir_compliant,
            "frequency_band_compliant": frequency_band_compliant,
        },
        "ufls_events": result_with_ufls["tripped_stages"]
    }