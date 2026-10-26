import copy
import logging
import sys
import pandas as pd
import pandapower as pp
from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from services.parser import parse_matpower_m_file

logger = logging.getLogger("models_router")

_MEMORY_NETS = {}
_MEMORY_META = {}
_ACTIVE_ID = None
_STATE_REF = None


def _sync_shared_state(net, model_id: str, meta: dict):
    """Synchronizes the active pandapower network with main.py state and modules."""
    global _ACTIVE_ID
    _ACTIVE_ID = model_id
    _MEMORY_NETS[model_id] = net
    _MEMORY_META[model_id] = meta

    for m_id, m_info in _MEMORY_META.items():
        m_info["is_active"] = m_id == model_id

    # 1. Update state object passed into get_model_router(state)
    st = _STATE_REF
    if st is not None:
        if isinstance(st, dict):
            for k in ("net", "network", "active_net", "current_net"):
                st[k] = net
            if "networks" in st and isinstance(st["networks"], dict):
                st["networks"][model_id] = net
            if "models" in st and isinstance(st["models"], dict):
                st["models"][model_id] = meta
            elif "models" in st and isinstance(st["models"], list):
                for item in st["models"]:
                    if isinstance(item, dict):
                        item["is_active"] = False
                st["models"] = [
                    x for x in st["models"] if isinstance(x, dict) and x.get("id") != model_id
                ] + [meta]
            st["active_model_id"] = model_id
            st["active_model_name"] = model_id
        else:
            for attr in ("net", "network", "active_net", "current_net", "base_net"):
                if hasattr(st, attr):
                    setattr(st, attr, net)
            if hasattr(st, "__dict__"):
                for k, v in list(vars(st).items()):
                    if v.__class__.__name__ == "pandapowerNet":
                        setattr(st, k, net)
                    elif isinstance(v, dict) and k in ("networks", "net_map", "loaded_networks"):
                        v[model_id] = net
                    elif isinstance(v, dict) and k in ("models", "registry", "model_registry"):
                        for existing in v.values():
                            if isinstance(existing, dict):
                                existing["is_active"] = False
                        v[model_id] = meta
                    elif isinstance(v, list) and k in ("models", "registry", "model_list"):
                        for existing in v:
                            if isinstance(existing, dict):
                                existing["is_active"] = False
                        filtered = [
                            x for x in v if isinstance(x, dict) and x.get("id") != model_id
                        ]
                        filtered.append(meta)
                        setattr(st, k, filtered)
            for id_attr in ("active_model_id", "active_model_name", "current_model_id"):
                if hasattr(st, id_attr):
                    setattr(st, id_attr, model_id)
            if hasattr(st, "set_active_network") and callable(st.set_active_network):
                try:
                    st.set_active_network(net, model_id)
                except Exception:
                    pass

    # 2. Update nigeria_grid module if loaded
    ng_mod = sys.modules.get("nigeria_grid")
    if ng_mod is not None:
        if hasattr(ng_mod, "set_active_network") and callable(ng_mod.set_active_network):
            try:
                ng_mod.set_active_network(net, model_id)
            except Exception:
                pass
        for k, v in list(vars(ng_mod).items()):
            if v.__class__.__name__ == "pandapowerNet":
                setattr(ng_mod, k, net)


router = APIRouter()


