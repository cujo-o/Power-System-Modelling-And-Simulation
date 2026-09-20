import pandapower as pp
import pandas as pd
import numpy as np

def build_nig_10_bus():
    """
    Standard Nig 10-Bus Equivalent Teaching & Benchmark Grid.
    Represents the bulk Nigerian generation-load loop (Kainji, Jebba, Shiroro, 
    Katampe, Osogbo, Ikeja West, Egbin, Benin, Delta, Afam).
    """
    net = pp.create_empty_network(name="Nig 10 Bus Equivalent Backbone", f_hz=50.0, sn_mva=100.0)

    # 10 Key Stations
    stations = [
        ("Kainji GS", 330, "North-Central", 140, 90),
        ("Jebba TS/GS", 330, "North-Central", 260, 90),
        ("Shiroro GS", 330, "North-Central", 450, 90),
        ("Katampe (Abuja) TS", 330, "North-Central", 630, 90),
        ("Osogbo Switching TS", 330, "South-West", 260, 240),
        ("Ikeja West TS", 330, "South-West", 100, 390),
        ("Egbin PS (Peaker/Peaking)", 330, "South-West", 260, 390),
        ("Benin TS", 330, "Mid-West", 450, 240),
        ("Delta IV GS", 330, "South-South", 630, 240),
        ("Afam IV-VI GS", 330, "South-South", 500, 390)
    ]
    buses = {}
    for i, (name, vn, zone, x, y) in enumerate(stations):
        buses[i] = pp.create_bus(net, vn_kv=vn, name=name, zone=zone, geodata=(x, y))

    # Generators
    pp.create_ext_grid(net, bus=buses[6], vm_pu=1.03, name="Egbin PS (Slack)")
    pp.create_gen(net, bus=buses[0], p_mw=450.0, vm_pu=1.02, name="Kainji Hydro", min_p_mw=100, max_p_mw=760)
    pp.create_gen(net, bus=buses[1], p_mw=420.0, vm_pu=1.02, name="Jebba Hydro", min_p_mw=100, max_p_mw=621)
    pp.create_gen(net, bus=buses[2], p_mw=380.0, vm_pu=1.02, name="Shiroro Hydro", min_p_mw=100, max_p_mw=600)
    pp.create_gen(net, bus=buses[8], p_mw=390.0, vm_pu=1.02, name="Delta IV Gas", min_p_mw=50, max_p_mw=890)
    pp.create_gen(net, bus=buses[9], p_mw=450.0, vm_pu=1.02, name="Afam VI Gas", min_p_mw=80, max_p_mw=650)

    # Loads
    pp.create_load(net, bus=buses[3], p_mw=468.5, q_mvar=117.2, name="Abuja/Katampe Load")
    pp.create_load(net, bus=buses[5], p_mw=587.2, q_mvar=152.1, name="Lagos/Ikeja West Load")
    pp.create_load(net, bus=buses[4], p_mw=159.6, q_mvar=42.2, name="Osogbo Region Load")
    pp.create_load(net, bus=buses[7], p_mw=171.6, q_mvar=37.7, name="Benin Hub Load")

    # 330kV Transmission Lines
    corridors = [
        (0, 1, 81.0, "Kainji - Jebba 330kV"),
        (1, 2, 244.0, "Jebba - Shiroro 330kV"),
        (2, 3, 144.0, "Shiroro - Katampe 330kV"),
        (1, 4, 157.0, "Jebba - Osogbo 330kV"),
        (4, 5, 248.0, "Osogbo - Ikeja West 330kV"),
        (5, 6, 62.0, "Ikeja West - Egbin 330kV"),
        (4, 7, 251.0, "Osogbo - Benin 330kV"),
        (7, 6, 280.0, "Benin - Egbin 330kV"),
        (7, 8, 107.0, "Benin - Delta 330kV"),
        (8, 9, 130.0, "Delta - Afam 330kV"),
    ]
    for fb, tb, length, name in corridors:
        pp.create_line_from_parameters(
            net, from_bus=buses[fb], to_bus=buses[tb], length_km=length,
            r_ohm_per_km=0.035, x_ohm_per_km=0.320, c_nf_per_km=11.2, max_i_ka=1.25, name=name
        )
    return net

