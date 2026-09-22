import os
import re
import math
import numpy as np
import pandapower as pp

try:
    from pandapower.converter.pypower.from_ppc import from_ppc
except ImportError:
    from pandapower.converter.pypower import from_ppc


def build_nig_10_bus() -> pp.pandapowerNet:
    net = pp.create_empty_network(name="Nig 10-Bus Benchmark Grid", f_hz=50.0, sn_mva=100.0)

    stations = [
        ("Kainji GS (Hydro)", 330, "North-Central", 140.0, 120.0),
        ("Jebba TS/GS", 330, "North-Central", 320.0, 120.0),
        ("Shiroro GS (Hydro)", 330, "North-Central", 540.0, 120.0),
        ("Katampe (Abuja) TS", 330, "North-Central", 740.0, 120.0),
        ("Osogbo NCC Hub", 330, "South-West", 320.0, 280.0),
        ("Ikeja West TS", 330, "South-West", 140.0, 440.0),
        ("Egbin PS (Slack)", 330, "South-West", 320.0, 440.0),
        ("Benin TS", 330, "Mid-West", 580.0, 280.0),
        ("Afam VI GS", 330, "South-South", 580.0, 440.0),
        ("Delta IV GS", 330, "South-South", 740.0, 440.0),
    ]
    for i, (name, vn, zone, x, y) in enumerate(stations):
        pp.create_bus(net, vn_kv=vn, name=name, zone=zone, index=i, geodata=(x, y))

    pp.create_ext_grid(net, bus=6, vm_pu=1.03, name="Egbin PS (Slack)")
    pp.create_gen(net, bus=0, p_mw=450.0, vm_pu=1.02, name="Kainji Hydro", min_p_mw=100, max_p_mw=760)
    pp.create_gen(net, bus=1, p_mw=420.0, vm_pu=1.02, name="Jebba Hydro", min_p_mw=100, max_p_mw=621)
    pp.create_gen(net, bus=2, p_mw=380.0, vm_pu=1.02, name="Shiroro Hydro", min_p_mw=100, max_p_mw=600)
    pp.create_gen(net, bus=8, p_mw=450.0, vm_pu=1.02, name="Afam VI Gas", min_p_mw=80, max_p_mw=650)
    pp.create_gen(net, bus=9, p_mw=390.0, vm_pu=1.02, name="Delta IV Gas", min_p_mw=50, max_p_mw=890)

    pp.create_load(net, bus=3, p_mw=468.5, q_mvar=117.2, name="Abuja Load")
    pp.create_load(net, bus=5, p_mw=587.2, q_mvar=152.1, name="Lagos Load")
    pp.create_load(net, bus=4, p_mw=159.6, q_mvar=42.2, name="Osogbo Load")
    pp.create_load(net, bus=7, p_mw=171.6, q_mvar=37.7, name="Benin Load")

    corridors = [
        (0, 1, 81.0, "Kainji - Jebba 330kV"),
        (1, 2, 244.0, "Jebba - Shiroro 330kV"),
        (2, 3, 144.0, "Shiroro - Katampe 330kV"),
        (1, 4, 157.0, "Jebba - Osogbo 330kV"),
        (4, 5, 248.0, "Osogbo - Ikeja West 330kV"),
        (5, 6, 62.0, "Ikeja West - Egbin 330kV"),
        (4, 7, 251.0, "Osogbo - Benin 330kV"),
        (7, 6, 280.0, "Benin - Egbin 330kV"),
        (7, 8, 130.0, "Benin - Afam 330kV"),
        (8, 9, 85.0, "Afam - Delta 330kV"),
    ]
    for fb, tb, length, name in corridors:
        pp.create_line_from_parameters(
            net, from_bus=fb, to_bus=tb, length_km=length,
            r_ohm_per_km=0.035, x_ohm_per_km=0.320, c_nf_per_km=11.2, max_i_ka=1.25, name=name
        )
    return net


