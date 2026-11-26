"""Center-of-inertia (COI) transient frequency response and 4-stage UFLS simulator."""

from typing import Optional

import numpy as np
import pandapower as pp

from config import settings
from services.power_flow import clean_float

# Statutory NERC/NESI 4-stage Under-Frequency Load Shedding relay schedule
UFLS_STAGES = (
    {"stage": 1, "threshold_hz": 48.80, "shed_ratio": 0.05, "delay_s": 0.10},
    {"stage": 2, "threshold_hz": 48.60, "shed_ratio": 0.05, "delay_s": 0.10},
    {"stage": 3, "threshold_hz": 48.40, "shed_ratio": 0.10, "delay_s": 0.10},
    {"stage": 4, "threshold_hz": 48.20, "shed_ratio": 0.10, "delay_s": 0.10},
)


def _derive_system_bases(net: Optional[pp.pandapowerNet]) -> tuple[float, float]:
    """Derives base load and online generating capacity (MW) from the active grid if available."""
    base_load_mw = 3800.0
    base_cap_mw = 5000.0

    if net is not None and len(net.bus) > 0:
        if hasattr(net, "load") and len(net.load) > 0:
            load_sum = clean_float(net.load["p_mw"].sum(), 0.0)
            if load_sum > 100.0:
                base_load_mw = load_sum

        cap_sum = 0.0
        if hasattr(net, "gen") and len(net.gen) > 0:
            col = "max_p_mw" if "max_p_mw" in net.gen else "p_mw"
            cap_sum += clean_float(net.gen[col].sum(), 0.0)
        if hasattr(net, "ext_grid") and len(net.ext_grid) > 0:
            if "max_p_mw" in net.ext_grid and net.ext_grid["max_p_mw"].notna().any():
                cap_sum += clean_float(net.ext_grid["max_p_mw"].sum(), 0.0)
            else:
                cap_sum += 500.0 * len(net.ext_grid)

        if cap_sum > 200.0:
            base_cap_mw = max(cap_sum, base_load_mw * 1.15)
        else:
            base_cap_mw = max(base_load_mw * 1.3, 1000.0)

    return base_load_mw, base_cap_mw


