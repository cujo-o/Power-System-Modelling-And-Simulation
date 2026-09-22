import math
import numpy as np
import pandapower as pp
from services.power_flow import solve_power_flow

# Typical transient reactance and inertia parameters for Nigerian power plants
NESI_GEN_LIBRARY = {
    "kainji": {"H": 4.2, "Xd_prime": 0.24, "D": 2.0, "color": "#0284c7"},
    "jebba": {"H": 4.5, "Xd_prime": 0.23, "D": 2.0, "color": "#0ea5e9"},
    "shiroro": {"H": 3.8, "Xd_prime": 0.26, "D": 1.8, "color": "#06b6d4"},
    "egbin": {"H": 5.2, "Xd_prime": 0.18, "D": 2.2, "color": "#10b981"}, # Slack reference
    "delta": {"H": 3.4, "Xd_prime": 0.25, "D": 1.5, "color": "#f59e0b"},
    "afam": {"H": 4.8, "Xd_prime": 0.20, "D": 2.0, "color": "#8b5cf6"},
    "sapele": {"H": 3.5, "Xd_prime": 0.26, "D": 1.5, "color": "#d946ef"},
    "azura": {"H": 4.4, "Xd_prime": 0.21, "D": 2.0, "color": "#ec4899"},
    "geregu": {"H": 4.1, "Xd_prime": 0.22, "D": 1.9, "color": "#f97316"},
    "default": {"H": 4.0, "Xd_prime": 0.24, "D": 1.8, "color": "#64748b"}
}

def get_gen_params(name: str):
    name_lower = name.lower()
    for key, val in NESI_GEN_LIBRARY.items():
        if key in name_lower:
            return val
    return NESI_GEN_LIBRARY["default"]

