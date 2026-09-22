import os
import pandapower as pp
from services.parser import parse_matpower_text

try:
    from pandapower.converter.pypower.from_ppc import from_ppc
except ImportError:
    from pandapower.converter.pypower import from_ppc

# Keep build_nig_10_bus() and build_case330() as previously updated...
# (Paste build_nig_10_bus and build_case330 from the previous code)

def build_case132() -> pp.pandapowerNet:
    """
    Builds the 369-bus NISO 132/330 kV integrated grid model.
    Loads caseNigeria132new_2026.m if present, or builds the sub-transmission network.
    """
    candidates = [
        "caseNigeria132new_2026.m",
        "backend/caseNigeria132new_2026.m",
        "../caseNigeria132new_2026.m",
        "services/caseNigeria132new_2026.m"
    ]
    for path in candidates:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            ppc = parse_matpower_text(content)
            net = from_ppc(ppc, f_hz=50.0)
            if ppc.get("bus_names") and len(ppc["bus_names"]) == len(net.bus):
                net.bus["name"] = ppc["bus_names"]
            net.name = "NISO 132/330 kV Integrated Grid (369 Buses)"
            return net

    # Programmatic fallback: 63-bus 330kV backbone with 132kV regional load centers
    net = build_case330()
    net.name = "NISO 132/330 kV Integrated Grid (Synthetic Fallback)"

    # Add 132kV regional buses
    b_osogbo_132 = pp.create_bus(net, vn_kv=132, name="OSOGBO 132", zone="South-West", geodata=(260, 480))
    b_kano_132 = pp.create_bus(net, vn_kv=132, name="KANO 132", zone="North-West", geodata=(600, 110))
    b_kaduna_132 = pp.create_bus(net, vn_kv=132, name="KADUNA 132", zone="North-West", geodata=(510, 240))
    b_benin_132 = pp.create_bus(net, vn_kv=132, name="BENIN 132", zone="Mid-West", geodata=(390, 560))

    # Add 330/132 kV Inter-bus Transformers
    pp.create_transformer_from_parameters(net, hv_bus=12, lv_bus=b_osogbo_132, sn_mva=150, vn_hv_kv=330, vn_lv_kv=132, vkr_percent=0.5, vk_percent=12.0, pfe_kw=50, i0_percent=0.1, name="OSOGBO 330/132 Trafo")
    pp.create_transformer_from_parameters(net, hv_bus=59, lv_bus=b_kano_132, sn_mva=150, vn_hv_kv=330, vn_lv_kv=132, vkr_percent=0.5, vk_percent=12.0, pfe_kw=50, i0_percent=0.1, name="KANO 330/132 Trafo")
    pp.create_transformer_from_parameters(net, hv_bus=31, lv_bus=b_kaduna_132, sn_mva=150, vn_hv_kv=330, vn_lv_kv=132, vkr_percent=0.5, vk_percent=12.0, pfe_kw=50, i0_percent=0.1, name="KADUNA 330/132 Trafo")
    pp.create_transformer_from_parameters(net, hv_bus=23, lv_bus=b_benin_132, sn_mva=150, vn_hv_kv=330, vn_lv_kv=132, vkr_percent=0.5, vk_percent=12.0, pfe_kw=50, i0_percent=0.1, name="BENIN 330/132 Trafo")

    return net