def build_case330() -> pp.pandapowerNet:
    net = pp.create_empty_network(name="Nigeria 330kV Grid (63-Bus NISO Equivalent)", f_hz=50.0, sn_mva=100.0)

    buses_meta = [
        (1, 'AJA 3', 'South-West', 260, 680),
        (2, 'AKANGBA 3', 'South-West', 180, 670),
        (3, 'EGBIN 3', 'South-West', 230, 640),
        (4, 'IKEJA W 3', 'South-West', 150, 630),
        (5, 'SAKETE 3', 'South-West', 60, 630),
        (6, 'OLORUNSOGO3', 'South-West', 140, 560),
        (7, 'OKE_ARO_3', 'South-West', 180, 610),
        (8, 'ALAGBON_3', 'South-West', 210, 680),
        (9, 'LEKKI 330', 'South-West', 280, 710),
        (10, 'IKEJA W 3B', 'South-West', 160, 645),
        (11, 'AYEDE 3', 'South-West', 190, 530),
        (12, 'OSOGBO 3', 'South-West', 260, 480),
        (13, 'GANMO 3', 'South-West', 260, 410),
        (14, 'BKEBBI 3', 'North-West', 140, 140),
        (15, 'JEBBA T.S.3', 'North-Central', 280, 330),
        (16, 'JEBBA G.S.3', 'North-Central', 250, 310),
        (17, 'KAINJI G.S.3', 'North-Central', 210, 240),
        (18, 'TRIPLE POINT', 'North-Central', 350, 290),
        (19, 'ZUNGERU 3', 'North-Central', 380, 260),
        (20, 'ZUNGERU GS3', 'North-Central', 360, 230),
        (21, 'SHIRORO 3', 'North-Central', 450, 270),
        (22, 'NBUSA FAKUN', 'North-Central', 170, 220),
        (23, 'BENIN 3', 'Mid-West', 390, 540),
        (24, 'DELTA IV 3', 'Mid-West', 410, 680),
        (25, 'SAPELE 3', 'Mid-West', 370, 620),
        (26, 'OMOTOSHO3', 'South-West', 290, 560),
        (27, 'AZURA', 'Mid-West', 420, 520),
        (28, 'ALADJA_3', 'Mid-West', 370, 670),
        (29, 'SAPELE 3B', 'Mid-West', 380, 605),
        (30, 'IHOVBOR_3', 'Mid-West', 420, 550),
        (31, 'KADUNA 3', 'North-West', 510, 220),
        (32, 'M CITY_330', 'North-West', 560, 210),
        (33, 'GOMBE 3', 'North-East', 900, 230),
        (34, 'JOS 3', 'North-East', 680, 270),
        (35, 'YOLA 3', 'North-East', 1060, 340),
        (36, 'JOS 1B', 'North-East', 690, 250),
        (37, 'BAUCHI 3', 'North-East', 790, 210),
        (38, 'MAIDUGURI 3', 'North-East', 1080, 120),
        (39, 'DAMATURU 3', 'North-East', 980, 140),
        (40, 'MAYO BELW 3', 'North-East', 1020, 370),
        (41, 'JALINGO 3', 'North-East', 940, 390),
        (42, 'NHAVEN 3', 'South-East', 580, 520),
        (43, 'ONITSHA 3', 'South-East', 500, 540),
        (44, 'OKPAI 3', 'Mid-West', 480, 600),
        (45, 'MAKURDI_3', 'North-Central', 690, 420),
        (46, 'ASABA 3', 'Mid-West', 470, 530),
        (47, 'UGWUAJI_3', 'South-East', 600, 540),
        (48, 'AFAM IV 3', 'South-South', 550, 710),
        (49, 'ALAOJI 3', 'South-East', 560, 640),
        (50, 'ADIAGBO_3', 'South-South', 680, 650),
        (51, 'IKOT-EKPENE_', 'South-South', 630, 640),
        (52, 'CALABAR_PS_3', 'South-South', 710, 670),
        (53, 'AJAOKUTA 3', 'North-Central', 450, 430),
        (54, 'KATAMPE 3', 'North-Central', 510, 330),
        (55, 'GEREGU', 'North-Central', 470, 440),
        (56, 'GWAGW BB1', 'North-Central', 480, 360),
        (57, 'LOKOJA _3', 'North-Central', 430, 390),
        (58, 'LAFIA 3', 'North-Central', 650, 350),
        (59, 'KANO 3', 'North-West', 600, 90),
        (60, 'RIM_ZAKARA 3', 'North-West', 640, 70),
        (61, 'OWERRI_3', 'South-East', 520, 610),
        (62, 'EGBEMA_3', 'South-East', 500, 640),
        (63, 'OMOKU_3', 'South-South', 470, 670)
    ]

    for b_id, name, zone, x, y in buses_meta:
        pp.create_bus(net, vn_kv=330, name=name, zone=zone, index=b_id, geodata=(x, y))

    pp.create_ext_grid(net, bus=3, vm_pu=1.05, name="EGBIN 3 (Slack)")

    gen_data = [
        (4, 47.4, 1.05, "PARAS Gas", 105.8),
        (6, 150.8, 1.05, "OLORUNSOGO Gas", 336.8),
        (16, 278.1, 1.05, "JEBBA Hydro", 621.0),
        (17, 340.4, 1.05, "KAINJI Hydro", 760.0),
        (20, 313.5, 1.05, "ZUNGERU Hydro", 700.0),
        (21, 268.7, 1.05, "SHIRORO Hydro", 600.0),
        (24, 398.7, 1.05, "DELTA IV Gas", 890.2),
        (25, 268.7, 1.05, "SAPELE Steam", 600.0),
        (26, 136.2, 1.05, "OMOTOSHO Gas", 304.0),
        (27, 203.5, 1.05, "AZURA Gas", 454.4),
        (29, 107.5, 1.05, "SAPELE NIPP", 240.0),
        (30, 223.9, 1.05, "IHOVBOR Gas", 500.0),
        (33, 17.9, 1.05, "DADINKOWA Hydro", 40.0),
        (44, 209.6, 1.05, "OKPAI Combined", 468.0),
        (45, 17.9, 1.05, "KASHIMBILLA Hydro", 40.0),
        (48, 291.1, 1.05, "AFAM VI Shell", 650.0),
        (49, 201.5, 1.05, "ALAOJI NIPP", 450.0),
        (51, 85.5, 1.05, "IBOM Power", 191.0),
        (52, 251.9, 1.05, "ODUKPANI NIPP", 562.5),
        (53, 15.3, 1.05, "GEOMETRIC Power", 34.2),
        (55, 194.8, 1.05, "GEREGU Gas", 435.0),
        (63, 61.8, 1.05, "OMOKU Gas", 138.0),
    ]
    for b_id, p, vm, name, pmax in gen_data:
        pp.create_gen(net, bus=b_id, p_mw=p, vm_pu=vm, name=name, min_p_mw=10.0, max_p_mw=pmax)

    load_data = [
        (1, 96.2, 20.5), (2, 378.8, 92.5), (3, 170.5, 46.8), (4, 587.2, 152.1),
        (5, 322.8, 42.6), (7, 71.3, 18.5), (8, 143.8, 41.1), (9, 123.3, 38.1),
        (10, 77.7, 17.6), (11, 211.1, 48.0), (12, 159.6, 42.2), (13, 124.1, 31.4),
        (14, 111.1, 14.2), (15, 12.0, 3.0), (19, 6.0, 4.9), (21, 81.9, 17.0),
        (22, 6.0, 0.9), (23, 171.6, 37.8), (24, 86.9, 21.7), (26, 8.4, 3.4),
        (28, 29.7, 12.5), (30, 54.7, 9.9), (31, 159.2, 32.4), (33, 89.1, 21.6),
        (35, 22.7, 5.9), (36, 105.5, 19.9), (37, 35.4, 7.1), (38, 65.4, 11.8),
        (39, 21.2, 2.4), (40, 6.9, 1.0), (41, 19.0, 3.1), (42, 184.4, 37.3),
        (43, 147.8, 32.8), (45, 85.3, 14.0), (46, 65.9, 13.9), (47, 21.5, 4.7),
        (48, 332.5, 69.6), (49, 247.0, 55.7), (50, 111.8, 26.4), (52, 0.1, 0.05),
        (53, 67.6, 16.3), (54, 468.5, 117.3), (57, 25.0, 6.3), (58, 10.4, 3.0),
        (59, 462.9, 84.0), (61, 9.5, 1.9)
    ]
    for b_id, p, q in load_data:
        pp.create_load(net, bus=b_id, p_mw=p, q_mvar=q, name=f"Load Bus {b_id}")

    branches = [
        (1, 3, 20.0, "AJA - EGBIN 1"), (1, 3, 20.0, "AJA - EGBIN 2"),
        (1, 8, 30.0, "AJA - ALAGBON"), (1, 9, 10.0, "AJA - LEKKI"),
        (2, 4, 25.0, "AKANGBA - IKEJA W 1"), (2, 10, 25.0, "AKANGBA - IKEJA W 2"),
        (3, 4, 35.0, "EGBIN - IKEJA W"), (3, 7, 32.0, "EGBIN - OKE ARO 1"),
        (3, 7, 32.0, "EGBIN - OKE ARO 2"), (3, 23, 280.0, "EGBIN - BENIN"),
        (4, 5, 70.0, "IKEJA W - SAKETE"), (4, 6, 80.0, "IKEJA W - OLORUNSOGO"),
        (4, 7, 25.0, "IKEJA W - OKE ARO"), (6, 11, 100.0, "OLORUNSOGO - AYEDE"),
        (7, 10, 25.0, "OKE ARO - IKEJA W 3B"), (8, 9, 18.0, "ALAGBON - LEKKI"),
        (10, 12, 240.0, "IKEJA W - OSOGBO"), (10, 26, 160.0, "IKEJA W - OMOTOSHO"),
        (11, 12, 115.0, "AYEDE - OSOGBO"), (12, 13, 85.0, "OSOGBO - GANMO"),
        (12, 15, 157.0, "OSOGBO - JEBBA 1"), (12, 15, 157.0, "OSOGBO - JEBBA 2"),
        (12, 30, 240.0, "OSOGBO - IHOVBOR"), (13, 15, 110.0, "GANMO - JEBBA"),
        (14, 17, 310.0, "B/KEBBI - KAINJI"), (15, 16, 8.0, "JEBBA TS - JEBBA GS 1"),
        (15, 16, 8.0, "JEBBA TS - JEBBA GS 2"), (15, 17, 81.0, "JEBBA - KAINJI 1"),
        (15, 17, 81.0, "JEBBA - KAINJI 2"), (15, 18, 195.0, "JEBBA - TRIPLE POINT 1"),
        (15, 18, 195.0, "JEBBA - TRIPLE POINT 2"), (17, 22, 5.0, "KAINJI - NBUSA FAKUN 1"),
        (17, 22, 5.0, "KAINJI - NBUSA FAKUN 2"), (18, 19, 65.0, "TRIPLE POINT - ZUNGERU 1"),
        (18, 19, 65.0, "TRIPLE POINT - ZUNGERU 2"), (18, 21, 50.0, "TRIPLE POINT - SHIRORO 1"),
        (18, 21, 50.0, "TRIPLE POINT - SHIRORO 2"), (19, 20, 5.0, "ZUNGERU TS - ZUNGERU GS 1"),
        (19, 20, 5.0, "ZUNGERU TS - ZUNGERU GS 2"), (21, 31, 96.0, "SHIRORO - KADUNA 1"),
        (21, 31, 96.0, "SHIRORO - KADUNA 2"), (21, 54, 144.0, "SHIRORO - KATAMPE"),
        (21, 56, 120.0, "SHIRORO - GWAGWALADA"), (28, 24, 25.0, "ALADJA - DELTA IV"),
        (28, 25, 45.0, "ALADJA - SAPELE"), (23, 24, 107.0, "BENIN - DELTA IV"),
        (23, 25, 50.0, "BENIN - SAPELE 1"), (23, 25, 50.0, "BENIN - SAPELE 2"),
        (23, 25, 50.0, "BENIN - SAPELE 3"), (23, 26, 115.0, "BENIN - OMOTOSHO"),
        (23, 30, 20.0, "BENIN - IHOVBOR"), (23, 43, 137.0, "BENIN - ONITSHA 1"),
        (23, 43, 137.0, "BENIN - ONITSHA 2"), (23, 46, 100.0, "BENIN - ASABA"),
        (23, 53, 195.0, "BENIN - AJAOKUTA 1"), (23, 53, 195.0, "BENIN - AJAOKUTA 2"),
        (27, 30, 15.0, "AZURA - IHOVBOR"), (31, 32, 12.0, "KADUNA - M CITY"),
        (31, 34, 197.0, "KADUNA - JOS 1"), (31, 34, 197.0, "KADUNA - JOS 2"),
        (31, 59, 230.0, "KADUNA - KANO"), (32, 34, 190.0, "M CITY - JOS"),
        (33, 34, 265.0, "GOMBE - JOS"), (33, 35, 240.0, "GOMBE - YOLA"),
        (33, 39, 180.0, "GOMBE - DAMATURU"), (34, 58, 170.0, "JOS - LAFIA 1"),
        (34, 58, 170.0, "JOS - LAFIA 2"), (38, 39, 130.0, "MAIDUGURI - DAMATURU"),
        (42, 43, 95.0, "NEW HAVEN - ONITSHA"), (42, 47, 8.0, "NEW HAVEN - UGWUAJI 1"),
        (42, 47, 8.0, "NEW HAVEN - UGWUAJI 2"), (43, 44, 55.0, "ONITSHA - OKPAI 1"),
        (43, 44, 55.0, "ONITSHA - OKPAI 2"), (43, 46, 20.0, "ONITSHA - ASABA"),
        (43, 49, 138.0, "ONITSHA - ALAOJI"), (45, 47, 160.0, "MAKURDI - UGWUAJI 1"),
        (45, 47, 160.0, "MAKURDI - UGWUAJI 2"), (45, 58, 110.0, "MAKURDI - LAFIA 1"),
        (45, 58, 110.0, "MAKURDI - LAFIA 2"), (47, 51, 140.0, "UGWUAJI - IKOT EKPENE 1"),
        (47, 51, 140.0, "UGWUAJI - IKOT EKPENE 2"), (47, 51, 140.0, "UGWUAJI - IKOT EKPENE 3"),
        (47, 51, 140.0, "UGWUAJI - IKOT EKPENE 4"), (48, 49, 25.0, "AFAM - ALAOJI 1"),
        (48, 49, 25.0, "AFAM - ALAOJI 2"), (49, 51, 55.0, "ALAOJI - IKOT EKPENE 1"),
        (49, 51, 55.0, "ALAOJI - IKOT EKPENE 2"), (49, 61, 60.0, "ALAOJI - OWERRI 1"),
        (49, 61, 60.0, "ALAOJI - OWERRI 2"), (50, 52, 18.0, "ADIAGBO - CALABAR 1"),
        (50, 52, 18.0, "ADIAGBO - CALABAR 2"), (51, 52, 60.0, "IKOT EKPENE - CALABAR 1"),
        (51, 52, 60.0, "IKOT EKPENE - CALABAR 2"), (61, 62, 50.0, "OWERRI - EGBEMA 1"),
        (61, 62, 50.0, "OWERRI - EGBEMA 2"), (62, 63, 40.0, "EGBEMA - OMOKU 1"),
        (62, 63, 40.0, "EGBEMA - OMOKU 2"), (53, 55, 3.0, "AJAOKUTA - GEREGU 1"),
        (53, 55, 3.0, "AJAOKUTA - GEREGU 2"), (53, 57, 45.0, "AJAOKUTA - LOKOJA 1"),
        (53, 57, 45.0, "AJAOKUTA - LOKOJA 2"), (54, 56, 42.0, "KATAMPE - GWAGWALADA"),
        (56, 57, 140.0, "GWAGWALADA - LOKOJA 1"), (56, 57, 140.0, "GWAGWALADA - LOKOJA 2"),
        (59, 60, 15.0, "KANO - RIMIN ZAKARA"), (29, 25, 2.0, "SAPELE 3B - SAPELE 3"),
        (36, 34, 2.0, "JOS 1B - JOS 3"), (37, 34, 115.0, "BAUCHI - JOS"),
        (41, 35, 140.0, "JALINGO - YOLA"), (40, 35, 50.0, "MAYO BELWA - YOLA")
    ]

    for fb, tb, length, name in branches:
        pp.create_line_from_parameters(
            net, from_bus=fb, to_bus=tb, length_km=length,
            r_ohm_per_km=0.035, x_ohm_per_km=0.320, c_nf_per_km=11.2, max_i_ka=1.25, name=name
        )

    return net


