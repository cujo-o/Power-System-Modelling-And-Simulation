from fastapi import APIRouter, UploadFile, File, HTTPException
import pandapower as pp
from services.parser import parse_and_register_file

def get_model_router(model_registry: dict, state_holder: dict):
    router = APIRouter(tags=["Models"])

    @router.get("/api/models")
    def list_models():
        return [
            {
                "id": m["id"],
                "name": m["name"],
                "voltage_level": m.get("voltage_level", "330kV"),
                "domain": m.get("domain", "Steady-State"),
                "platform": m.get("platform", "MATPOWER"),
                "buses": m["buses"],
                "branches": m["branches"],
                "total_installed_mw": m["total_installed_mw"],
                "total_demand_mw": m["total_demand_mw"],
                "converged": m["converged"],
                "is_default": m.get("is_default", False),
                "is_active": (m["id"] == state_holder["active_id"])
            }
            for m in model_registry.values()
        ]

    @router.post("/api/models/{model_id}/activate")
    def activate_model(model_id: str):
        if model_id not in model_registry:
            raise HTTPException(status_code=404, detail="Model not found.")
        state_holder["active_id"] = model_id
        return {"status": "success", "active_model_id": model_id, "name": model_registry[model_id]["name"]}

    @router.delete("/api/models/{model_id}")
    def delete_model(model_id: str):
        if model_id not in model_registry:
            raise HTTPException(status_code=404, detail="Model not found.")
        if model_registry[model_id].get("is_default"):
            raise HTTPException(status_code=400, detail="Cannot delete default baseline.")
        del model_registry[model_id]
        if state_holder["active_id"] == model_id:
            state_holder["active_id"] = "nig-10-bus"
        return {"status": "success", "active_model_id": state_holder["active_id"]}

    @router.post("/api/grid/reset")
    def reset_grid():
        state_holder["active_id"] = "nig-10-bus"
        return {"status": "success", "active_model_id": state_holder["active_id"]}

    @router.post("/api/upload/model")
    @router.post("/api/upload/matpower")
    async def upload_model(file: UploadFile = File(...)):
        raw = await file.read()
        content = raw.decode("utf-8", errors="ignore")
        entry = parse_and_register_file(file.filename, content)
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
            }
        }

    return router