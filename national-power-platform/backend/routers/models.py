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
            payload = req.network_payload
            net = None
            
            # Stringified JSON
            if isinstance(payload, str):
                try:
                    net = pp.from_json_string(payload)
                except Exception:
                    try:
                        parsed = json.loads(payload)
                        if isinstance(parsed, str):
                            net = pp.from_json_string(parsed)
                        elif isinstance(parsed, dict):
                            net = pp.from_json_string(json.dumps(parsed))
                    except Exception as e:
                        print("Payload string parsing failed:", e)

            # JSONB Dictionary from Supabase
            elif isinstance(payload, dict):
                try:
                    net = pp.from_json_string(json.dumps(payload))
                except Exception as e:
                    print("Payload dictionary serialization failed:", e)

            if net is None:
                raise ValueError("Could not parse network payload into pandapower network.")

            model_registry[req.id] = {
                "name": req.name,
                "net": net,
                "voltage_level": req.voltage_level or "330kV",
                "domain": req.domain or "Static & Dynamic",
                "platform": req.platform or "MATPOWER",
                "is_default": False
            }
            state["active_model_id"] = req.id
            return {
                "status": "SUCCESS",
                "active_model_id": req.id,
                "buses": len(net.bus) if hasattr(net, "bus") else 0,
                "branches": len(net.line) if hasattr(net, "line") else 0
            }
        except Exception as e:
            print("load_payload error:", str(e))
            raise HTTPException(status_code=400, detail=f"Failed to restore network topology: {str(e)}")

    @router.get("")
    @router.get("/")
    def list_models():
        active_id = state.get("active_model_id")
        results = []
        for mid, data in model_registry.items():
            net = data.get("net")
            results.append({
                "id": mid,
                "name": data.get("name", mid),
                "voltage_level": data.get("voltage_level", "330kV"),
                "domain": data.get("domain", "Static & Dynamic"),
                "platform": data.get("platform", "MATPOWER"),
                "buses": len(net.bus) if net is not None and hasattr(net, "bus") else 0,
                "branches": len(net.line) if net is not None and hasattr(net, "line") else 0,
                "total_installed_mw": round(float(net.gen.p_mw.sum()), 1) if net is not None and hasattr(net, "gen") and len(net.gen) > 0 else 0.0,
                "total_demand_mw": round(float(net.load.p_mw.sum()), 1) if net is not None and hasattr(net, "load") and len(net.load) > 0 else 0.0,
                "is_active": (mid == active_id),
                "is_default": data.get("is_default", False),
            })
        return results

    @router.post("/activate/{model_id:path}")
    def activate_model(model_id: str):
        target_key = next((k for k in model_registry.keys() if k == model_id or k.lower() == model_id.lower()), None)
        if not target_key:
            raise HTTPException(status_code=404, detail=f"Model '{model_id}' is not loaded in backend RAM.")
        state["active_model_id"] = target_key
        return {"status": "SUCCESS", "active_model_id": target_key}

    @router.delete("/{model_id:path}")
    def delete_model(model_id: str):
        target_key = next((k for k in model_registry.keys() if k == model_id or k.lower() == model_id.lower()), None)
        if not target_key:
            raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")
        del model_registry[target_key]
        if state.get("active_model_id") == target_key:
            state["active_model_id"] = None
        return {"status": "DELETED", "deleted_id": target_key}

    return router