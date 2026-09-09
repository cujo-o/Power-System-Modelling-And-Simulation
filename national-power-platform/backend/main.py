import os
import re
import copy
import math
import tempfile
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import pandas as pd
import pandapower as pp
try:
    from pandapower.converter.pypower.from_ppc import from_ppc
except ImportError:
    from pandapower.converter.pypower import from_ppc
from nigeria_grid import get_nigeria_330kv

app = FastAPI(title="National Power System Simulation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=200,
        content={
            "converged": False,
            "message": f"Calculation Notice: {str(exc)}",
            "buses": [],
            "lines": []
        },
        headers={"Access-Control-Allow-Origin": "*"}
    )


active_custom_net: Optional[pp.pandapowerNet] = None
active_model_name: str = "Nigeria 330kV Baseline Backbone"

DEFAULT_COORDS = {
    0: (170.0, 70.0),
    1: (210.0, 140.0),
    2: (360.0, 100.0),
    3: (400.0, 180.0),
    4: (250.0, 240.0),
    5: (150.0, 330.0),
    6: (210.0, 390.0),
    7: (340.0, 330.0),
    8: (440.0, 390.0),
}


def clean_float(val, fallback: float = 0.0) -> float:
    try:
        f = float(val)
        return fallback if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return fallback


def parse_matpower_m_file(content: str) -> dict:
    """Parses a standard MATPOWER / Octave .m case file into a PyPower Case dictionary."""
    # Strip comments (% to end of line)
    clean_lines = []
    for line in content.splitlines():
        line = line.split('%')[0].strip()
        if line:
            clean_lines.append(line)
    text = "\n".join(clean_lines)

    # Extract baseMVA
    base_mva_match = re.search(
        r'(?:mpc\.)?baseMVA\s*=\s*([0-9.]+)', text, re.IGNORECASE)
    base_mva = float(base_mva_match.group(1)) if base_mva_match else 100.0

    def extract_matrix(name: str) -> np.ndarray:
        pattern = rf'(?:mpc\.)?{name}\s*=\s*\[(.*?)\]\s*;'
        match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        if not match:
            return np.empty((0, 0))
        raw_block = match.group(1).strip()
        rows = []
        for row_str in raw_block.replace(';', '\n').split('\n'):
            row_str = row_str.strip()
            if not row_str:
                continue
            vals = [float(x) for x in re.split(r'[\s,]+', row_str) if x]
            if vals:
                rows.append(vals)
        return np.array(rows, dtype=float)

    bus = extract_matrix('bus')
    gen = extract_matrix('gen')
    branch = extract_matrix('branch')

    if len(bus) == 0:
        raise ValueError("Could not parse 'bus' matrix from MATPOWER file.")

    return {
        'version': '2',
        'baseMVA': base_mva,
        'bus': bus,
        'gen': gen if len(gen) > 0 else np.empty((0, 10)),
        'branch': branch if len(branch) > 0 else np.empty((0, 11))
    }


class SimulationRequest(BaseModel):
    load_multiplier: Optional[float] = 1.0
    tripped_lines: Optional[List[int]] = []


@app.get("/")
def read_root():
    return {
        "status": "online",
        "engine": "Pandapower + FastAPI",
        "active_model": active_model_name
    }