def simulate_transient_swing(
    disturbance_mw: float = 650.0,
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
    active_net: Optional[pp.pandapowerNet] = None,
) -> dict:
    """
    Integrates the lumped center-of-inertia swing equation using RK2 (Heun's method)
    to evaluate both unmitigated and protected (governor + PSS + 4-stage UFLS)
    frequency trajectories following a step generation loss at t = 0.5 s.
    """
    f0 = settings.F_NOMINAL_HZ
    dt = 0.01  # 10 ms integration step
    disturbance_start_s = 0.5
    n_steps = int(round(sim_duration_s / dt)) + 1
    time_arr = np.linspace(0.0, sim_duration_s, n_steps)

    base_load_mw, base_cap_mw = _derive_system_bases(active_net)
    h_eff = max(1.0, inertia_constant_H)
    d_mw_per_hz = (damping_D / 100.0) * base_load_mw  # Load damping in MW/Hz
    r_eff = max(0.01, droop_R)
    tg_eff = max(0.05, Tg)
    tt_eff = max(0.10, Tt)
    t_washout = 2.0
    pss_lead_ratio = 0.15 / 0.03

    def derivatives(
        df: float,
        x_gov: float,
        d_pm: float,
        x_pss: float,
        p_dist: float,
        shed_mw: float,
        use_controls: bool,
    ) -> tuple[float, float, float, float]:
        if use_controls and enable_pss and p_dist > 0.0:
            dx_pss = (df - x_pss) / t_washout
            pss_sig = float(np.clip(pss_gain_K * (df - x_pss) * pss_lead_ratio, -0.08 * base_cap_mw, 0.08 * base_cap_mw))
        else:
            dx_pss = 0.0
            pss_sig = 0.0

        if use_controls and enable_governor and p_dist > 0.0:
            gov_cmd = -(df / (f0 * r_eff)) * base_cap_mw - pss_sig
            dx_gov = (gov_cmd - x_gov) / tg_eff
            d_pm_dt = (x_gov - d_pm) / tt_eff
        else:
            dx_gov = 0.0
            d_pm_dt = 0.0

        p_mech = float(np.clip(d_pm, -0.1 * base_cap_mw, 0.35 * base_cap_mw)) if (use_controls and enable_governor) else 0.0
        p_acc = p_mech - p_dist - (d_mw_per_hz * df) + shed_mw
        ddf = (f0 / (2.0 * h_eff * base_cap_mw)) * p_acc
        return ddf, dx_gov, d_pm_dt, dx_pss

    def integrate(use_controls: bool, use_ufls: bool):
        freq_series = np.empty(n_steps, dtype=float)
        rocof_series = np.empty(n_steps, dtype=float)

        df = 0.0
        x_gov = 0.0
        d_pm = 0.0
        x_pss = 0.0

        cumulative_shed_mw = 0.0
        pickup_times: dict[int, float] = {}
        tripped_stage_ids: set[int] = set()
        ufls_events: list[dict] = []

        for idx, t in enumerate(time_arr):
            f_now = f0 + df
            p_dist = disturbance_mw if t >= disturbance_start_s else 0.0

            if use_ufls and t >= disturbance_start_s:
                for st in UFLS_STAGES:
                    sid = st["stage"]
                    if sid not in pickup_times and f_now <= st["threshold_hz"]:
                        pickup_times[sid] = float(t)
                    if sid in pickup_times and sid not in tripped_stage_ids:
                        if (t - pickup_times[sid]) >= st["delay_s"]:
                            mw_shed = round(st["shed_ratio"] * base_load_mw, 1)
                            cumulative_shed_mw += mw_shed
                            tripped_stage_ids.add(sid)
                            ufls_events.append({
                                "stage": sid,
                                "timestamp": round(float(t), 2),
                                "threshold_hz": st["threshold_hz"],
                                "shed_mw": mw_shed,
                            })

            # RK2 (Heun's predictor-corrector step)
            k1 = derivatives(df, x_gov, d_pm, x_pss, p_dist, cumulative_shed_mw, use_controls)
            freq_series[idx] = max(45.0, round(f_now, 3))
            rocof_series[idx] = round(k1[0], 3)

            df_pred = df + k1[0] * dt
            xg_pred = x_gov + k1[1] * dt
            pm_pred = d_pm + k1[2] * dt
            xp_pred = x_pss + k1[3] * dt

            k2 = derivatives(df_pred, xg_pred, pm_pred, xp_pred, p_dist, cumulative_shed_mw, use_controls)
            df = max(45.0 - f0, df + 0.5 * (k1[0] + k2[0]) * dt)
            x_gov += 0.5 * (k1[1] + k2[1]) * dt
            d_pm = float(np.clip(d_pm + 0.5 * (k1[2] + k2[2]) * dt, -0.1 * base_cap_mw, 0.35 * base_cap_mw))
            x_pss += 0.5 * (k1[3] + k2[3]) * dt

        return freq_series, rocof_series, ufls_events, round(cumulative_shed_mw, 1)

    f_protected, rocof_protected, ufls_events, total_shed_mw = integrate(
        use_controls=True, use_ufls=enable_ufls
    )
    f_unmitigated, _, _, _ = integrate(use_controls=False, use_ufls=False)

    # Metrics from full-resolution trajectory before downsampling
    post_mask = time_arr >= disturbance_start_s
    nadir_hz = round(float(np.min(f_protected[post_mask])), 2)
    rocof_idx = min(n_steps - 1, int(round((disturbance_start_s + 0.02) / dt)))
    initial_rocof = round(float(rocof_protected[rocof_idx]), 2)
    settling_hz = round(float(np.mean(f_protected[-25:])), 2)

    # Downsample every 5 steps (50 ms resolution) for lightweight JSON transfer
    stride = 5
    return {
        "time": [round(float(t), 2) for t in time_arr[::stride]],
        "f_unmitigated": [float(x) for x in f_unmitigated[::stride]],
        "f_protected": [float(x) for x in f_protected[::stride]],
        "nadir_hz": nadir_hz,
        "initial_rocof": initial_rocof,
        "settling_hz": settling_hz,
        "total_shed_mw": total_shed_mw,
        "stages_tripped": len(ufls_events),
        "ufls_events": ufls_events,
    }
