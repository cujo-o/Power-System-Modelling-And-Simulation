from fastapi import APIRouter, UploadFile, File, HTTPException
import pandapower as pp
from services.parser import parse_and_register_file
from services.grid_builder import build_case330, build_nig_10_bus

def get_model_router(model_registry: dict, state_holder: dict):
    router = APIRouter(tags=["Models"])

    # Register built-ins explicitly
    if "nig-10-bus" not in model_registry:
        model_registry["nig-10-bus"] = {
            "id": "nig-10-bus",
            "name": "Nig 10-Bus Benchmark Grid",
            "voltage_level": "330kV",
            "domain": "Static & Dynamic",
            "platform": "MATPOWER / PSAT",
            "net": build_nig_10_bus(),
            "buses": 10,
            "branches": 10,
            "total_installed_mw": 2690.0,
            "total_demand_mw": 1386.9,
            "converged": True,
            "is_default": True
        }

    if "case-330kv-63" not in model_registry:
        model_registry["case-330kv-63"] = {
            "id": "case-330kv-63",
            "name": "Nigeria 330kV NISO Grid (63 Buses)",
            "voltage_level": "330kV",
            "domain": "Static & Dynamic",
            "platform": "DIgSILENT / MATPOWER",
            "net": build_case330(),
            "buses": 63,
            "branches": 29,
            "total_installed_mw": 4850.0,
            "total_demand_mw": 3397.7,
            "converged": True,
            "is_default": False
        }

    if "case-132kv-369" not in model_registry:
        model_registry["case-132kv-369"] = {
            "id": "case-132kv-369",
            "name": "NISO 132/330 kV Integrated Grid (369 Buses)",
            "voltage_level": "132kV",
            "domain": "Static Power Flow",
            "platform": "MATPOWER / PSAT",
            "net": build_case330(),
            "buses": 369,
            "branches": 516,
            "total_installed_mw": 13337.6,
            "total_demand_mw": 5799.6,
            "converged": True,
            "is_default": False
        }

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