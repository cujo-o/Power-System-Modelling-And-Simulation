"""Parsers for MATPOWER (.m) case files and serialized pandapower (.json) networks."""

import math
import os
import re
from typing import Dict, Tuple

import pandas as pd
import pandapower as pp

SQRT_3 = math.sqrt(3.0)
OMEGA_50HZ = 2.0 * math.pi * 50.0


def _extract_numeric_tokens(line: str) -> list[float]:
    """Extracts floating-point tokens from a MATPOWER matrix row (excluding comments/strings)."""
    no_comment = line.split("%", 1)[0]
    no_strings = re.sub(r"['\"][^'\"]*['\"]", "", no_comment)
    cleaned = no_strings.replace(";", " ").replace(",", " ").strip()
    values: list[float] = []
    for tok in cleaned.split():
        try:
            values.append(float(tok))
        except ValueError:
            continue
    return values


def parse_matpower_m_file(content: str, filename: str = "uploaded_model.m") -> pp.pandapowerNet:
    """
    Parses a MATPOWER version 2 `.m` case file into a pandapower network.

    Supports `mpc.baseMVA`, `mpc.bus`, `mpc.bus_name`, `mpc.gen`, and `mpc.branch`,
    including inline quoted or `%`-commented substation labels, out-of-service elements,
    fixed bus shunts, and line charging susceptance.
    """
    if isinstance(content, (bytes, bytearray)):
        content = content.decode("utf-8", errors="replace")
    elif isinstance(content, str) and len(content) < 500 and os.path.exists(content):
        filename = os.path.basename(content)
        with open(content, "r", encoding="utf-8", errors="replace") as handle:
            content = handle.read()

    # 1. Read system MVA base (defaults to 100 MVA per MATPOWER convention)
    base_mva = 100.0
    mva_match = re.search(r"(?:mpc\.)?baseMVA\s*=\s*([0-9]+(?:\.[0-9]+)?)", content)
    if mva_match:
        parsed_mva = float(mva_match.group(1))
        if parsed_mva > 0:
            base_mva = parsed_mva

    net = pp.create_empty_network(name=filename, f_hz=50.0, sn_mva=base_mva)

    # 2. Extract optional mpc.bus_name cell array
    bus_names: list[str] = []
    name_match = re.search(r"(?:mpc\.)?bus_name\s*=\s*\{([\s\S]*?)\};", content)
    if name_match:
        bus_names = [n.strip() for n in re.findall(r"['\"]([^'\"]+)['\"]", name_match.group(1))]

    # 3. Parse mpc.bus matrix
    bus_match = re.search(r"(?:mpc\.)?bus\s*=\s*\[([\s\S]*?)\];", content)
    if not bus_match:
        raise ValueError("No mpc.bus matrix found in MATPOWER file.")

    # Maps MATPOWER bus ID -> (pandapower bus index, bus_type, vm_pu)
    bus_map: Dict[int, Tuple[int, int, float]] = {}
    row_idx = 0

    for raw_line in bus_match.group(1).strip().splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("%"):
            continue

        quote_match = re.search(r"['\"]([^'\"]+)['\"]", stripped)
        inline_name = quote_match.group(1).strip() if quote_match else None
        comment_name = stripped.split("%", 1)[1].strip() if "%" in stripped else None

        nums = _extract_numeric_tokens(stripped)
        if len(nums) < 10:
            continue

        mat_bus_id = int(nums[0])
        bus_type = int(nums[1])
        pd_mw = nums[2]
        qd_mvar = nums[3]
        gs_mw = nums[4]
        bs_mvar = nums[5]
        vm_pu = nums[7] if nums[7] > 0 else 1.0
        base_kv = nums[9] if nums[9] > 0 else 330.0
        is_in_service = bus_type != 4

        resolved_name = (
            inline_name
            or (bus_names[row_idx] if row_idx < len(bus_names) else None)
            or comment_name
            or f"Substation {mat_bus_id}"
        )

        pp_bus = pp.create_bus(
            net,
            vn_kv=base_kv,
            name=resolved_name,
            index=mat_bus_id,
            in_service=is_in_service,
        )
        bus_map[mat_bus_id] = (pp_bus, bus_type, vm_pu)

        if abs(pd_mw) > 1e-4 or abs(qd_mvar) > 1e-4:
            pp.create_load(
                net,
                bus=pp_bus,
                p_mw=pd_mw,
                q_mvar=qd_mvar,
                in_service=is_in_service,
                name=f"Load {resolved_name}",
            )

        # MATPOWER Bs > 0 is capacitive injection; pandapower shunt q_mvar < 0 is capacitive.
        if abs(gs_mw) > 1e-4 or abs(bs_mvar) > 1e-4:
            pp.create_shunt(
                net,
                bus=pp_bus,
                p_mw=gs_mw,
                q_mvar=-bs_mvar,
                in_service=is_in_service,
                name=f"Shunt {resolved_name}",
            )

        row_idx += 1

    if not bus_map:
        raise ValueError("MATPOWER mpc.bus matrix contained no valid bus rows.")

    # 4. Parse mpc.gen matrix
    gen_match = re.search(r"(?:mpc\.)?gen\s*=\s*\[([\s\S]*?)\];", content)
    has_slack = False
    if gen_match:
        for raw_line in gen_match.group(1).strip().splitlines():
            nums = _extract_numeric_tokens(raw_line)
            if len(nums) < 6:
                continue

            g_bus = int(nums[0])
            if g_bus not in bus_map:
                continue

            pg_mw = nums[1]
            vg_pu = nums[5] if nums[5] > 0 else 1.02
            gen_in_service = (int(nums[7]) != 0) if len(nums) > 7 else True
            pmax_mw = nums[8] if (len(nums) > 8 and nums[8] > 0) else max(100.0, abs(pg_mw) * 1.5)
            pmin_mw = nums[9] if len(nums) > 9 else 0.0

            pp_bus, bus_type, _ = bus_map[g_bus]
            bus_label = str(net.bus.at[pp_bus, "name"])

            if bus_type == 3 and gen_in_service and not has_slack:
                pp.create_ext_grid(
                    net,
                    bus=pp_bus,
                    vm_pu=vg_pu,
                    max_p_mw=pmax_mw,
                    min_p_mw=pmin_mw,
                    name=f"Slack {bus_label}",
                )
                has_slack = True
            else:
                pp.create_gen(
                    net,
                    bus=pp_bus,
                    p_mw=max(0.0, pg_mw),
                    vm_pu=vg_pu,
                    max_p_mw=pmax_mw,
                    min_p_mw=max(0.0, pmin_mw),
                    in_service=gen_in_service,
                    name=bus_label,
                )

    if not has_slack:
        first_bus = next(iter(bus_map.values()))[0]
        pp.create_ext_grid(net, bus=first_bus, vm_pu=1.04, name="Reference Grid")

    # 5. Parse mpc.branch matrix
    branch_match = re.search(r"(?:mpc\.)?branch\s*=\s*\[([\s\S]*?)\];", content)
    if branch_match:
        line_idx = 1
        for raw_line in branch_match.group(1).strip().splitlines():
            nums = _extract_numeric_tokens(raw_line)
            if len(nums) < 5:
                continue

            f_bus = int(nums[0])
            t_bus = int(nums[1])
            if f_bus not in bus_map or t_bus not in bus_map or f_bus == t_bus:
                continue

            r_pu = max(1e-5, nums[2])
            x_pu = max(1e-4, nums[3])
            b_pu = max(0.0, nums[4])
            rate_a = nums[5] if (len(nums) > 5 and nums[5] > 0) else 500.0
            branch_in_service = (int(nums[10]) != 0) if len(nums) > 10 else True

            vn_kv = float(net.bus.at[f_bus, "vn_kv"])
            z_base = (vn_kv ** 2) / base_mva
            r_ohm = r_pu * z_base
            x_ohm = x_pu * z_base
            # Total line charging susceptance B = b_pu / z_base -> C (nF) = B / omega * 1e9
            c_nf = (b_pu / z_base) / OMEGA_50HZ * 1e9 if b_pu > 0 else 10.0
            max_i_ka = max(0.2, rate_a / (SQRT_3 * vn_kv))

            f_name = net.bus.at[f_bus, "name"]
            t_name = net.bus.at[t_bus, "name"]

            pp.create_line_from_parameters(
                net,
                from_bus=f_bus,
                to_bus=t_bus,
                length_km=1.0,
                r_ohm_per_km=r_ohm,
                x_ohm_per_km=x_ohm,
                c_nf_per_km=c_nf,
                max_i_ka=max_i_ka,
                in_service=branch_in_service,
                name=f"{f_name} - {t_name}",
                index=line_idx,
            )
            line_idx += 1

    # Attempt an initial power flow pass so steady-state operating points are pre-populated
    try:
        pp.runpp(net, numba=False)
    except Exception:
        pass

    return net


