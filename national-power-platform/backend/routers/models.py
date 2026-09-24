from fastapi import APIRouter, HTTPException
from typing import Dict, Any

def get_model_router(model_registry: Dict[str, Any], state: Dict[str, Any]):
    router = APIRouter(prefix="/api/models", tags=["Models"])

    def ensure_active_model():
        """Guarantees a model is active if models exist in registry."""
        if not model_registry:
            state["active_model_id"] = None
            return None, "No Models Available"

        curr_id = state.get("active_model_id")
        if not curr_id or curr_id not in model_registry:
            # Fallback priority: case10_nigeria_dynamic -> case330 -> first available
            preferred = ["case10_nigeria_dynamic.m", "case330.m"]
            candidate = None
            for p in preferred:
                if p in model_registry:
                    candidate = p
                    break
            if not candidate:
                candidate = list(model_registry.keys())[0]

            state["active_model_id"] = candidate

        active_id = state["active_model_id"]
        return model_registry[active_id]["net"], model_registry[active_id]["name"]

    @router.get("")
    @router.get("/")
    def list_models():
        ensure_active_model()
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

    @router.post("/activate/{model_id}")
    def activate_model(model_id: str):
        if model_id not in model_registry:
            raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")

        state["active_model_id"] = model_id
        return {
            "status": "SUCCESS",
            "active_model_id": model_id,
            "name": model_registry[model_id]["name"]
        }

    @router.delete("/{model_id}")
    def delete_model(model_id: str):
        if model_id not in model_registry:
            raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")

        if model_registry[model_id].get("is_default", False):
            raise HTTPException(status_code=400, detail="Cannot delete default base models.")

        del model_registry[model_id]

        if state.get("active_model_id") == model_id:
            state["active_model_id"] = None
            ensure_active_model()

        return {"status": "DELETED", "deleted_id": model_id}

    # CRITICAL: Always return the router instance
    return router