import copy
import logging
import os
import sys
import pandas as pd
import pandapower as pp
from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from services.parser import parse_matpower_m_file

logger = logging.getLogger("models_router")

_MEMORY_NETS = {}
_MEMORY_META = {}
_ACTIVE_ID = None
_REGISTRY_REF = None
_STATE_REF = None


def _extract_net_from_item(item):
    """Extracts a pandapowerNet instance from a registry entry if present."""
    if item is None:
        return None
    if item.__class__.__name__ == "pandapowerNet":
        return item
    if isinstance(item, dict):
        for k in ("net", "network", "base_net", "pp_net"):
            if k in item and item[k].__class__.__name__ == "pandapowerNet":
                return item[k]
        if item.get("network_payload"):
            try:
                return pp.from_json_string(item["network_payload"])
            except Exception:
                pass
    else:
        for attr in ("net", "network", "base_net", "pp_net"):
            if hasattr(item, attr):
                val = getattr(item, attr)
                if val.__class__.__name__ == "pandapowerNet":
                    return val
    return None


def _serialize_meta(key: str, item, active_id: str = None) -> dict:
    """Builds a clean JSON-serializable metadata dictionary without raw pandapowerNet objects."""
    if isinstance(item, dict):
        net = _extract_net_from_item(item)
        m_id = str(item.get("id") or item.get("name") or key)
        m_name = str(item.get("name") or item.get("filename") or m_id)
        buses_cnt = int(
            item.get("buses")
            or item.get("bus_count")
            or (len(net.bus) if net is not None and hasattr(net, "bus") else 0)
        )
        branches_cnt = int(
            item.get("branches")
            or item.get("branch_count")
            or (
                (len(net.line) + len(net.trafo))
                if net is not None and hasattr(net, "line")
                else 0
            )
        )
        return {
            "id": m_id,
            "name": m_name,
            "voltage_level": str(
                item.get("voltage_level")
                or ("132kV" if "132" in m_name else "130kV" if "130" in m_name else "330kV")
            ),
            "platform": str(item.get("platform") or item.get("format") or "MATPOWER"),
            "domain": str(
                item.get("domain")
                or ("Dynamic & Transient" if "dynamic" in m_name.lower() else "Static Power Flow")
            ),
            "buses": buses_cnt,
            "branches": branches_cnt,
            "total_installed_mw": float(
                item.get("total_installed_mw") or item.get("capacity_mw") or 0.0
            ),
            "total_demand_mw": float(
                item.get("total_demand_mw") or item.get("demand_mw") or 0.0
            ),
            "is_active": bool(
                (active_id and (m_id == active_id or m_name == active_id))
                or item.get("is_active", False)
            ),
            "converged": bool(item.get("converged", True)),
            "is_default": bool(item.get("is_default", False)),
        }

    net = _extract_net_from_item(item)
    m_id = str(getattr(item, "id", None) or getattr(item, "name", None) or key)
    m_name = str(getattr(item, "name", None) or m_id)
    return {
        "id": m_id,
        "name": m_name,
        "voltage_level": str(
            getattr(item, "voltage_level", None)
            or ("132kV" if "132" in m_name else "330kV")
        ),
        "platform": str(getattr(item, "platform", "MATPOWER")),
        "domain": str(getattr(item, "domain", "Static Power Flow")),
        "buses": int(
            getattr(item, "buses", len(net.bus) if net is not None else 0)
        ),
        "branches": int(
            getattr(
                item,
                "branches",
                (len(net.line) + len(net.trafo)) if net is not None else 0,
            )
        ),
        "total_installed_mw": float(getattr(item, "total_installed_mw", 0.0)),
        "total_demand_mw": float(getattr(item, "total_demand_mw", 0.0)),
        "is_active": bool(
            (active_id and (m_id == active_id or m_name == active_id))
            or getattr(item, "is_active", False)
        ),
        "converged": True,
    }


