import pandapower as pp
import math

def build_nig_10_bus() -> pp.pandapowerNet:
    net = pp.create_empty_network(name="Nig 10-Bus Benchmark Grid", f_hz=50.0, sn_mva=100.0)
    
    stations = [
        ("Kainji GS (Hydro)", 330, "North-Central", 130.0, 90.0),
        ("Jebba TS/GS", 330, "North-Central", 270.0, 90.0),
        ("Shiroro GS (Hydro)", 330, "North-Central", 470.0, 90.0),
        ("Katampe (Abuja) TS", 330, "North-Central", 650.0, 90.0),
        ("Osogbo NCC Hub", 330, "South-West", 270.0, 240.0),
        ("Ikeja West TS", 330, "South-West", 120.0, 390.0),
        ("Egbin PS (Slack)", 330, "South-West", 270.0, 390.0),
        ("Benin TS", 330, "Mid-West", 500.0, 240.0),
        ("Afam VI GS", 330, "South-South", 500.0, 390.0),
        ("Delta IV GS", 330, "South-South", 650.0, 390.0)
    ]
    buses = {}
    for i, (name, vn, zone, x, y) in enumerate(stations):
        buses[i] = pp.create_bus(net, vn_kv=vn, name=name, zone=zone, geodata=(x, y))

    pp.create_ext_grid(net, bus=buses[6], vm_pu=1.03, name="Egbin PS (Slack)")
    pp.create_gen(net, bus=buses[0], p_mw=450.0, vm_pu=1.02, name="Kainji Hydro", min_p_mw=100, max_p_mw=760)
    pp.create_gen(net, bus=buses[1], p_mw=420.0, vm_pu=1.02, name="Jebba Hydro", min_p_mw=100, max_p_mw=621)
    pp.create_gen(net, bus=buses[2], p_mw=380.0, vm_pu=1.02, name="Shiroro Hydro", min_p_mw=100, max_p_mw=600)
    pp.create_gen(net, bus=buses[8], p_mw=450.0, vm_pu=1.02, name="Afam VI Gas", min_p_mw=80, max_p_mw=650)
    pp.create_gen(net, bus=buses[9], p_mw=390.0, vm_pu=1.02, name="Delta IV Gas", min_p_mw=50, max_p_mw=890)

    pp.create_load(net, bus=buses[3], p_mw=468.5, q_mvar=117.2, name="Abuja Load")
    pp.create_load(net, bus=buses[5], p_mw=587.2, q_mvar=152.1, name="Lagos Load")
    pp.create_load(net, bus=buses[4], p_mw=159.6, q_mvar=42.2, name="Osogbo Load")
    pp.create_load(net, bus=buses[7], p_mw=171.6, q_mvar=37.7, name="Benin Load")

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
        (8, 9, 85.0, "Afam - Delta 330kV")
    ]
    for fb, tb, length, name in corridors:
        pp.create_line_from_parameters(
            net, from_bus=buses[fb], to_bus=buses[tb], length_km=length,
            r_ohm_per_km=0.035, x_ohm_per_km=0.320, c_nf_per_km=11.2, max_i_ka=1.25, name=name
        )
    return net

def build_case330() -> pp.pandapowerNet:
    net = pp.create_empty_network(name="Nigeria 330kV Grid (63-Bus NISO Equivalent)", f_hz=50.0, sn_mva=100.0)
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
        angle = 2 * math.pi * (idx - 1) / len(bus_names)
        gx = round(350.0 + 260.0 * math.cos(angle), 1)
        gy = round(240.0 + 190.0 * math.sin(angle), 1)
        zone = "South-West" if idx <= 13 or idx in [26, 27, 29, 30] else \
               "North-Central" if idx in [14, 15, 16, 17, 18, 19, 20, 21, 22, 53, 54, 55, 56, 57, 58] else \
               "North-West" if idx in [31, 32, 59, 60] else \
               "North-East" if idx in range(33, 42) else \
               "Mid-West" if idx in [23, 24, 25, 28, 46] else "South-South"
        buses[idx] = pp.create_bus(net, vn_kv=330, name=name, zone=zone, geodata=(gx, gy))

    pp.create_ext_grid(net, bus=buses[3], vm_pu=1.05, name="EGBIN 3 (Slack)")
    
    generators = [
        (6, 150.8, "OLORUNSOGO Gas", 336.8), (16, 278.1, "JEBBA Hydro", 621.0),
        (17, 340.4, "KAINJI Hydro", 760.0), (20, 313.5, "ZUNGERU Hydro", 700.0),
        (21, 268.7, "SHIRORO Hydro", 600.0), (24, 398.7, "DELTA IV Gas", 890.2),
        (25, 268.7, "SAPELE Steam", 600.0), (26, 136.2, "OMOTOSHO Gas", 304.0),
        (48, 291.1, "AFAM VI Shell", 650.0), (49, 201.5, "ALAOJI NIPP", 450.0),
        (55, 194.8, "GEREGU Gas", 435.0)
    ]
    for b_id, p, name, pmax in generators:
        pp.create_gen(net, bus=buses[b_id], p_mw=p, vm_pu=1.03, name=name, min_p_mw=10.0, max_p_mw=pmax)

    branches = [
        (1, 3, 20.0, "AJA - EGBIN"), (2, 4, 30.0, "AKANGBA - IKEJA W"),
        (3, 4, 35.0, "EGBIN - IKEJA W"), (3, 23, 280.0, "EGBIN - BENIN"),
        (4, 6, 80.0, "IKEJA W - OLORUNSOGO"), (6, 11, 100.0, "OLORUNSOGO - AYEDE"),
        (11, 12, 115.0, "AYEDE - OSOGBO"), (12, 13, 85.0, "OSOGBO - GANMO"),
        (12, 15, 157.0, "OSOGBO - JEBBA"), (15, 17, 81.0, "JEBBA - KAINJI"),
        (15, 21, 244.0, "JEBBA - SHIRORO"), (21, 54, 144.0, "SHIRORO - KATAMPE"),
        (21, 31, 96.0, "SHIRORO - KADUNA"), (31, 59, 230.0, "KADUNA - KANO"),
        (23, 43, 137.0, "BENIN - ONITSHA"), (43, 49, 138.0, "ONITSHA - ALAOJI"),
        (48, 49, 25.0, "AFAM - ALAOJI")
    ]
    for fb, tb, length, name in branches:
        pp.create_line_from_parameters(
            net, from_bus=buses[fb], to_bus=buses[tb], length_km=length,
            r_ohm_per_km=0.035, x_ohm_per_km=0.320, c_nf_per_km=11.2, max_i_ka=1.25, name=name
        )
    return net