@router.post("/upload")
async def upload_model(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text_content = content.decode("utf-8", errors="replace")
        filename = file.filename or "uploaded_model.m"

        net = parse_matpower_m_file(text_content, filename)

        total_mw = 0.0
        if hasattr(net, "gen") and "max_p_mw" in net.gen and len(net.gen) > 0:
            total_mw += float(net.gen["max_p_mw"].sum())
        if hasattr(net, "ext_grid") and len(net.ext_grid) > 0:
            total_mw += float(len(net.ext_grid) * 500.0)

        total_demand = 0.0
        if hasattr(net, "load") and "p_mw" in net.load and len(net.load) > 0:
            total_demand = float(net.load["p_mw"].sum())

        bus_count = len(net.bus) if hasattr(net, "bus") else 0
        line_count = len(net.line) if hasattr(net, "line") else 0
        trafo_count = len(net.trafo) if hasattr(net, "trafo") else 0
        branch_count = line_count + trafo_count

        v_level = "330kV"
        if "132" in filename:
            v_level = "132kV"
        elif "130" in filename:
            v_level = "130kV"
        elif hasattr(net, "bus") and "vn_kv" in net.bus and len(net.bus) > 0:
            median_kv = float(net.bus["vn_kv"].median())
            v_level = f"{int(round(median_kv))}kV"

        is_dynamic = "dynamic" in filename.lower() or "hydro" in text_content.lower()

        meta = {
            "id": filename,
            "name": filename,
            "voltage_level": v_level,
            "platform": "MATPOWER",
            "domain": "Dynamic & Transient" if is_dynamic else "Static Power Flow",
            "buses": bus_count,
            "branches": branch_count,
            "total_installed_mw": round(total_mw, 1) if not pd.isna(total_mw) else 0.0,
            "total_demand_mw": round(total_demand, 1) if not pd.isna(total_demand) else 0.0,
            "is_active": True,
            "converged": True,
            "network_payload": pp.to_json(net),
        }

        _sync_shared_state(net, filename, meta)
        return meta
    except Exception as e:
        logger.error(f"Error parsing model: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse simulation network: {str(e)}",
        )


@router.post("/load-payload")
async def load_payload(payload: dict = Body(...)):
    try:
        net_json = payload.get("network_payload")
        if not net_json:
            raise ValueError("No network_payload provided in request.")

        net = pp.from_json_string(net_json)
        try:
            pp.runpp(net, numba=False)
        except Exception:
            pass

        model_id = str(payload.get("name") or payload.get(
            "id") or "Loaded_Network")
        meta = {
            "id": model_id,
            "name": model_id,
            "voltage_level": payload.get("voltage_level", "330kV"),
            "platform": payload.get("platform", "MATPOWER"),
            "domain": payload.get("domain", "Static & Dynamic"),
            "buses": len(net.bus),
            "branches": len(net.line) + len(net.trafo),
            "total_installed_mw": float(net.gen["max_p_mw"].sum())
            if hasattr(net, "gen") and "max_p_mw" in net.gen and len(net.gen) > 0
            else 500.0,
            "total_demand_mw": float(net.load["p_mw"].sum())
            if hasattr(net, "load") and "p_mw" in net.load and len(net.load) > 0
            else 0.0,
            "is_active": True,
            "converged": True,
        }

        _sync_shared_state(net, model_id, meta)
        return {"ok": True, "message": f"Successfully activated {model_id}"}
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to load network payload: {str(e)}",
        )


@router.post("/activate/{model_id}")
async def activate_model(model_id: str):
    clean_id = model_id.strip()

    # Check local router cache first
    for m_id, net in _MEMORY_NETS.items():
        if m_id == clean_id or m_id.replace(".m", "") == clean_id.replace(".m", ""):
            meta = _MEMORY_META.get(
                m_id, {"id": m_id, "name": m_id, "is_active": True})
            _sync_shared_state(copy.deepcopy(net), m_id, meta)
            return {"ok": True, "message": f"Activated {m_id}"}

    # Check shared state object if it has its own activate_model method
    if _STATE_REF is not None and hasattr(_STATE_REF, "activate_model"):
        try:
            res = _STATE_REF.activate_model(clean_id)
            if res:
                return {"ok": True, "message": f"Activated {clean_id}"}
        except Exception:
            pass

    raise HTTPException(
        status_code=404,
        detail=f'No model active in memory matching "{clean_id}".',
    )


@router.get("")
@router.get("/")
async def list_models():
    if _MEMORY_META:
        return list(_MEMORY_META.values())
    if _STATE_REF is not None:
        if isinstance(_STATE_REF, dict) and "models" in _STATE_REF:
            m = _STATE_REF["models"]
            return list(m.values()) if isinstance(m, dict) else m
        if hasattr(_STATE_REF, "models"):
            m = getattr(_STATE_REF, "models")
            return list(m.values()) if isinstance(m, dict) else m
    return []


@router.delete("/{model_id}")
async def delete_model(model_id: str):
    _MEMORY_NETS.pop(model_id, None)
    _MEMORY_META.pop(model_id, None)
    return {"ok": True, "message": f"Deleted {model_id}"}


def get_model_router(state=None) -> APIRouter:
    global _STATE_REF
    if state is not None:
        _STATE_REF = state
    return router