def _sync_shared_state(net, model_id: str, meta: dict):
    """Synchronizes the active pandapower network into both model_registry and state."""
    global _ACTIVE_ID
    _ACTIVE_ID = model_id
    _MEMORY_NETS[model_id] = net
    _MEMORY_META[model_id] = meta

    for m_id, m_info in _MEMORY_META.items():
        m_info["is_active"] = m_id == model_id

    reg_entry = {
        **meta,
        "net": net,
        "network": net,
        "base_net": copy.deepcopy(net),
        "is_active": True,
    }

    # 1. Update model_registry
    reg = _REGISTRY_REF
    if reg is not None:
        if isinstance(reg, dict):
            for existing in reg.values():
                if isinstance(existing, dict):
                    existing["is_active"] = False
            reg[model_id] = reg_entry
        else:
            for dict_attr in ("models", "networks", "registry", "cases", "_models"):
                if hasattr(reg, dict_attr):
                    target = getattr(reg, dict_attr)
                    if isinstance(target, dict):
                        for existing in target.values():
                            if isinstance(existing, dict):
                                existing["is_active"] = False
                        target[model_id] = reg_entry
                    elif isinstance(target, list):
                        for existing in target:
                            if isinstance(existing, dict):
                                existing["is_active"] = False
                        filtered = [
                            x
                            for x in target
                            if isinstance(x, dict) and x.get("id") != model_id
                        ]
                        filtered.append(reg_entry)
                        setattr(reg, dict_attr, filtered)
            for id_attr in ("active_model_id", "active_id", "active_model", "current_id"):
                if hasattr(reg, id_attr):
                    curr_val = getattr(reg, id_attr)
                    if isinstance(curr_val, (str, type(None))):
                        setattr(reg, id_attr, model_id)

    # 2. Update state
    st = _STATE_REF
    if st is not None:
        if isinstance(st, dict):
            for k in list(st.keys()):
                if st[k].__class__.__name__ == "pandapowerNet" or k in (
                    "net",
                    "network",
                    "active_net",
                    "base_net",
                    "current_net",
                ):
                    st[k] = copy.deepcopy(net)
            for k in ("net", "network", "active_net", "base_net"):
                st[k] = copy.deepcopy(net)
            for k in ("active_model_id", "active_model_name", "model_id", "model_name"):
                st[k] = model_id
            if "models" in st and isinstance(st["models"], dict):
                st["models"][model_id] = reg_entry
        else:
            if hasattr(st, "__dict__"):
                for k, v in list(vars(st).items()):
                    if v.__class__.__name__ == "pandapowerNet":
                        setattr(st, k, copy.deepcopy(net))
                    elif isinstance(v, dict) and k in (
                        "networks",
                        "net_map",
                        "loaded_networks",
                    ):
                        v[model_id] = copy.deepcopy(net)
                    elif isinstance(v, dict) and k in (
                        "models",
                        "registry",
                        "model_registry",
                    ):
                        v[model_id] = reg_entry
            for attr in ("net", "network", "active_net", "base_net", "current_net"):
                if hasattr(st, attr):
                    setattr(st, attr, copy.deepcopy(net))
            for id_attr in (
                "active_model_id",
                "active_model_name",
                "current_model_id",
                "model_id",
                "model_name",
            ):
                if hasattr(st, id_attr):
                    curr_val = getattr(st, id_attr)
                    if isinstance(curr_val, (str, type(None))):
                        setattr(st, id_attr, model_id)
            if hasattr(st, "set_active_network") and callable(st.set_active_network):
                try:
                    st.set_active_network(copy.deepcopy(net), model_id)
                except Exception:
                    pass

    # 3. Update nigeria_grid module if present
    ng_mod = sys.modules.get("nigeria_grid")
    if ng_mod is not None:
        if hasattr(ng_mod, "set_active_network") and callable(ng_mod.set_active_network):
            try:
                ng_mod.set_active_network(copy.deepcopy(net), model_id)
            except Exception:
                pass
        for k, v in list(vars(ng_mod).items()):
            if v.__class__.__name__ == "pandapowerNet":
                setattr(ng_mod, k, copy.deepcopy(net))


router = APIRouter()


@router.post("/upload")
@router.post("/api/models/upload")
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
@router.post("/api/models/load-payload")
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

        model_id = str(payload.get("name") or payload.get("id") or "Loaded_Network")
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


