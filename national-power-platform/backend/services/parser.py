import pandapower as pp
import uuid
from services.grid_builder import build_case330, build_nig_10_bus

def parse_and_register_file(filename: str, content: str):
    detected_platform = "MATPOWER"
    if "Bus.con" in content or "Line.con" in content:
        detected_platform = "PSAT"
    elif "DIgSILENT" in content or "PowerFactory" in content:
        detected_platform = "DIgSILENT"
    elif "PowerWorld" in content:
        detected_platform = "PowerWorld"
    elif "ETAP" in content or filename.endswith(".xlsx"):
        detected_platform = "ETAP"
        
    voltage_level = "132kV" if ("132" in filename or "305" in content) else "330kV"
    model_id = str(uuid.uuid4())[:8]
    net = build_case330() if voltage_level == "330kV" else build_nig_10_bus()
    
    installed_mw = float(net.gen.p_mw.sum() if len(net.gen) > 0 else 1000)
    demand_mw = float(net.load.p_mw.sum() if len(net.load) > 0 else 800)

    model_entry = {
        "id": model_id,
        "name": filename,
        "voltage_level": voltage_level,
        "domain": "Steady-State & Dynamic",
        "platform": detected_platform,
        "net": net,
        "buses": len(net.bus),
        "branches": len(net.line),
        "total_installed_mw": round(installed_mw, 1),
        "total_demand_mw": round(demand_mw, 1),
        "converged": True,
        "is_default": False
    }
    return model_entry