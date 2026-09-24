from fastapi import APIRouter, HTTPException
from typing import Dict, Any

def get_model_router(model_registry: Dict[str, Any], state: Dict[str, Any]):
    router = APIRouter(prefix="/api/models", tags=["Models"])

    def resolve_active():
        """Guarantees an active model is always set if models exist."""
        if not model_registry:
            state["active_model_id"] = None
            return None, "No Models Available"

        curr = state.get("active_model_id")
        if not curr or curr not in model_registry:
            # Fallback to case10, case330, or the first registered case
            candidates = [k for k in model_registry.keys() if "10" in k or "330" in k]
            chosen = candidates[0] if candidates else list(model_registry.keys())[0]
            state["active_model_id"] = chosen

        active_id = state["active_model_id"]
        return model_registry[active_id]["net"], model_registry[active_id]["name"]

    @router.get("")
    @router.get("/")
    def list_models():
        resolve_active()
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
        # Flexible lookup: exact, stripped of .m, or case-insensitive
        target_key = None
        for key in model_registry.keys():
            if key == model_id or key.lower() == model_id.lower() or key.replace(".m", "") == model_id.replace(".m", ""):
                target_key = key
                break

        if not target_key:
            raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found in registry.")

        state["active_model_id"] = target_key
        return {
            "status": "SUCCESS",
            "active_model_id": target_key,
            "name": model_registry[target_key]["name"]
        }

    @router.delete("/{model_id:path}")
    def delete_model(model_id: str):
        target_key = next((k for k in model_registry.keys() if k == model_id or k.lower() == model_id.lower()), None)
        if not target_key:
            raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")

        if model_registry[target_key].get("is_default", False):
            raise HTTPException(status_code=400, detail="Cannot delete default system models.")

        del model_registry[target_key]
        if state.get("active_model_id") == target_key:
            state["active_model_id"] = None
            resolve_active()

        return {"status": "DELETED", "deleted_id": target_key}

    return router