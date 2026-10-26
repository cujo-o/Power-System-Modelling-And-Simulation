import os
import re
import json
import logging
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException, Body
import pandapower as pp

logger = logging.getLogger("models_router")

# Safe imports compatible with both "uvicorn main:app" and package execution
try:
    from services.parser import parse_matpower_m_file
except ImportError:
    try:
        from ..services.parser import parse_matpower_m_file
    except ImportError:
        from backend.services.parser import parse_matpower_m_file

# Safe import for nigeria_grid active network storage
try:
    from nigeria_grid import set_active_network, get_active_network
except ImportError:
    try:
        from ..nigeria_grid import set_active_network, get_active_network
    except ImportError:
        _in_memory_network = None
        _in_memory_name = None

        def set_active_network(net, name):
            global _in_memory_network, _in_memory_name
            _in_memory_network = net
            _in_memory_name = name

        def get_active_network():
            global _in_memory_network, _in_memory_name
            return _in_memory_network, _in_memory_name

router = APIRouter()

# Supports main.py when it does: from routers.models import get_model_router
def get_model_router() -> APIRouter:
    return router


@router.post("/upload")
async def upload_model(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text_content = content.decode("utf-8", errors="replace")

        # 1. Parse using the custom parser (never calls pandapower.converter.from_matpower)
        net = parse_matpower_m_file(text_content, file.filename)

        # 2. Store in active solver memory
        set_active_network(net, file.filename)

        # 3. Compute telemetry metadata for frontend
        total_mw = 0.0
        if hasattr(net, "gen") and "max_p_mw" in net.gen:
            total_mw += float(net.gen["max_p_mw"].sum())
        if hasattr(net, "ext_grid") and "vm_pu" in net.ext_grid:
            total_mw += float(len(net.ext_grid) * 500.0)

        total_demand = 0.0
        if hasattr(net, "load") and "p_mw" in net.load:
            total_demand = float(net.load["p_mw"].sum())

        bus_count = len(net.bus) if hasattr(net, "bus") else 0
        line_count = len(net.line) if hasattr(net, "line") else 0
        trafo_count = len(net.trafo) if hasattr(net, "trafo") else 0
        branch_count = line_count + trafo_count

        v_level = "330kV"
        if "132" in file.filename:
            v_level = "132kV"
        elif "130" in file.filename:
            v_level = "130kV"
        elif hasattr(net, "bus") and "vn_kv" in net.bus and len(net.bus) > 0:
            median_kv = float(net.bus["vn_kv"].median())
            v_level = f"{int(round(median_kv))}kV"

        net_json = pp.to_json(net)

        return {
            "id": file.filename,
            "name": file.filename,
            "voltage_level": v_level,
            "buses": bus_count,
            "branches": branch_count,
            "total_installed_mw": round(total_mw, 1) if not pd.isna(total_mw) else 0.0,
            "total_demand_mw": round(total_demand, 1) if not pd.isna(total_demand) else 0.0,
            "network_payload": net_json,
        }
    except Exception as e:
        logger.error(f"Error parsing model: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse simulation network: {str(e)}",
        )


@router.post("/load-payload")
async def load_payload(payload: dict = Body(...)):
    try:
        net_json = payload.get("network_payload")
        if not net_json:
            raise ValueError("No network_payload provided in request.")

        net = pp.from_json_string(net_json)
        model_name = payload.get("name", "Loaded_Network")
        set_active_network(net, model_name)

        return {"ok": True, "message": f"Successfully activated {model_name} in memory"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load network payload: {str(e)}")


@router.post("/activate/{model_id}")
async def activate_model(model_id: str):
    net, name = get_active_network()
    clean_id = model_id.strip()

    if net is not None and name and (name == clean_id or name.startswith(clean_id)):
        return {"ok": True, "message": f"Model {name} active in memory"}

    # Not currently in memory; frontend hydrates via /load-payload or upload
    raise HTTPException(
        status_code=404,
        detail=f'No model active in memory matching "{clean_id}".',
    )


@router.get("")
@router.get("/")
async def list_models():
    net, name = get_active_network()
    models_list = []
    if net is not None and name:
        models_list.append({
            "id": name,
            "name": name,
            "buses": len(net.bus),
            "branches": len(net.line) + len(net.trafo),
            "is_active": True,
        })
    return models_list


@router.delete("/{model_id}")
async def delete_model(model_id: str):
    return {"ok": True, "message": f"Removed model {model_id}"}