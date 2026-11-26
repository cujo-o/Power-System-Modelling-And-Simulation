"""Model registry endpoints for uploading, activating, listing, and deleting grid models."""

import copy
import logging
from typing import Any, Dict, Optional, Tuple

import pandapower as pp
from fastapi import APIRouter, File, HTTPException, UploadFile

from models.schemas import LoadPayloadRequest
from services.parser import extract_model_metadata, parse_network_file

logger = logging.getLogger("models_router")


def _find_entry_key(registry: Dict[str, Dict[str, Any]], identifier: str) -> Optional[str]:
    """Looks up a model key in `registry` by exact match, case-insensitive match, or stem."""
    target = identifier.strip().lower()
    target_stem = target[:-2] if target.endswith(".m") else target

    for key, entry in registry.items():
        key_lower = key.lower()
        name_lower = str(entry.get("name", "")).lower()
        key_stem = key_lower[:-2] if key_lower.endswith(".m") else key_lower
        name_stem = name_lower[:-2] if name_lower.endswith(".m") else name_lower
        if target in (key_lower, name_lower) or target_stem in (key_stem, name_stem):
            return key
    return None


def _public_meta(entry: Dict[str, Any], active_id: Optional[str]) -> Dict[str, Any]:
    """Returns a clean JSON-serializable metadata view without raw pandapowerNet objects."""
    return {
        "id": entry["id"],
        "name": entry["name"],
        "voltage_level": entry["voltage_level"],
        "platform": entry["platform"],
        "domain": entry["domain"],
        "buses": entry["buses"],
        "branches": entry["branches"],
        "total_installed_mw": entry["total_installed_mw"],
        "total_demand_mw": entry["total_demand_mw"],
        "is_active": entry["id"] == active_id,
        "converged": entry.get("converged", True),
    }


def _store_and_activate(
    registry: Dict[str, Dict[str, Any]],
    state: Dict[str, Any],
    net: pp.pandapowerNet,
    meta: Dict[str, Any],
) -> None:
    """Stores a parsed network in the shared in-memory registry and marks it active."""
    model_id = meta["id"]
    for existing in registry.values():
        existing["is_active"] = False

    registry[model_id] = {
        **meta,
        "net": net,
        "is_active": True,
    }
    state["active_model_id"] = model_id


def get_model_router(
    model_registry: Dict[str, Dict[str, Any]],
    state: Dict[str, Any],
) -> APIRouter:
    """Creates the model lifecycle router bound to the shared in-memory registry."""
    router = APIRouter(tags=["Models"])

    @router.post("/upload")
    async def upload_model(file: UploadFile = File(...)):
        """Parses an uploaded MATPOWER (.m) or pandapower (.json) file and activates it."""
        try:
            raw_bytes = await file.read()
            text_content = raw_bytes.decode("utf-8", errors="replace")
            filename = file.filename or "uploaded_model.m"

            net, platform = parse_network_file(text_content, filename)
            meta = extract_model_metadata(
                net=net,
                model_id=filename,
                name=filename,
                platform=platform,
                raw_text=text_content,
                include_payload=True,
            )
            _store_and_activate(model_registry, state, net, {k: v for k, v in meta.items() if k != "network_payload"})
            return meta
        except Exception as exc:
            logger.exception("Failed to parse uploaded model")
            raise HTTPException(status_code=400, detail=f"Failed to parse simulation network: {exc}")

    @router.post("/load-payload")
    async def load_payload(req: LoadPayloadRequest):
        """Rehydrates a serialized pandapower JSON network into solver memory and activates it."""
        try:
            net = pp.from_json_string(req.network_payload)
            try:
                pp.runpp(net, numba=False)
            except Exception:
                pass

            model_id = req.name or req.id
            meta = extract_model_metadata(
                net=net,
                model_id=model_id,
                name=req.name or model_id,
                platform=req.platform or "MATPOWER",
                voltage_level=req.voltage_level,
                domain=req.domain,
            )
            _store_and_activate(model_registry, state, net, meta)
            return {"ok": True, "message": f"Activated {model_id}", **_public_meta(model_registry[model_id], state.get("active_model_id"))}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to load network payload: {exc}")

    def _activate(model_id: str) -> Dict[str, Any]:
        key = _find_entry_key(model_registry, model_id)
        if key is None:
            raise HTTPException(
                status_code=404,
                detail=f'No active model in memory matching "{model_id}".',
            )
        for k, entry in model_registry.items():
            entry["is_active"] = k == key
        state["active_model_id"] = key
        # Ensure clean network copy stays intact
        model_registry[key]["net"] = copy.deepcopy(model_registry[key]["net"])
        return {"ok": True, "message": f"Activated {key}", **_public_meta(model_registry[key], key)}

    @router.post("/activate/{model_id:path}")
    async def activate_model_by_prefix(model_id: str):
        """Activates a model already stored in solver memory."""
        return _activate(model_id)

    @router.post("/{model_id:path}/activate")
    async def activate_model_by_suffix(model_id: str):
        """Alias route to activate a model already stored in solver memory."""
        return _activate(model_id)

    @router.get("")
    @router.get("/")
    async def list_models():
        """Lists metadata for all grid models currently loaded in solver memory."""
        active_id = state.get("active_model_id")
        return [_public_meta(entry, active_id) for entry in model_registry.values()]

    @router.delete("/{model_id:path}")
    async def delete_model(model_id: str):
        """Removes a model from solver memory and advances the active model pointer if needed."""
        key = _find_entry_key(model_registry, model_id)
        if key is not None:
            model_registry.pop(key, None)
            if state.get("active_model_id") == key:
                next_id = next(iter(model_registry), None)
                state["active_model_id"] = next_id
                if next_id is not None:
                    model_registry[next_id]["is_active"] = True
        return {"ok": True, "message": f"Deleted {model_id}"}

    return router


def resolve_active_network(
    model_registry: Dict[str, Dict[str, Any]],
    state: Dict[str, Any],
) -> Tuple[Optional[pp.pandapowerNet], str]:
    """Returns `(net, name)` for the currently active model, or `(None, 'No Active Model')`."""
    active_id = state.get("active_model_id")
    if active_id and active_id in model_registry:
        entry = model_registry[active_id]
        return entry["net"], entry["name"]

    if active_id:
        matched_key = _find_entry_key(model_registry, str(active_id))
        if matched_key:
            state["active_model_id"] = matched_key
            entry = model_registry[matched_key]
            return entry["net"], entry["name"]

    if model_registry:
        first_key = next(iter(model_registry))
        state["active_model_id"] = first_key
        entry = model_registry[first_key]
        return entry["net"], entry["name"]

    return None, "No Active Model"