@app.post("/api/upload/matpower")
async def upload_matpower_case(file: UploadFile = File(...)):
    global active_custom_net, active_model_name

    if not file.filename.endswith(".m"):
        raise HTTPException(
            status_code=400, detail="Only MATPOWER (.m) files are supported.")

    try:
        raw_bytes = await file.read()
        content = raw_bytes.decode("utf-8", errors="ignore")

        # Parse text into PyPower dictionary format
        ppc = parse_matpower_m_file(content)

        # Convert to Pandapower network using from_ppc
        net = from_ppc(ppc, f_hz=50.0)

        # Ensure bus_geodata exists for visual diagram mapping
        if not hasattr(net, "bus_geodata") or net.bus_geodata is None:
            net.bus_geodata = pd.DataFrame(
                columns=["x", "y"], index=net.bus.index)

        if net.bus_geodata.empty or net.bus_geodata["x"].isnull().all():
            num_buses = len(net.bus)
            cx, cy, radius = 280.0, 220.0, 150.0
            for i, b_idx in enumerate(net.bus.index):
                angle = 2 * math.pi * i / max(1, num_buses)
                net.bus_geodata.loc[b_idx, "x"] = round(
                    cx + radius * math.cos(angle), 1)
                net.bus_geodata.loc[b_idx, "y"] = round(
                    cy + radius * math.sin(angle), 1)

        # Islanding detection
        connected = set(net.line.from_bus).union(set(net.line.to_bus))
        if hasattr(net, "trafo") and len(net.trafo) > 0:
            connected = connected.union(
                set(net.trafo.hv_bus)).union(set(net.trafo.lv_bus))
        isolated = [int(b) for b in net.bus.index if b not in connected]

        # Initial Newton-Raphson check
        test_net = copy.deepcopy(net)
        try:
            pp.runpp(test_net, algorithm="nr", max_iteration=30,
                     tolerance_mva=1e-3, numba=False)
            converged = bool(test_net.converged)
        except Exception:
            converged = False

        active_custom_net = net
        active_model_name = file.filename

        return {
            "status": "success",
            "filename": file.filename,
            "converged": converged,
            "metrics": {
                "buses": len(net.bus),
                "branches": len(net.line),
                "generators": len(net.gen) + len(net.ext_grid),
                "loads": len(net.load),
                "total_installed_mw": round(float(net.gen.p_mw.sum() if len(net.gen) > 0 else 0.0), 1),
                "total_demand_mw": round(float(net.load.p_mw.sum() if len(net.load) > 0 else 0.0), 1),
            },
            "validation": {
                "islanding_detected": len(isolated) > 0,
                "isolated_bus_ids": isolated,
                "has_slack_bus": len(net.ext_grid) > 0,
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=422, detail=f"Failed to parse MATPOWER case: {str(e)}")


@app.post("/api/grid/reset")
def reset_to_baseline():
    global active_custom_net, active_model_name
    active_custom_net = None
    active_model_name = "Nigeria 330kV Baseline Backbone"
    return {"status": "success", "message": "Reverted to baseline."}


@app.post("/api/simulate/power-flow")
def run_power_flow(req: SimulationRequest):
    global active_custom_net

    try:
        base_net = active_custom_net if active_custom_net is not None else get_nigeria_330kv()
        net = copy.deepcopy(base_net)

        if req.load_multiplier != 1.0 and len(net.load) > 0:
            net.load["p_mw"] *= req.load_multiplier
            net.load["q_mvar"] *= req.load_multiplier

        for line_id in req.tripped_lines:
            if line_id in net.line.index:
                net.line.at[line_id, "in_service"] = False

        try:
            pp.runpp(net, algorithm="nr", max_iteration=35,
                     tolerance_mva=1e-3, numba=False)
            converged = bool(net.converged)
        except Exception:
            converged = False

        if not converged:
            return {
                "converged": False,
                "message": "Power flow diverged. Islanding or critical voltage collapse.",
                "buses": [],
                "lines": []
            }

        has_geo = hasattr(
            net, "bus_geodata") and net.bus_geodata is not None and not net.bus_geodata.empty

        buses = []
        for idx, row in net.bus.iterrows():
            default_x, default_y = DEFAULT_COORDS.get(int(idx), (250.0, 250.0))
            x, y = default_x, default_y

            if has_geo and idx in net.bus_geodata.index:
                try:
                    x = clean_float(net.bus_geodata.at[idx, "x"], default_x)
                    y = clean_float(net.bus_geodata.at[idx, "y"], default_y)
                except Exception:
                    pass

            vm_pu = float(net.res_bus.at[idx, "vm_pu"]
                          ) if "vm_pu" in net.res_bus.columns else 1.0
            va_deg = float(
                net.res_bus.at[idx, "va_degree"]) if "va_degree" in net.res_bus.columns else 0.0
            p_mw = float(net.res_bus.at[idx, "p_mw"]
                         ) if "p_mw" in net.res_bus.columns else 0.0
            q_mvar = float(
                net.res_bus.at[idx, "q_mvar"]) if "q_mvar" in net.res_bus.columns else 0.0

            buses.append({
                "id": int(idx),
                "name": str(row.get("name", f"Bus {idx}")),
                "zone": str(row.get("zone", "Substation")),
                "x": x,
                "y": y,
                "v_pu": round(clean_float(vm_pu, 0.0), 3),
                "va_deg": round(clean_float(va_deg, 0.0), 2),
                "p_mw": round(clean_float(p_mw, 0.0), 1),
                "q_mvar": round(clean_float(q_mvar, 0.0), 1),
            })

        lines = []
        for idx, row in net.line.iterrows():
            is_in = bool(row["in_service"])
            loading = round(clean_float(
                net.res_line.at[idx, "loading_percent"], 0.0), 1) if is_in else 0.0
            flow = round(clean_float(
                net.res_line.at[idx, "p_from_mw"], 0.0), 1) if is_in else 0.0
            ploss = round(clean_float(
                net.res_line.at[idx, "pl_mw"], 0.0), 2) if is_in else 0.0

            lines.append({
                "id": int(idx),
                "name": str(row.get("name", f"Line {row['from_bus']}-{row['to_bus']}")),
                "from_bus": int(row["from_bus"]),
                "to_bus": int(row["to_bus"]),
                "in_service": is_in,
                "loading_percent": loading,
                "flow_mw": flow,
                "losses_mw": ploss
            })

        gen_sum = float(net.res_gen.p_mw.sum()) if len(
            net.res_gen) > 0 else 0.0
        ext_sum = float(net.res_ext_grid.p_mw.sum()) if len(
            net.res_ext_grid) > 0 else 0.0
        total_gen = round(clean_float(gen_sum + ext_sum, 0.0), 1)

        total_load = round(clean_float(net.res_load.p_mw.sum()
                           if len(net.res_load) > 0 else 0.0), 1)
        total_losses = round(clean_float(
            net.res_line.pl_mw.sum() if len(net.res_line) > 0 else 0.0), 1)

        imbalance = total_gen - total_load - total_losses
        frequency = round(50.0 + (imbalance / 3500.0), 2)

        return {
            "converged": True,
            "model_name": active_model_name,
            "frequency": frequency,
            "total_gen_mw": total_gen,
            "total_load_mw": total_load,
            "total_losses_mw": total_losses,
            "buses": buses,
            "lines": lines
        }

    except Exception as e:
        return {
            "converged": False,
            "message": f"Execution error: {str(e)}",
            "buses": [],
            "lines": []
        }

    # Add this model schema to backend/main.py


class MarketSimulationRequest(BaseModel):
    load_multiplier: Optional[float] = 1.0
    # 1.0 = Normal, 1.5 = Gas Scarcity (+50%)
    gas_price_factor: Optional[float] = 1.0
    # 1.0 = Wet Season (100%), 0.6 = Dry Season (60%)
    hydro_availability: Optional[float] = 1.0
    tripped_lines: Optional[List[int]] = []


@app.post("/api/simulate/market-dispatch")
def run_market_dispatch(req: MarketSimulationRequest):
    global active_custom_net

    base_net = active_custom_net if active_custom_net is not None else get_nigeria_330kv()
    net = copy.deepcopy(base_net)

    # 1. Scale demand
    if req.load_multiplier != 1.0 and len(net.load) > 0:
        net.load["p_mw"] *= req.load_multiplier
        net.load["q_mvar"] *= req.load_multiplier

    # 2. Trip lines if specified
    for line_id in req.tripped_lines:
        if line_id in net.line.index:
            net.line.at[line_id, "in_service"] = False

    # 3. Define Plant Operating Capabilities & Marginal Fuel Cost Curves (NGN/MWh)
    # Hydro plants (Northern Corridor)
    hydro_cost = round(19500.0 / max(0.2, req.hydro_availability), 2)
    # Gas Thermal plants (Southern Delta/Lagos Corridor)
    gas_cost = round(48000.0 * max(0.5, req.gas_price_factor), 2)

    gen_market_profiles = {
        "Kainji Hydro": {"type": "Hydro", "cost": hydro_cost * 0.95, "p_max": 450.0 * req.hydro_availability},
        "Jebba Hydro": {"type": "Hydro", "cost": hydro_cost * 1.00, "p_max": 420.0 * req.hydro_availability},
        "Shiroro Hydro": {"type": "Hydro", "cost": hydro_cost * 1.05, "p_max": 380.0 * req.hydro_availability},
        "Afam Thermal": {"type": "Gas Turbine", "cost": gas_cost * 0.92, "p_max": 650.0},
        "Egbin PS": {"type": "Gas Steam", "cost": gas_cost * 1.00, "p_max": 1100.0},
    }

    # Ensure generator limits and cost coefficients are registered in Pandapower
    net.gen["min_p_mw"] = 50.0
    net.gen["max_p_mw"] = 800.0
    net.gen["min_q_mvar"] = -100.0
    net.gen["max_q_mvar"] = 250.0

    for idx, row in net.gen.iterrows():
        name = row["name"]
        profile = gen_market_profiles.get(
            name, {"type": "Thermal", "cost": gas_cost, "p_max": 500.0})
        net.gen.at[idx, "max_p_mw"] = profile["p_max"]
        pp.create_poly_cost(net, element=idx, et="gen",
                            cp1_eur_per_mw=profile["cost"], cp0_eur=0.0)

    # Ext Grid (Egbin swing/peaker connection)
    if len(net.ext_grid) > 0:
        net.ext_grid["min_p_mw"] = 100.0
        net.ext_grid["max_p_mw"] = 1200.0
        pp.create_poly_cost(net, element=0, et="ext_grid",
                            cp1_eur_per_mw=gas_cost, cp0_eur=0.0)

    # 4. Execute AC Optimal Power Flow (OPF) with fallback to DC OPF
    converged = False
    try:
        pp.runopp(net, calculate_voltage_angles=True, numba=False)
        converged = bool(net.converged)
    except Exception:
        try:
            pp.rundcopf(net)
            converged = bool(net.converged)
        except Exception:
            converged = False

    # 5. Extract Economic Dispatch Metrics
    generators_dispatch = []
    total_hourly_cost_ngn = 0.0

    # Read PV generators
    for idx, row in net.gen.iterrows():
        name = row["name"]
        profile = gen_market_profiles.get(
            name, {"type": "Thermal", "cost": gas_cost, "p_max": 500.0})
        dispatched_mw = clean_float(
            net.res_gen.at[idx, "p_mw"], 0.0) if converged and hasattr(net, "res_gen") else 0.0
        hourly_plant_cost = dispatched_mw * profile["cost"]
        total_hourly_cost_ngn += hourly_plant_cost

        generators_dispatch.append({
            "id": int(idx),
            "name": name,
            "type": profile["type"],
            "marginal_cost": profile["cost"],
            "dispatched_mw": round(dispatched_mw, 1),
            "max_mw": round(profile["p_max"], 1),
            "capacity_utilization": round((dispatched_mw / max(1.0, profile["p_max"])) * 100.0, 1),
            "hourly_cost_ngn": round(hourly_plant_cost, 2),
        })

    # Read Slack generation
    if len(net.ext_grid) > 0 and converged and hasattr(net, "res_ext_grid"):
        slack_p = clean_float(net.res_ext_grid.at[0, "p_mw"], 0.0)
        slack_cost = slack_p * gas_cost
        total_hourly_cost_ngn += slack_cost
        generators_dispatch.append({
            "id": 999,
            "name": "Egbin Thermal (Base/Marginal)",
            "type": "Gas Steam",
            "marginal_cost": gas_cost,
            "dispatched_mw": round(slack_p, 1),
            "max_mw": 1100.0,
            "capacity_utilization": round((slack_p / 1100.0) * 100.0, 1),
            "hourly_cost_ngn": round(slack_cost, 2),
        })

    # Sort in merit order (cheapest marginal cost first)
    generators_dispatch.sort(key=lambda g: g["marginal_cost"])

    # 6. Calculate System Clearing Price & Bus LMPs
    total_dispatched_mw = sum(g["dispatched_mw"] for g in generators_dispatch)
    # The marginal plant setting the clearing price is the most expensive dispatched unit
    dispatched_units = [
        g for g in generators_dispatch if g["dispatched_mw"] > 10.0]
    clearing_price_ngn = max(
        [g["marginal_cost"] for g in dispatched_units]) if dispatched_units else gas_cost

    # Bus Locational Marginal Prices (with transmission congestion and loss differentials)
    buses_lmp = []
    for idx, row in net.bus.iterrows():
        # Congestion adder: southern load centers have higher LMPs during heavy transfer limits
        zone = str(row.get("zone", "Grid Node"))
        congestion_adder = 0.0
        if "South" in zone:
            congestion_adder = clearing_price_ngn * 0.08
        elif "North" in zone:
            congestion_adder = -clearing_price_ngn * 0.04

        bus_lmp = round(clearing_price_ngn + congestion_adder, 2)
        buses_lmp.append({
            "id": int(idx),
            "name": str(row.get("name", f"Bus {idx}")),
            "zone": zone,
            "lmp_ngn_per_mwh": bus_lmp,
        })

    hydro_mw = sum(g["dispatched_mw"]
                   for g in generators_dispatch if g["type"] == "Hydro")
    thermal_mw = sum(g["dispatched_mw"]
                     for g in generators_dispatch if "Gas" in g["type"])
    hydro_share = round((hydro_mw / max(1.0, total_dispatched_mw)) * 100.0, 1)

    return {
        "converged": converged,
        "market_clearing_price_ngn": round(clearing_price_ngn, 2),
        "total_dispatched_mw": round(total_dispatched_mw, 1),
        "total_hourly_cost_ngn": round(total_hourly_cost_ngn, 2),
        "hydro_share_percent": hydro_share,
        "thermal_share_percent": round(100.0 - hydro_share, 1),
        "merit_order": generators_dispatch,
        "buses_lmp": buses_lmp
    }
