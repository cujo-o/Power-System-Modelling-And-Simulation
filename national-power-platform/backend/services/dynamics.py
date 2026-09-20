import numpy as np

def simulate_transient_swing(disturbance_mw: float, H: float, enable_governor: bool, droop_R: float, enable_pss: bool, pss_gain: float):
    f0 = 50.0
    dt = 0.05
    t_span = np.arange(0.0, 15.0, dt)
    
    delta_f = 0.0
    omega = 0.0
    Pm_step = 0.0
    u_pss = 0.0
    
    f_series = []
    rocof_series = []
    pss_series = []
    
    H_val = max(1.5, H)
    D = 1.2
    
    for t in t_span:
        if t < 1.0:
            P_acc = 0.0
        else:
            P_acc = -disturbance_mw / 2500.0
            
        if enable_governor and t >= 1.0:
            governor_action = -(delta_f / (f0 * droop_R))
            Pm_step += (governor_action - Pm_step) * (dt / 0.4)
            P_acc += Pm_step

        if enable_pss and t >= 1.0:
            u_pss += (pss_gain * (-delta_f / f0) - u_pss) * (dt / 0.12)
            P_acc += u_pss * 0.15
        else:
            u_pss = 0.0

        d_omega = (P_acc - D * omega) / (2.0 * H_val)
        omega += d_omega * dt
        delta_f = omega * f0
        
        freq = f0 + delta_f
        rocof = (d_omega * f0)
        
        f_series.append(round(freq, 3))
        rocof_series.append(round(rocof, 3))
        pss_series.append(round(u_pss, 3))
        
    nadir = min(f_series)
    initial_rocof = min(rocof_series[int(1.0/dt):int(1.5/dt)]) if len(rocof_series) > int(1.5/dt) else 0.0
    
    return {
        "time": [round(t, 2) for t in t_span],
        "frequency": f_series,
        "rocof": rocof_series,
        "pss_output": pss_series,
        "metrics": {
            "nadir_hz": nadir,
            "settling_hz": f_series[-1],
            "initial_rocof_hz_per_s": initial_rocof,
            "ufls_triggered": nadir < 48.80
        }
    }