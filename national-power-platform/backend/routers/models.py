from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import pandapower as pp
import json

class LoadPayloadRequest(BaseModel):
    id: str
    name: str
    voltage_level: Optional[str] = "330kV"
    domain: Optional[str] = "Static & Dynamic"
    platform: Optional[str] = "MATPOWER"
    network_payload: Any

def get_model_router(model_registry: Dict[str, Any], state: Dict[str, Any]):
    router = APIRouter(prefix="/api/models", tags=["Models"])

    @router.post("/load-payload")
    def load_payload(req: LoadPayloadRequest):
        try:
            # Reconstruct the pandapower network from JSON/dict payload
            payload_str = req.network_payload if isinstance(req.network_payload, str) else json.dumps(req.network_payload)
            net = pp.from_json_string(payload_str)
            
            model_registry[req.id] = {
                "name": req.name,
                "net": net,
                "voltage_level": req.voltage_level,
                "domain": req.domain,
                "platform": req.platform,
                "is_default": False
            }
            state["active_model_id"] = req.id
            return {"status": "SUCCESS", "active_model_id": req.id, "buses": len(net.bus)}
        except Exception as e:
            # If from_json fails or format differs, record entry
            raise HTTPException(status_code=400, detail=f"Failed to restore network topology: {str(e)}")

    @router.get("")
    @router.get("/")
    def list_models():
        active_id = state.get("active_model_id")
        results = []
        for mid, data in model_registry.items():
            net = data["net"]
            results.append({
                "id": mid,
                "name": data["name"],
                "voltage_level": data.get("voltage_level", "330kV"),
                "domain": data.get("domain", "Static & Dynamic"),
                "platform": data.get("platform", "MATPOWER"),
                "buses": len(net.bus) if net is not None else 0,
                "branches": len(net.line) if net is not None else 0,
                "total_installed_mw": round(float(net.gen.p_mw.sum()), 1) if net is not None and len(net.gen) > 0 else 0.0,
                "total_demand_mw": round(float(net.load.p_mw.sum()), 1) if net is not None and len(net.load) > 0 else 0.0,
                "is_active": (mid == active_id),
                "is_default": data.get("is_default", False),
            })
        return results

    @router.post("/activate/{model_id:path}")
    def activate_model(model_id: str):
        target_key = next((k for k in model_registry.keys() if k == model_id or k.lower() == model_id.lower()), None)
        if not target_key:
            raise HTTPException(status_code=404, detail=f"Model '{model_id}' not loaded in backend RAM.")
        
        state["active_model_id"] = target_key
        return {"status": "SUCCESS", "active_model_id": target_key}

    return router