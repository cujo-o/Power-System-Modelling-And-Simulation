from fastapi import APIRouter, UploadFile, File, HTTPException, Body
import pandapower as pp
import pandas as pd
import json

# Import the custom robust parser to fix the "no attribute 'from_matpower'" error
from ..services.parser import parse_matpower_m_file

# Safely import your central state management if it exists, otherwise define locally
try:
    from ..nigeria_grid import set_active_network
except ImportError:
    active_network = None
    active_model_name = None
    def set_active_network(net, name):
        global active_network, active_model_name
        active_network = net
        active_model_name = name

router = APIRouter()

@router.post("/upload")
async def upload_model(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text_content = content.decode("utf-8")
        
        # 1. Parse using the custom parser
        net = parse_matpower_m_file(text_content, file.filename)
        
        # 2. Set as active network in solver memory
        set_active_network(net, file.filename)
        
        # 3. Calculate topology metadata for the frontend
        total_mw = 0.0
        if "gen" in net and "max_p_mw" in net.gen:
            total_mw = net.gen["max_p_mw"].sum()
            
        total_demand = 0.0
        if "load" in net and "p_mw" in net.load:
            total_demand = net.load["p_mw"].sum()
            
        return {
            "id": file.filename,
            "name": file.filename,
            "buses": len(net.bus) if "bus" in net else 0,
            "branches": (len(net.line) if "line" in net else 0) + (len(net.trafo) if "trafo" in net else 0),
            "total_installed_mw": float(total_mw) if not pd.isna(total_mw) else 0.0,
            "total_demand_mw": float(total_demand) if not pd.isna(total_demand) else 0.0,
            "network_payload": pp.to_json(net)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse simulation network: {str(e)}")

@router.post("/load-payload")
async def load_payload(payload: dict = Body(...)):
    try:
        net_json = payload.get("network_payload")
        if not net_json:
            raise ValueError("No network_payload provided in request body.")
            
        net = pp.from_json_string(net_json)
        set_active_network(net, payload.get("name", "Loaded_Payload"))
        
        return {"message": "Model loaded successfully", "ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load network payload: {str(e)}")

@router.post("/activate/{model_id}")
async def activate_model(model_id: str):
    # If the model isn't active in memory, return 404 to trigger frontend hydration fallback
    raise HTTPException(status_code=404, detail="Model not in memory. Frontend will fallback to load-payload.")

@router.get("/")
async def get_models():
    return {"models": []}