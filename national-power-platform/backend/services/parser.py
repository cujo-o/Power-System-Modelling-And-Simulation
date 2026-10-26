import re
import json
import pandapower as pp


def parse_matpower_m_file(content: str, filename: str):
    net = pp.create_empty_network(f_hz=50.0, sn_mva=100.0)

    # 1. Check for mpc.bus_name cell array if present
    bus_names = []
    name_match = re.search(r"mpc\.bus_name\s*=\s*\{([\s\S]*?)\};", content)
    if name_match:
        raw_names = re.findall(r"['\"]([^'\"]+)['\"]", name_match.group(1))
        bus_names = [n.strip() for n in raw_names]

    # 2. Parse mpc.bus
    bus_match = re.search(r"mpc\.bus\s*=\s*\[([\s\S]*?)\];", content)
    if not bus_match:
        raise ValueError("No mpc.bus matrix found in MATPOWER file.")

    bus_map = {}
    bus_rows = bus_match.group(1).strip().splitlines()
    row_idx = 0

    for line in bus_rows:
        raw_line = line.strip()
        if not raw_line or raw_line.startswith("%"):
            continue

        inline_name = None
        q_match = re.search(r"['\"]([^'\"]+)['\"]", raw_line)
        if q_match:
            inline_name = q_match.group(1).strip()

        comment_name = None
        if "%" in raw_line:
            comment_name = raw_line.split("%", 1)[1].strip()

        clean_part = raw_line.split("%")[0]
        clean_part = re.sub(r"['\"][^'\"]+['\"]", "", clean_part).replace(";", "").strip()
        tokens = [t for t in clean_part.split() if t]

        nums = []
        for t in tokens:
            try:
                nums.append(float(t))
            except ValueError:
                pass

        if len(nums) < 10:
            continue

        mat_bus_id = int(nums[0])
        bus_type = int(nums[1])
        pd_mw = nums[2]
        qd_mvar = nums[3]
        vm_pu = nums[7] if nums[7] > 0 else 1.0
        base_kv = nums[9] if nums[9] > 0 else 330.0

        resolved_name = (
            inline_name
            or (bus_names[row_idx] if row_idx < len(bus_names) else None)
            or comment_name
            or f"Substation {mat_bus_id}"
        )

        pp_bus = pp.create_bus(net, vn_kv=base_kv, name=resolved_name, index=mat_bus_id)
        bus_map[mat_bus_id] = (pp_bus, bus_type, vm_pu)

        if abs(pd_mw) > 1e-4 or abs(qd_mvar) > 1e-4:
            pp.create_load(net, bus=pp_bus, p_mw=pd_mw, q_mvar=qd_mvar, name=f"Load {resolved_name}")

        row_idx += 1

    # 3. Parse mpc.gen
    gen_match = re.search(r"mpc\.gen\s*=\s*\[([\s\S]*?)\];", content)
    has_slack = False
    if gen_match:
        for line in gen_match.group(1).strip().splitlines():
            clean = line.split("%")[0].replace(";", "").strip()
            if not clean:
                continue
            nums = []
            for t in clean.split():
                try:
                    nums.append(float(t))
                except ValueError:
                    pass
            if len(nums) < 6:
                continue

            g_bus = int(nums[0])
            pg_mw = nums[1]
            vg_pu = nums[5] if nums[5] > 0 else 1.02
            pmax_mw = nums[8] if len(nums) > 8 and nums[8] > 0 else max(100.0, abs(pg_mw) * 1.5)

            if g_bus in bus_map:
                pp_bus, b_type, _ = bus_map[g_bus]
                if b_type == 3 and not has_slack:
                    pp.create_ext_grid(net, bus=pp_bus, vm_pu=vg_pu, name=f"Slack Bus {g_bus}")
                    has_slack = True
                else:
                    pp.create_gen(
                        net,
                        bus=pp_bus,
                        p_mw=max(0.0, pg_mw),
                        vm_pu=vg_pu,
                        max_p_mw=pmax_mw,
                        min_p_mw=0.0,
                        name=f"Gen Bus {g_bus}",
                    )

    if not has_slack and len(bus_map) > 0:
        first_bus = next(iter(bus_map.values()))[0]
        pp.create_ext_grid(net, bus=first_bus, vm_pu=1.04, name="Reference Grid")

    # 4. Parse mpc.branch
    branch_match = re.search(r"mpc\.branch\s*=\s*\[([\s\S]*?)\];", content)
    if branch_match:
        line_idx = 1
        for line in branch_match.group(1).strip().splitlines():
            clean = line.split("%")[0].replace(";", "").strip()
            if not clean:
                continue
            nums = []
            for t in clean.split():
                try:
                    nums.append(float(t))
                except ValueError:
                    pass
            if len(nums) < 5:
                continue

            f_bus = int(nums[0])
            t_bus = int(nums[1])
            r_pu = max(1e-5, nums[2])
            x_pu = max(1e-4, nums[3])
            rate_a = nums[5] if len(nums) > 5 and nums[5] > 0 else 500.0

            if f_bus in bus_map and t_bus in bus_map:
                vn_kv = float(net.bus.at[f_bus, "vn_kv"]) if f_bus in net.bus.index else 330.0
                z_base = (vn_kv ** 2) / 100.0
                r_ohm = r_pu * z_base
                x_ohm = x_pu * z_base
                max_i_ka = max(0.2, rate_a / (1.732 * vn_kv))
                f_name = net.bus.at[f_bus, "name"]
                t_name = net.bus.at[t_bus, "name"]

                pp.create_line_from_parameters(
                    net,
                    from_bus=f_bus,
                    to_bus=t_bus,
                    length_km=1.0,
                    r_ohm_per_km=r_ohm,
                    x_ohm_per_km=x_ohm,
                    c_nf_per_km=10.0,
                    max_i_ka=max_i_ka,
                    name=f"{f_name} - {t_name}",
                    index=line_idx,
                )
                line_idx += 1

    return net