def _find_model_in_registry(clean_id: str):
    """Searches _MEMORY_NETS, _REGISTRY_REF, and _STATE_REF for a matching model."""
    norm = clean_id.replace(".m", "").lower()

    for m_id, net in _MEMORY_NETS.items():
        if m_id.lower() == clean_id.lower() or m_id.replace(".m", "").lower() == norm:
            return m_id, net, _MEMORY_META.get(m_id, {})

    for source in (_REGISTRY_REF, _STATE_REF):
        if source is None:
            continue
        candidates = {}
        if isinstance(source, dict):
            candidates.update(source)
            if isinstance(source.get("models"), dict):
                candidates.update(source["models"])
            if isinstance(source.get("networks"), dict):
                candidates.update(source["networks"])
        else:
            for attr in ("models", "networks", "registry", "cases", "_models"):
                if hasattr(source, attr):
                    val = getattr(source, attr)
                    if isinstance(val, dict):
                        candidates.update(val)
                    elif isinstance(val, list):
                        for item in val:
                            if isinstance(item, dict) and (item.get("id") or item.get("name")):
                                candidates[str(item.get("id") or item.get("name"))] = item

        for k, v in candidates.items():
            k_str = str(k)
            v_name = str(v.get("name", "")) if isinstance(v, dict) else str(getattr(v, "name", ""))
            if (
                k_str.lower() == clean_id.lower()
                or k_str.replace(".m", "").lower() == norm
                or v_name.lower() == clean_id.lower()
                or v_name.replace(".m", "").lower() == norm
            ):
                net = _extract_net_from_item(v)
                if net is not None:
                    meta = _serialize_meta(k_str, v, k_str)
                    return k_str, net, meta

    return None, None, None


@router.post("/activate/{model_id}")
@router.post("/api/models/activate/{model_id}")
async def activate_model(model_id: str):
    clean_id = model_id.strip()

    matched_id, net, meta = _find_model_in_registry(clean_id)
    if net is not None:
        meta["is_active"] = True
        _sync_shared_state(copy.deepcopy(net), matched_id, meta)
        return {"ok": True, "message": f"Activated {matched_id}", **meta}

    for obj in (_REGISTRY_REF, _STATE_REF):
        if obj is not None:
            for method_name in ("activate_model", "set_active", "activate"):
                if hasattr(obj, method_name) and callable(getattr(obj, method_name)):
                    try:
                        res = getattr(obj, method_name)(clean_id)
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
@router.get("/api/models")
async def list_models():
    results = {}

    for k, meta in _MEMORY_META.items():
        results[k] = _serialize_meta(k, meta, _ACTIVE_ID)

    for source in (_REGISTRY_REF, _STATE_REF):
        if source is None:
            continue
        items_dict = {}
        if isinstance(source, dict):
            if "models" in source and isinstance(source["models"], dict):
                items_dict.update(source["models"])
            else:
                for k, v in source.items():
                    if isinstance(v, dict) and ("buses" in v or "net" in v or "name" in v):
                        items_dict[k] = v
        else:
            for attr in ("models", "registry", "cases", "_models"):
                if hasattr(source, attr):
                    val = getattr(source, attr)
                    if isinstance(val, dict):
                        items_dict.update(val)
                    elif isinstance(val, list):
                        for item in val:
                            if isinstance(item, dict) and (item.get("id") or item.get("name")):
                                items_dict[str(item.get("id") or item.get("name"))] = item

        for k, v in items_dict.items():
            s_meta = _serialize_meta(str(k), v, _ACTIVE_ID)
            if s_meta["id"] not in results:
                results[s_meta["id"]] = s_meta

    return list(results.values())


@router.delete("/{model_id}")
@router.delete("/api/models/{model_id}")
async def delete_model(model_id: str):
    _MEMORY_NETS.pop(model_id, None)
    _MEMORY_META.pop(model_id, None)
    if isinstance(_REGISTRY_REF, dict):
        _REGISTRY_REF.pop(model_id, None)
    return {"ok": True, "message": f"Deleted {model_id}"}


def get_model_router(*args, **kwargs) -> APIRouter:
    """Accepts (model_registry, state), (state,), or () from main.py."""
    global _REGISTRY_REF, _STATE_REF
    if len(args) >= 2:
        _REGISTRY_REF = args[0]
        _STATE_REF = args[1]
    elif len(args) == 1:
        _REGISTRY_REF = args[0]
        _STATE_REF = args[0]

    if "model_registry" in kwargs:
        _REGISTRY_REF = kwargs["model_registry"]
    if "state" in kwargs:
        _STATE_REF = kwargs["state"]

    return router