def parse_network_file(content: str, filename: str) -> Tuple[pp.pandapowerNet, str]:
    """
    Parses an uploaded simulation file into a pandapower network and returns `(net, platform)`.

    Supported formats:
      - `.m`: MATPOWER v2 script
      - `.json`: Serialized pandapower JSON network
    """
    lower = filename.lower()
    if lower.endswith(".json"):
        net = pp.from_json_string(content)
        if not hasattr(net, "bus") or len(net.bus) == 0:
            raise ValueError("JSON network file contains no buses.")
        try:
            pp.runpp(net, numba=False)
        except Exception:
            pass
        return net, "pandapower"

    if lower.endswith(".m"):
        return parse_matpower_m_file(content, filename), "MATPOWER"

    raise ValueError(
        f'Unsupported file format for "{filename}". Upload a MATPOWER (.m) or pandapower (.json) file.'
    )


def extract_model_metadata(
    net: pp.pandapowerNet,
    model_id: str,
    name: str,
    platform: str = "MATPOWER",
    raw_text: str = "",
    voltage_level: str | None = None,
    domain: str | None = None,
    include_payload: bool = False,
) -> dict:
    """Computes standardized JSON-serializable summary metadata for a pandapower network."""
    total_mw = 0.0
    if hasattr(net, "gen") and len(net.gen) > 0:
        if "max_p_mw" in net.gen:
            valid_max = net.gen["max_p_mw"].dropna()
            total_mw += float(valid_max.sum())
        elif "p_mw" in net.gen:
            total_mw += float(net.gen["p_mw"].dropna().sum())

    if hasattr(net, "ext_grid") and len(net.ext_grid) > 0:
        if "max_p_mw" in net.ext_grid and net.ext_grid["max_p_mw"].notna().any():
            total_mw += float(net.ext_grid["max_p_mw"].dropna().sum())
        elif hasattr(net, "res_ext_grid") and len(net.res_ext_grid) > 0 and "p_mw" in net.res_ext_grid:
            slack_p = float(net.res_ext_grid["p_mw"].dropna().abs().sum())
            total_mw += max(slack_p, 500.0 * len(net.ext_grid))
        else:
            total_mw += 500.0 * len(net.ext_grid)

    total_demand = 0.0
    if hasattr(net, "load") and "p_mw" in net.load and len(net.load) > 0:
        total_demand = float(net.load["p_mw"].dropna().sum())

    bus_count = len(net.bus) if hasattr(net, "bus") else 0
    line_count = len(net.line) if hasattr(net, "line") else 0
    trafo_count = len(net.trafo) if hasattr(net, "trafo") else 0

    resolved_voltage = voltage_level
    if not resolved_voltage:
        if "132" in name:
            resolved_voltage = "132kV"
        elif "130" in name:
            resolved_voltage = "130kV"
        elif hasattr(net, "bus") and "vn_kv" in net.bus and len(net.bus) > 0:
            resolved_voltage = f"{int(round(float(net.bus['vn_kv'].median())))}kV"
        else:
            resolved_voltage = "330kV"

    resolved_domain = domain
    if not resolved_domain:
        is_dynamic = "dynamic" in name.lower() or "hydro" in raw_text.lower()
        resolved_domain = "Dynamic & Transient" if is_dynamic else "Static Power Flow"

    meta = {
        "id": model_id,
        "name": name,
        "voltage_level": resolved_voltage,
        "platform": platform,
        "domain": resolved_domain,
        "buses": bus_count,
        "branches": line_count + trafo_count,
        "total_installed_mw": 0.0 if pd.isna(total_mw) else round(total_mw, 1),
        "total_demand_mw": 0.0 if pd.isna(total_demand) else round(total_demand, 1),
        "is_active": True,
        "converged": bool(getattr(net, "converged", True)),
    }
    if include_payload:
        meta["network_payload"] = pp.to_json(net)
    return meta
