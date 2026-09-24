from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Dict, Any, Optional
import pandapower as pp
import json
import tempfile
import os
import uuid

class LoadPayloadRequest(BaseModel):
    id: str
    name: str
    voltage_level: Optional[str] = "330kV"
    domain: Optional[str] = "Static & Dynamic"
    platform: Optional[str] = "MATPOWER"
    network_payload: Any

def get_model_router(model_registry: Dict[str, Any], state: Dict[str, Any]):
    # Note: No prefix here so main.py manages the prefix cleanly without duplication
    router = APIRouter(tags=["Models"])

    @router.post("/upload")
    async def upload_model(file: UploadFile = File(...)):
        """Parses user-uploaded network files (.m, .json, .xlsx) into Pandapower."""
        filename = file.filename or "uploaded_network.m"
        ext = os.path.splitext(filename)[1].lower()

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        net = None
        detected_format = "MATPOWER"
        try:
            if ext == ".m":
                net = pp.converter.from_matpower(tmp_path)
                detected_format = "MATPOWER (.m)"
            elif ext == ".json":
                net = pp.from_json(tmp_path)
                detected_format = "JSON"
            elif ext in [".xlsx", ".xls"]:
                net = pp.from_excel(tmp_path)
                detected_format = "Excel"
            else:
                raise ValueError(f"Unsupported file format: {ext}")
        except Exception as e:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise HTTPException(status_code=400, detail=f"Failed to parse simulation network: {str(e)}")

        if os.path.exists(tmp_path):
            os.remove(tmp_path)

        if net is None or len(net.bus) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file contains no bus topology.")

        # Ensure a reference (slack) bus exists
        if len(net.ext_grid) == 0:
            if len(net.gen) > 0:
                first_gen = net.gen.index[0]
                pp.create_ext_grid(net, bus=int(net.gen.at[first_gen, "bus"]), vm_pu=1.05, name="Slack Bus")
                net.gen.drop(first_gen, inplace=True)
            elif len(net.bus) > 0:
                pp.create_ext_grid(net, bus=int(net.bus.index[0]), vm_pu=1.05, name="Slack Bus")

        model_id = f"model-{uuid.uuid4().hex[:8]}"
        payload_str = pp.to_json(net)

        model_data = {
            "name": filename,
            "net": net,
            "voltage_level": "330kV",
            "domain": "Static & Dynamic",
            "platform": detected_format,
            "is_default": False
        }
        model_registry[model_id] = model_data
        model_registry[filename] = model_data
        state["active_model_id"] = model_id

        total_gen = round(float(net.gen.p_mw.sum()), 1) if hasattr(net, "gen") and len(net.gen) > 0 else 0.0
        total_load = round(float(net.load.p_mw.sum()), 1) if hasattr(net, "load") and len(net.load) > 0 else 0.0

        return {
            "model_id": model_id,
            "filename": filename,
            "format": detected_format,
            "voltage_level": "330kV",
            "converged": True,
            "metrics": {
                "buses": len(net.bus),
                "branches": len(net.line),
                "total_installed_mw": total_gen,
                "total_demand_mw": total_load,
            },
            "network_payload": payload_str
        }

    @router.post("/load-payload")
    def load_payload(req: LoadPayloadRequest):
        """Hydrates network topology from Supabase directly into backend memory."""
        payload = req.network_payload
        net = None

        try:
            if isinstance(payload, str):
                try:
                    net = pp.from_json_string(payload)
                except Exception:
                    parsed = json.loads(payload)
                    net = pp.from_json_string(parsed if isinstance(parsed, str) else json.dumps(parsed))
            elif isinstance(payload, dict):
                net = pp.from_json_string(json.dumps(payload))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to restore network topology: {str(e)}")

        if net is None:
            raise HTTPException(status_code=400, detail="Could not reconstruct grid topology from payload.")

        # Ensure reference (slack) bus exists
        if len(net.ext_grid) == 0:
            if len(net.gen) > 0:
                first_gen = net.gen.index[0]
                pp.create_ext_grid(net, bus=int(net.gen.at[first_gen, "bus"]), vm_pu=1.05, name="Slack Bus")
                net.gen.drop(first_gen, inplace=True)
            elif len(net.bus) > 0:
                pp.create_ext_grid(net, bus=int(net.bus.index[0]), vm_pu=1.05, name="Slack Bus")

        model_entry = {
            "name": req.name or req.id,
            "net": net,
            "voltage_level": req.voltage_level or "330kV",
            "domain": req.domain or "Static & Dynamic",
            "platform": req.platform or "MATPOWER",
            "is_default": False
        }

        # Index by both ID and Name to guarantee lookup consistency
        model_registry[req.id] = model_entry
        if req.name:
            model_registry[req.name] = model_entry
        state["active_model_id"] = req.id

        return {
            "status": "SUCCESS",
            "active_model_id": req.id,
            "buses": len(net.bus),
            "branches": len(net.line)
        }

    @router.get("")
    @router.get("/")
    def list_models():
        active_id = state.get("active_model_id")
        results = []
        seen = set()

        for mid, data in model_registry.items():
            name = data.get("name", mid)
            if name in seen:
                continue
            seen.add(name)

            net = data.get("net")
            results.append({
                "id": mid,
                "name": name,
                "voltage_level": data.get("voltage_level", "330kV"),
                "domain": data.get("domain", "Static & Dynamic"),
                "platform": data.get("platform", "MATPOWER"),
                "buses": len(net.bus) if net is not None and hasattr(net, "bus") else 0,
                "branches": len(net.line) if net is not None and hasattr(net, "line") else 0,
                "total_installed_mw": round(float(net.gen.p_mw.sum()), 1) if net is not None and hasattr(net, "gen") and len(net.gen) > 0 else 0.0,
                "total_demand_mw": round(float(net.load.p_mw.sum()), 1) if net is not None and hasattr(net, "load") and len(net.load) > 0 else 0.0,
                "is_active": (mid == active_id or name == active_id),
                "is_default": False,
            })
        return results

    @router.post("/activate/{model_id:path}")
    def activate_model(model_id: str):
        target_key = next((k for k in model_registry.keys() if k == model_id or k.lower() == model_id.lower()), None)
        if not target_key:
            raise HTTPException(status_code=404, detail=f"Model '{model_id}' is not in memory. Re-hydrate required.")
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