def simulate_multi_machine(
    base_net: pp.pandapowerNet,
    fault_bus_id: int = 12,
    fault_start_s: float = 1.0,
    fault_duration_ms: float = 160.0,
    sim_duration_s: float = 4.0,
    calc_cct: bool = True
) -> dict:
    if base_net is None or (len(base_net.gen) == 0 and len(base_net.ext_grid) == 0):
        return {
            "status": "NO_MODEL",
            "message": "No active grid model or generators found.",
            "generators": [],
            "cct_ms": 0.0,
            "cct_cycles": 0.0,
            "is_transiently_stable": False
        }

    # Run base power flow to get steady-state operating point
    sol = solve_power_flow(base_net)
    bus_voltages = {b["id"]: b["v_pu"] for b in sol["buses"]}
    bus_angles_deg = {b["id"]: b["va_deg"] for b in sol["buses"]}

    # Extract generators
    generators = []
    slack_id = None

    for idx, row in base_net.ext_grid.iterrows():
        b_id = int(row["bus"])
        name = str(row.get("name", f"Slack Gen Bus {b_id}"))
        p_mw = 450.0
        params = get_gen_params(name)
        v_term = bus_voltages.get(b_id, 1.05)
        theta_rad = math.radians(bus_angles_deg.get(b_id, 0.0))

        # Initial rotor angle: delta0 = theta + internal angle
        delta0_deg = math.degrees(theta_rad) + 12.0
        generators.append({
            "id": f"ext_{idx}",
            "bus_id": b_id,
            "name": name,
            "p_mw": p_mw,
            "H": params["H"],
            "D": params["D"],
            "color": params["color"],
            "is_slack": True,
            "delta0": delta0_deg
        })
        slack_id = f"ext_{idx}"

    for idx, row in base_net.gen.iterrows():
        b_id = int(row["bus"])
        name = str(row.get("name", f"Generator {idx}"))
        p_mw = float(row.get("p_mw", 100.0))
        params = get_gen_params(name)
        theta_rad = math.radians(bus_angles_deg.get(b_id, 0.0))
        delta0_deg = math.degrees(theta_rad) + 15.0

        generators.append({
            "id": f"gen_{idx}",
            "bus_id": b_id,
            "name": name,
            "p_mw": p_mw,
            "H": params["H"],
            "D": params["D"],
            "color": params["color"],
            "is_slack": False,
            "delta0": delta0_deg
        })

    if not slack_id and generators:
        generators[0]["is_slack"] = True
        slack_id = generators[0]["id"]

    f0 = 50.00
    omega0 = 2.0 * math.pi * f0
    dt = 0.005  # 5 ms integration step
    time_arr = np.arange(0, sim_duration_s + dt, dt)

    # Function to simulate rotor angles for a specific fault duration
    def run_trajectory(t_clear_ms: float):
        t_fault_start = fault_start_s
        t_fault_clear = fault_start_s + (t_clear_ms / 1000.0)

        # Initialize machine states
        deltas = {g["id"]: g["delta0"] for g in generators}
        omegas = {g["id"]: omega0 for g in generators}

        trajectories = {g["id"]: [] for g in generators}
        relative_trajectories = {g["id"]: [] for g in generators}

        is_stable = True
        pole_slip_machine = None

        for t in time_arr:
            is_during_fault = t_fault_start <= t < t_fault_clear
            slack_delta = deltas[slack_id]

            for g in generators:
                gid = g["id"]
                delta_deg = deltas[gid]
                omega = omegas[gid]
                H = g["H"]
                D = g["D"]
                p_mech = g["p_mw"]

                # Distance factor from fault bus
                bus_dist = abs(g["bus_id"] - fault_bus_id)
                proximity_factor = max(0.05, 1.0 - (1.0 / (1.0 + bus_dist * 0.4)))

                if is_during_fault:
                    # During fault, electrical output drops severely based on electrical distance
                    p_elec = p_mech * proximity_factor
                elif t >= t_fault_clear:
                    # Post-fault: restoring synchronizing power curve
                    rel_angle = math.radians(delta_deg - slack_delta)
                    p_elec = p_mech * 0.95 + (p_mech * 0.45 * math.sin(rel_angle))
                else:
                    # Pre-fault steady state
                    p_elec = p_mech

                # Swing equation integration
                p_acc = p_mech - p_elec - (D * (omega - omega0) / omega0) * p_mech
                d_omega = (omega0 / (2.0 * H * 100.0)) * p_acc * dt
                omega += d_omega
                d_delta = math.degrees(omega - omega0) * dt
                delta_deg += d_delta

                deltas[gid] = delta_deg
                omegas[gid] = omega

                rel_deg = delta_deg - slack_delta
                trajectories[gid].append(round(delta_deg, 2))
                relative_trajectories[gid].append(round(rel_deg, 2))

                # Instability criterion: Relative rotor angle excursion > 180 degrees
                if abs(rel_deg) > 180.0 and not g["is_slack"]:
                    is_stable = False
                    if not pole_slip_machine:
                        pole_slip_machine = g["name"]

        return is_stable, trajectories, relative_trajectories, pole_slip_machine

    # Run base simulation for the user-selected fault clearing time
    is_stable, raw_traj, raw_rel_traj, unstable_gen = run_trajectory(fault_duration_ms)

    # Solve Critical Clearing Time (CCT) via bisection/stepping
    cct_ms = 180.0
    if calc_cct:
        # Step from 50ms to 450ms in 15ms increments
        cct_found = False
        for test_clear_ms in range(50, 450, 15):
            stable_step, _, _, _ = run_trajectory(float(test_clear_ms))
            if not stable_step:
                cct_ms = float(test_clear_ms - 15)
                cct_found = True
                break
        if not cct_found:
            cct_ms = 400.0

    cct_cycles = round(cct_ms / (1000.0 / f0), 1)  # 20ms per cycle at 50 Hz

    # Sample trajectories every 4 steps for network transmission
    downsampled_time = [round(t, 2) for t in time_arr[::4]]
    gen_results = []
    for g in generators:
        gid = g["id"]
        gen_results.append({
            "id": gid,
            "name": g["name"],
            "bus_id": g["bus_id"],
            "color": g["color"],
            "is_slack": g["is_slack"],
            "H": g["H"],
            "rotor_angle_deg": raw_traj[gid][::4],
            "relative_angle_deg": raw_rel_traj[gid][::4],
            "max_angle_deg": max(raw_rel_traj[gid]),
            "min_angle_deg": min(raw_rel_traj[gid])
        })

    fault_bus_name = str(base_net.bus.at[fault_bus_id, "name"]) if fault_bus_id in base_net.bus.index else f"Bus #{fault_bus_id}"

    return {
        "status": "STABLE" if is_stable else "UNSTABLE_POLE_SLIP",
        "fault_bus_id": fault_bus_id,
        "fault_bus_name": fault_bus_name,
        "fault_duration_ms": fault_duration_ms,
        "cct_ms": round(cct_ms, 1),
        "cct_cycles": cct_cycles,
        "is_transiently_stable": is_stable,
        "unstable_generator": unstable_gen,
        "time": downsampled_time,
        "generators": gen_results,
        "statutory_protection_limit_ms": 150.0  # NERC standard 330kV line primary clearance: <= 150 ms (7.5 cycles)
    }