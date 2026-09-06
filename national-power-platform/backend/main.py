import os
import copy
import math
import tempfile
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import pandapower as pp
from nigeria_grid import get_nigeria_330kv

app = FastAPI(
    title="National Power System Simulation API",
    description="NRF-2025 Static Power Flow and Contingency Analysis Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_custom_net: Optional[pp.pandapowerNet] = None
active_model_name: str = "Nigeria 330kV Baseline Backbone"


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
        raise HTTPException(status_code=400, detail="Invalid file format. Only MATPOWER (.m) files are supported.")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".m") as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = tmp.name

        # Parse MATPOWER case into Pandapower structure
        net = pp.converter.from_mpc(tmp_path, f_hz=50.0)

        # Ensure bus_geodata exists as a DataFrame
        if "bus_geodata" not in net or net["bus_geodata"] is None:
            net["bus_geodata"] = pd.DataFrame(columns=["x", "y"], index=net.bus.index)

        # If coordinates are missing, arrange nodes in a clean radial topology
        if net["bus_geodata"].empty or net["bus_geodata"]["x"].isnull().all():
            num_buses = len(net.bus)
            center_x, center_y, radius = 300.0, 220.0, 160.0
            for i, b_idx in enumerate(net.bus.index):
                angle = 2 * math.pi * i / max(1, num_buses)
                net["bus_geodata"].loc[b_idx, "x"] = round(center_x + radius * math.cos(angle), 1)
                net["bus_geodata"].loc[b_idx, "y"] = round(center_y + radius * math.sin(angle), 1)

        # Topology Checks: Disconnected islanding
        connected_buses = set(net.line.from_bus).union(set(net.line.to_bus))
        if hasattr(net, "trafo") and len(net.trafo) > 0:
            connected_buses = connected_buses.union(set(net.trafo.hv_bus)).union(set(net.trafo.lv_bus))

        isolated_buses = [int(b) for b in net.bus.index if b not in connected_buses]

        # Initial Convergence Verification
        test_net = copy.deepcopy(net)
        converged = False
        try:
            pp.runpp(test_net, algorithm="nr", max_iteration=30, tolerance_mva=1e-3, numba=False)
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
                "islanding_detected": len(isolated_buses) > 0,
                "isolated_bus_ids": isolated_buses,
                "has_slack_bus": len(net.ext_grid) > 0,
            }
        }

    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse MATPOWER case: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/api/grid/reset")
def reset_to_baseline():
    global active_custom_net, active_model_name
    active_custom_net = None
    active_model_name = "Nigeria 330kV Baseline Backbone"
    return {"status": "success", "message": "Reverted to official Nigerian 330kV baseline."}


@app.post("/api/simulate/power-flow")
def run_power_flow(req: SimulationRequest):
    global active_custom_net

    base_net = active_custom_net if active_custom_net is not None else get_nigeria_330kv()
    net = copy.deepcopy(base_net)

    # 1. Scale active and reactive demand
    if req.load_multiplier != 1.0 and len(net.load) > 0:
        net.load["p_mw"] *= req.load_multiplier
        net.load["q_mvar"] *= req.load_multiplier

    # 2. Open breakers for N-1 contingency analysis
    for line_id in req.tripped_lines:
        if line_id in net.line.index:
            net.line.at[line_id, "in_service"] = False

    # 3. Execute Newton-Raphson AC power flow
    try:
        pp.runpp(net, algorithm="nr", max_iteration=30, tolerance_mva=1e-3, numba=False)
        converged = bool(net.converged)
    except Exception:
        converged = False

    if not converged:
        return {
            "converged": False,
            "message": "Power flow calculation diverged. Voltage collapse or electrical islanding detected.",
            "buses": [],
            "lines": []
        }

    # 4. Safe Bus Extraction (handles missing geodata gracefully)
    bus_geo = net.get("bus_geodata")
    buses = []
    for idx, row in net.bus.iterrows():
        x = 200.0
        y = 200.0
        if bus_geo is not None and not bus_geo.empty and idx in bus_geo.index:
            try:
                x = float(bus_geo.at[idx, "x"])
                y = float(bus_geo.at[idx, "y"])
            except Exception:
                pass

        vm_pu = float(net.res_bus.at[idx, "vm_pu"]) if "vm_pu" in net.res_bus.columns else 1.0
        va_deg = float(net.res_bus.at[idx, "va_degree"]) if "va_degree" in net.res_bus.columns else 0.0
        p_mw = float(net.res_bus.at[idx, "p_mw"]) if "p_mw" in net.res_bus.columns else 0.0
        q_mvar = float(net.res_bus.at[idx, "q_mvar"]) if "q_mvar" in net.res_bus.columns else 0.0

        buses.append({
            "id": int(idx),
            "name": str(row.get("name", f"Bus {idx}")),
            "zone": str(row.get("zone", "Substation")),
            "x": x,
            "y": y,
            "v_pu": round(vm_pu, 3),
            "va_deg": round(va_deg, 2),
            "p_mw": round(p_mw, 1),
            "q_mvar": round(q_mvar, 1),
        })

    # 5. Safe Branch Extraction
    lines = []
    for idx, row in net.line.iterrows():
        is_in_service = bool(row["in_service"])
        loading = round(float(net.res_line.at[idx, "loading_percent"]), 1) if is_in_service else 0.0
        flow = round(float(net.res_line.at[idx, "p_from_mw"]), 1) if is_in_service else 0.0
        ploss = round(float(net.res_line.at[idx, "pl_mw"]), 2) if is_in_service else 0.0

        lines.append({
            "id": int(idx),
            "name": str(row.get("name", f"Line {row['from_bus']}-{row['to_bus']}")),
            "from_bus": int(row["from_bus"]),
            "to_bus": int(row["to_bus"]),
            "in_service": is_in_service,
            "loading_percent": loading,
            "flow_mw": flow,
            "losses_mw": ploss
        })

    # 6. Global Balances
    gen_sum = float(net.res_gen.p_mw.sum()) if len(net.res_gen) > 0 else 0.0
    ext_sum = float(net.res_ext_grid.p_mw.sum()) if len(net.res_ext_grid) > 0 else 0.0
    total_gen = round(gen_sum + ext_sum, 1)

    total_load = round(float(net.res_load.p_mw.sum()), 1) if len(net.res_load) > 0 else 0.0
    total_losses = round(float(net.res_line.pl_mw.sum()), 1) if len(net.res_line) > 0 else 0.0

    power_imbalance = total_gen - total_load - total_losses
    frequency = round(50.0 + (power_imbalance / 3500.0), 2)

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