def parse_matpower_standalone(content: str) -> dict:
    clean_lines = [line.split('%')[0].strip() for line in content.splitlines() if line.split('%')[0].strip()]
    text = "\n".join(clean_lines)

    base_mva_match = re.search(r'(?:mpc\.)?baseMVA\s*=\s*([0-9.]+)', text, re.IGNORECASE)
    base_mva = float(base_mva_match.group(1)) if base_mva_match else 100.0

    def extract_matrix(name: str) -> np.ndarray:
        pattern = rf'(?:mpc\.)?{name}\s*=\s*\[(.*?)\]\s*;'
        match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        if not match:
            return np.empty((0, 0))
        raw_block = match.group(1).strip()
        rows = []
        for row_str in raw_block.replace(';', '\n').split('\n'):
            row_str = row_str.strip()
            if not row_str:
                continue
            vals = [float(x) for x in re.split(r'[\s,]+', row_str) if x]
            if vals:
                rows.append(vals)
        return np.array(rows, dtype=float)

    bus = extract_matrix('bus')
    gen = extract_matrix('gen')
    branch = extract_matrix('branch')

    scale_match = re.search(r'LOAD_SCALE\s*=\s*([0-9.]+)', content, re.IGNORECASE)
    if scale_match:
        scale = float(scale_match.group(1))
        if bus.shape[1] >= 4:
            bus[:, 2:4] *= scale
        if gen.shape[1] >= 2:
            gen[:, 1] *= scale

    bus_names = []
    name_match = re.search(r'(?:mpc\.)?bus_name\s*=\s*\{(.*?)\}\s*;', content, re.DOTALL | re.IGNORECASE)
    if name_match:
        for item in name_match.group(1).split(';'):
            cleaned = item.replace("'", "").replace('"', '').strip()
            if cleaned:
                bus_names.append(cleaned)

    return {
        'version': '2',
        'baseMVA': base_mva,
        'bus': bus,
        'gen': gen if len(gen) > 0 else np.empty((0, 10)),
        'branch': branch if len(branch) > 0 else np.empty((0, 11)),
        'bus_names': bus_names,
    }


def build_case132() -> pp.pandapowerNet:
    candidates = [
        "caseNigeria132new_2026.m",
        "backend/caseNigeria132new_2026.m",
        "../caseNigeria132new_2026.m"
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                ppc = parse_matpower_standalone(content)
                net = from_ppc(ppc, f_hz=50.0)
                if ppc.get("bus_names") and len(ppc["bus_names"]) == len(net.bus):
                    net.bus["name"] = ppc["bus_names"]
                net.name = "NISO 132/330 kV Integrated Grid (369 Buses)"
                return net
            except Exception:
                pass

    net = build_case330()
    net.name = "NISO 132/330 kV Integrated Grid"
    return net