def build_case330():
    """
    Builds the official 63-bus NISO 330kV equivalent (FUT Minna / NISO).
    """
    net = pp.create_empty_network(name="Nigeria 330kV (63-Bus NISO Equivalent)", f_hz=50.0, sn_mva=100.0)
    
    # Regional coordinates mapping for the 63 buses
    regional_coords = {
        1: (200, 390), 2: (170, 380), 3: (220, 400), 4: (150, 360), 5: (100, 360),
        6: (170, 330), 7: (190, 360), 8: (190, 395), 9: (230, 410), 10: (160, 370),
        11: (210, 310), 12: (250, 270), 13: (240, 230), 14: (100, 110), 15: (220, 170),
        16: (210, 160), 17: (180, 130), 18: (270, 160), 19: (290, 150), 20: (300, 140),
        21: (360, 150), 22: (160, 120), 23: (330, 330), 24: (340, 390), 25: (320, 370),
        26: (270, 340), 27: (340, 340), 28: (330, 410), 29: (315, 380), 30: (335, 335),
        31: (380, 180), 32: (410, 180), 33: (580, 170), 34: (470, 200), 35: (640, 220),
        36: (480, 210), 37: (520, 170), 38: (650, 110), 39: (600, 130), 40: (620, 250),
        41: (580, 270), 42: (430, 340), 43: (390, 350), 44: (390, 380), 45: (450, 280),
        46: (370, 360), 47: (440, 350), 48: (420, 420), 49: (420, 390), 50: (490, 430),
        51: (460, 410), 52: (490, 410), 53: (350, 270), 54: (370, 210), 55: (360, 280),
        56: (360, 230), 57: (330, 260), 58: (420, 250), 59: (420, 90), 60: (430, 80),
        61: (410, 380), 62: (390, 400), 63: (380, 420)
    }

    bus_names = [
        'AJA 3', 'AKANGBA 3', 'EGBIN 3', 'IKEJA W 3', 'SAKETE 3', 'OLORUNSOGO3', 'OKE_ARO_3', 'ALAGBON_3',
        'LEKKI 330', 'IKEJA W 3B', 'AYEDE 3', 'OSOGBO 3', 'GANMO 3', 'BKEBBI 3', 'JEBBA T.S.3', 'JEBBA G.S.3',
        'KAINJI G.S.3', 'TRIPLE POINT', 'ZUNGERU 3', 'ZUNGERU GS3', 'SHIRORO 3', 'NBUSA FAKUN', 'BENIN 3',
        'DELTA IV 3', 'SAPELE 3', 'OMOTOSHO3', 'AZURA', 'ALADJA_3', 'SAPELE 3B', 'IHOVBOR_3', 'KADUNA 3',
        'M CITY_330', 'GOMBE 3', 'JOS 3', 'YOLA 3', 'JOS 1B', 'BAUCHI 3', 'MAIDUGURI 3', 'DAMATURU 3',
        'MAYO BELW 3', 'JALINGO 3', 'NHAVEN 3', 'ONITSHA 3', 'OKPAI 3', 'MAKURDI_3', 'ASABA 3', 'UGWUAJI_3',
        'AFAM IV 3', 'ALAOJI 3', 'ADIAGBO_3', 'IKOT-EKPENE_', 'CALABAR_PS_3', 'AJAOKUTA 3', 'KATAMPE 3',
        'GEREGU', 'GWAGW BB1', 'LOKOJA _3', 'LAFIA 3', 'KANO 3', 'RIM_ZAKARA 3', 'OWERRI_3', 'EGBEMA_3', 'OMOKU_3'
    ]

    buses = {}
    for idx, name in enumerate(bus_names, start=1):
        x, y = regional_coords.get(idx, (250, 250))
        zone = "South-West" if idx <= 13 or idx in [26, 27, 29, 30] else \
               "North-Central" if idx in [14, 15, 16, 17, 18, 19, 20, 21, 22, 53, 54, 55, 56, 57, 58] else \
               "North-West" if idx in [31, 32, 59, 60] else \
               "North-East" if idx in range(33, 42) else \
               "Mid-West" if idx in [23, 24, 25, 28, 46] else "South-South"
        buses[idx] = pp.create_bus(net, vn_kv=330, name=name, zone=zone, geodata=(x, y))

    # Reference / Slack Generator at Egbin
    pp.create_ext_grid(net, bus=buses[3], vm_pu=1.05, name="EGBIN 3 (Slack)")

    # Key Synchronous Generations
    generators_data = [
        (6, 150.8, "OLORUNSOGO Gas", 336.8), (16, 278.1, "JEBBA Hydro", 621.0),
        (17, 340.4, "KAINJI Hydro", 760.0), (20, 313.5, "ZUNGERU Hydro", 700.0),
        (21, 268.7, "SHIRORO Hydro", 600.0), (24, 398.7, "DELTA IV Gas", 890.2),
        (25, 268.7, "SAPELE Steam", 600.0), (26, 136.2, "OMOTOSHO Gas", 304.0),
        (27, 203.5, "AZURA Gas", 454.4), (30, 223.9, "IHOVBOR Gas", 500.0),
        (33, 17.9, "DADINKOWA Hydro", 40.0), (44, 209.6, "OKPAI Combined", 468.0),
        (45, 17.9, "KASHIMBILLA Hydro", 40.0), (48, 291.1, "AFAM VI Shell", 650.0),
        (49, 201.5, "ALAOJI NIPP", 450.0), (52, 251.9, "ODUKPANI NIPP", 562.5),
        (55, 194.8, "GEREGU Gas", 435.0), (63, 61.8, "OMOKU Gas", 138.0)
    ]
    for b_id, p, name, pmax in generators_data:
        pp.create_gen(net, bus=buses[b_id], p_mw=p, vm_pu=1.05, name=name, min_p_mw=10.0, max_p_mw=pmax)

    # Core 330kV Trunk Lines (subset of key corridors)
    branches = [
        (1, 3, 20.0, "AJA - EGBIN"), (2, 4, 30.0, "AKANGBA - IKEJA W"),
        (3, 4, 35.0, "EGBIN - IKEJA W"), (3, 23, 280.0, "EGBIN - BENIN"),
        (4, 6, 80.0, "IKEJA W - OLORUNSOGO"), (6, 11, 100.0, "OLORUNSOGO - AYEDE"),
        (11, 12, 115.0, "AYEDE - OSOGBO"), (12, 13, 85.0, "OSOGBO - GANMO"),
        (12, 15, 157.0, "OSOGBO - JEBBA"), (15, 17, 81.0, "JEBBA - KAINJI"),
        (15, 21, 244.0, "JEBBA - SHIRORO"), (21, 54, 144.0, "SHIRORO - KATAMPE"),
        (21, 31, 96.0, "SHIRORO - KADUNA"), (31, 59, 230.0, "KADUNA - KANO"),
        (31, 34, 197.0, "KADUNA - JOS"), (34, 33, 265.0, "JOS - GOMBE"),
        (33, 35, 240.0, "GOMBE - YOLA"), (33, 38, 305.0, "GOMBE - MAIDUGURI"),
        (23, 43, 137.0, "BENIN - ONITSHA"), (43, 47, 95.0, "ONITSHA - UGWUAJI"),
        (47, 45, 160.0, "UGWUAJI - MAKURDI"), (47, 51, 140.0, "UGWUAJI - IKOT EKPENE"),
        (51, 52, 60.0, "IKOT EKPENE - CALABAR"), (43, 49, 138.0, "ONITSHA - ALAOJI"),
        (48, 49, 25.0, "AFAM - ALAOJI"), (23, 53, 195.0, "BENIN - AJAOKUTA"),
        (53, 57, 45.0, "AJAOKUTA - LOKOJA"), (57, 56, 140.0, "LOKOJA - GWAGWALADA"),
        (56, 54, 42.0, "GWAGWALADA - KATAMPE")
    ]
    for fb, tb, length, name in branches:
        pp.create_line_from_parameters(
            net, from_bus=buses[fb], to_bus=buses[tb], length_km=length,
            r_ohm_per_km=0.035, x_ohm_per_km=0.320, c_nf_per_km=11.2, max_i_ka=1.25, name=name
        )

    # Add Lumped Loads
    load_specs = [
        (1, 96.2, 20.5), (2, 378.8, 92.5), (4, 587.2, 152.1), (5, 322.8, 42.6),
        (11, 211.1, 48.0), (12, 159.6, 42.2), (13, 124.1, 31.4), (14, 111.1, 14.2),
        (23, 171.6, 37.8), (31, 159.2, 32.4), (34, 105.5, 19.9), (42, 184.4, 37.3),
        (43, 147.8, 32.8), (49, 247.0, 55.7), (54, 468.5, 117.3), (59, 462.9, 84.0)
    ]
    for b_id, p, q in load_specs:
        pp.create_load(net, bus=buses[b_id], p_mw=p, q_mvar=q, name=f"Load {bus_names[b_id-1]}")

    return net