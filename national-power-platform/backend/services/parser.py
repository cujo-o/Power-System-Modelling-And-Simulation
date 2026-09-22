import io
import re
import math
import uuid
import tempfile
import os
import numpy as np
import pandas as pd
import pandapower as pp
from services.power_flow import solve_power_flow
from services.grid_builder import build_case330, build_nig_10_bus, parse_matpower_standalone

try:
    from pandapower.converter.pypower.from_ppc import from_ppc
except ImportError:
    from pandapower.converter.pypower import from_ppc


def parse_excel_case(raw_bytes: bytes) -> pp.pandapowerNet:
    xls = pd.ExcelFile(io.BytesIO(raw_bytes))
    net = pp.create_empty_network(f_hz=50.0, sn_mva=100.0)

    if "buses" not in xls.sheet_names:
        raise ValueError("Excel file must contain a 'buses' sheet.")

    df_bus = pd.read_excel(xls, "buses")
    bus_map = {}
    for _, row in df_bus.iterrows():
        b_id = pp.create_bus(
            net,
            vn_kv=float(row.get("vn_kv", 330.0)),
            name=str(row.get("name", f"Bus {row.get('id', '')}")),
            zone=str(row.get("zone", "Transmission")),
            geodata=(float(row.get("x", 200.0)), float(row.get("y", 200.0))),
        )
        original_id = row.get("id", b_id)
        bus_map[original_id] = b_id

    if "lines" in xls.sheet_names:
        df_lines = pd.read_excel(xls, "lines")
        for _, row in df_lines.iterrows():
            fb = bus_map.get(row["from_bus"], int(row["from_bus"]))
            tb = bus_map.get(row["to_bus"], int(row["to_bus"]))
            pp.create_line_from_parameters(
                net,
                from_bus=fb,
                to_bus=tb,
                length_km=float(row.get("length_km", 50.0)),
                r_ohm_per_km=float(row.get("r_ohm_per_km", 0.035)),
                x_ohm_per_km=float(row.get("x_ohm_per_km", 0.320)),
                c_nf_per_km=float(row.get("c_nf_per_km", 11.2)),
                max_i_ka=float(row.get("max_i_ka", 1.25)),
                name=str(row.get("name", f"Line {fb}-{tb}")),
            )

    if "generators" in xls.sheet_names:
        df_gen = pd.read_excel(xls, "generators")
        for idx, row in df_gen.iterrows():
            b_target = bus_map.get(row["bus"], int(row["bus"]))
            if idx == 0 and "slack" in str(row.get("type", "")).lower():
                pp.create_ext_grid(net, bus=b_target, vm_pu=float(row.get("vm_pu", 1.05)), name=str(row.get("name", "Slack Gen")))
            else:
                pp.create_gen(net, bus=b_target, p_mw=float(row.get("p_mw", 100.0)), vm_pu=float(row.get("vm_pu", 1.0)), name=str(row.get("name", f"Gen {idx}")))

    if "loads" in xls.sheet_names:
        df_loads = pd.read_excel(xls, "loads")
        for _, row in df_loads.iterrows():
            b_target = bus_map.get(row["bus"], int(row["bus"]))
            pp.create_load(net, bus=b_target, p_mw=float(row.get("p_mw", 50.0)), q_mvar=float(row.get("q_mvar", 15.0)), name=str(row.get("name", "Load")))

    return net


def parse_and_register_file(filename: str, raw_bytes: bytes) -> dict:
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    net = None
    platform = "MATPOWER"
    content = ""

    if ext in ["m", "raw", "json", "aux"]:
        content = raw_bytes.decode("utf-8", errors="ignore")

    if ext == "m":
        ppc_dict = parse_matpower_standalone(content)
        net = from_ppc(ppc_dict, f_hz=50.0)
        if ppc_dict.get("bus_names") and len(ppc_dict["bus_names"]) == len(net.bus):
            net.bus["name"] = ppc_dict["bus_names"]
        platform = "PSAT" if ("Bus.con" in content or "Line.con" in content) else "MATPOWER"

    elif ext == "json":
        net = pp.from_json_string(content)
        platform = "Pandapower JSON"

    elif ext in ["xlsx", "xls"]:
        net = parse_excel_case(raw_bytes)
        platform = "ETAP / Excel"

    elif ext == "raw":
        with tempfile.NamedTemporaryFile(delete=False, suffix=".raw") as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name
        try:
            net = pp.converter.from_raw(tmp_path)
            platform = "DIgSILENT / PSS/E"
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    else:
        raise ValueError(f"Unsupported format '.{ext}'. Use .m, .json, .xlsx, or .raw")

    if not hasattr(net, "bus_geodata") or net.bus_geodata is None or net.bus_geodata.empty:
        net.bus_geodata = pd.DataFrame(columns=["x", "y"], index=net.bus.index)
        n = len(net.bus)
        cols = max(4, int(math.ceil(math.sqrt(n * 1.5))))
        for i, b_idx in enumerate(net.bus.index):
            row = i // cols
            col = i % cols
            net.bus_geodata.loc[b_idx, "x"] = float(150 + col * 180 + (row % 2) * 40)
            net.bus_geodata.loc[b_idx, "y"] = float(100 + row * 140)

    voltage_level = "330kV"
    if "vn_kv" in net.bus.columns:
        mean_kv = float(net.bus["vn_kv"].mean())
        voltage_level = "132kV" if mean_kv < 220.0 else "330kV"

    sol = solve_power_flow(net, load_multiplier=1.0)
    model_id = str(uuid.uuid4())[:8]
    installed_mw = float(net.gen.p_mw.sum()) if len(net.gen) > 0 else 0.0
    if len(net.ext_grid) > 0:
        installed_mw += 1000.0
    demand_mw = float(net.load.p_mw.sum()) if len(net.load) > 0 else 0.0

    return {
        "id": model_id,
        "name": filename,
        "voltage_level": voltage_level,
        "domain": "Static & Dynamic",
        "platform": platform,
        "net": net,
        "buses": len(net.bus),
        "branches": len(net.line),
        "total_installed_mw": round(installed_mw, 1),
        "total_demand_mw": round(demand_mw, 1),
        "converged": sol["converged"],
        "is_default": False,
    }