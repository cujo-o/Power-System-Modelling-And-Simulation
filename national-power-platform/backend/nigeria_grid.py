import pandapower as pp

def get_nigeria_330kv():
    net = pp.create_empty_network(name="Nigeria_330kV", f_hz=50.0, sn_mva=100.0)

    # 1. Primary 330kV Substation Buses with direct geodata coordinates (x, y)
    b_kainji = pp.create_bus(net, vn_kv=330.0, name="Kainji GS", zone="North-Central", geodata=(170.0, 70.0))
    b_jebba = pp.create_bus(net, vn_kv=330.0, name="Jebba TS/GS", zone="North-Central", geodata=(210.0, 140.0))
    b_shiroro = pp.create_bus(net, vn_kv=330.0, name="Shiroro GS", zone="North-Central", geodata=(360.0, 100.0))
    b_abuja = pp.create_bus(net, vn_kv=330.0, name="Katampe (Abuja) TS", zone="North-Central", geodata=(400.0, 180.0))
    b_oshogbo = pp.create_bus(net, vn_kv=330.0, name="Oshogbo TS", zone="South-West", geodata=(250.0, 240.0))
    b_ikeja = pp.create_bus(net, vn_kv=330.0, name="Ikeja West TS", zone="South-West", geodata=(150.0, 330.0))
    b_egbin = pp.create_bus(net, vn_kv=330.0, name="Egbin PS", zone="South-West", geodata=(210.0, 390.0))
    b_benin = pp.create_bus(net, vn_kv=330.0, name="Benin TS", zone="Mid-West", geodata=(340.0, 330.0))
    b_afam = pp.create_bus(net, vn_kv=330.0, name="Afam PS", zone="South-South", geodata=(440.0, 390.0))

    # 2. Slack / Reference Grid Infeed
    pp.create_ext_grid(net, bus=b_egbin, vm_pu=1.03, va_degree=0.0, name="Egbin Grid Connection")

    # 3. Synchronous Generating Units
    pp.create_gen(net, bus=b_kainji, p_mw=450.0, vm_pu=1.02, name="Kainji Hydro")
    pp.create_gen(net, bus=b_jebba, p_mw=420.0, vm_pu=1.02, name="Jebba Hydro")
    pp.create_gen(net, bus=b_shiroro, p_mw=380.0, vm_pu=1.01, name="Shiroro Hydro")
    pp.create_gen(net, bus=b_afam, p_mw=500.0, vm_pu=1.02, name="Afam Thermal")

    # 4. Bulk Demand Centers
    pp.create_load(net, bus=b_ikeja, p_mw=650.0, q_mvar=180.0, name="Ikeja / Lagos Bulk")
    pp.create_load(net, bus=b_benin, p_mw=310.0, q_mvar=90.0, name="Benin Regional Load")
    pp.create_load(net, bus=b_oshogbo, p_mw=250.0, q_mvar=70.0, name="Oshogbo Local Load")
    pp.create_load(net, bus=b_abuja, p_mw=480.0, q_mvar=130.0, name="Abuja FCT Load")

    # 5. Transmission Line Corridors
    line_data = {"r_ohm_per_km": 0.035, "x_ohm_per_km": 0.320, "c_nf_per_km": 11.2, "max_i_ka": 1.25}

    corridors = [
        (b_egbin, b_ikeja, 62.0, "Egbin - Ikeja West"),
        (b_egbin, b_benin, 280.0, "Egbin - Benin"),
        (b_ikeja, b_oshogbo, 225.0, "Ikeja West - Oshogbo"),
        (b_benin, b_oshogbo, 251.0, "Benin - Oshogbo"),
        (b_benin, b_afam, 215.0, "Benin - Afam"),
        (b_oshogbo, b_jebba, 155.0, "Oshogbo - Jebba"),
        (b_kainji, b_jebba, 81.0, "Kainji - Jebba"),
        (b_jebba, b_shiroro, 244.0, "Jebba - Shiroro"),
        (b_shiroro, b_abuja, 144.0, "Shiroro - Abuja"),
    ]

    for from_b, to_b, length, name in corridors:
        pp.create_line_from_parameters(net, from_bus=from_b, to_bus=to_b, length_km=length, name=name, **line_data)

    return net