from fastapi import APIRouter, UploadFile, File, HTTPException
import pandapower as pp
from models.schemas import LoadPayloadRequest
from services.parser import parse_and_register_file
from services.power_flow import solve_power_flow

def get_model_router(model_registry: dict, state_holder: dict):
    router = APIRouter(tags=["Models"])

    @router.get("/api/models")
    def list_models():
        return [
            {
                "id": m["id"],
                "name": m["name"],
                "voltage_level": m.get("voltage_level", "330kV"),
                "domain": m.get("domain", "Static & Dynamic"),
                "platform": m.get("platform", "MATPOWER"),
                "buses": m["buses"],
                "branches": m["branches"],
                "total_installed_mw": m["total_installed_mw"],
                "total_demand_mw": m["total_demand_mw"],
                "converged": m["converged"],
                "is_default": False,
                "is_active": (m["id"] == state_holder["active_id"])
            }
            for m in model_registry.values()
        ]

    @router.post("/api/models/load-payload")
    def load_model_from_payload(req: LoadPayloadRequest):
        """Restores a network topology from Supabase JSON string into active backend RAM."""
        try:
            net = pp.from_json_string(req.network_payload)
            sol = solve_power_flow(net, load_multiplier=1.0)
            
            installed_mw = float(net.gen.p_mw.sum()) if len(net.gen) > 0 else 0.0
            if len(net.ext_grid) > 0:
                installed_mw += 1000.0
            demand_mw = float(net.load.p_mw.sum()) if len(net.load) > 0 else 0.0

            model_registry[req.id] = {
                "id": req.id,
                "name": req.name,
                "voltage_level": req.voltage_level,
                "domain": req.domain,
                "platform": req.platform,
                "net": net,
                "buses": len(net.bus),
                "branches": len(net.line),
                "total_installed_mw": round(installed_mw, 1),
                "total_demand_mw": round(demand_mw, 1),
                "converged": sol["converged"],
                "is_default": False
            }
            state_holder["active_id"] = req.id
            return {"status": "success", "active_model_id": req.id, "name": req.name}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to restore model from payload: {str(e)}")

    @router.post("/api/models/{model_id}/activate")
    def activate_model(model_id: str):
        if model_id not in model_registry:
            raise HTTPException(status_code=404, detail="Model not currently in server cache. Please rehydrate from Supabase.")
        state_holder["active_id"] = model_id
        return {"status": "success", "active_model_id": model_id, "name": model_registry[model_id]["name"]}

    @router.delete("/api/models/{model_id}")
    def delete_model(model_id: str):
        if model_id in model_registry:
            del model_registry[model_id]
        if state_holder["active_id"] == model_id:
            state_holder["active_id"] = next(iter(model_registry.keys()), None)
        return {"status": "success", "active_model_id": state_holder["active_id"]}

        # In backend/routers/models.py or wherever get_active_model is configured:
def get_active_net_and_name():
    global active_model_id
    if not model_registry:
        return None, "No Models Available"
    
    # If no active model or active model missing, fallback to first available
    if not active_model_id or active_model_id not in model_registry:
        # Default to case330 if present, else first in registry
        default_candidate = next((k for k in model_registry.keys() if "330" in k.lower()), list(model_registry.keys())[0])
        active_model_id = default_candidate
        
    entry = model_registry[active_model_id]
    return entry["net"], entry["name"]

    @router.post("/api/grid/reset")
    def reset_grid():
        state_holder["active_id"] = next(iter(model_registry.keys()), None)
        return {"status": "success", "active_model_id": state_holder["active_id"]}

    @router.post("/api/upload/model")
    @router.post("/api/upload/matpower")
    async def upload_model(file: UploadFile = File(...)):
        raw_bytes = await file.read()
        try:
            entry = parse_and_register_file(file.filename, raw_bytes)
            model_registry[entry["id"]] = entry
            state_holder["active_id"] = entry["id"]
            return {
                "status": "success",
                "model_id": entry["id"],
                "filename": entry["name"],
                "format": entry["platform"],
                "voltage_level": entry["voltage_level"],
                "network_payload": pp.to_json(entry["net"]),
                "metrics": {
                    "buses": entry["buses"],
                    "branches": entry["branches"],
                    "total_installed_mw": entry["total_installed_mw"],
                    "total_demand_mw": entry["total_demand_mw"]
                },
                "converged": entry["converged"]
            }
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed to parse model: {str(e)}")

    return router