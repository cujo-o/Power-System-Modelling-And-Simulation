"""Pydantic request schemas shared across all API routers."""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class NewBusElement(BaseModel):
    """Proposed substation busbar for regional expansion studies."""

    name: str
    vn_kv: float = Field(default=330.0, gt=0)
    zone: str = "North-Central"
    p_mw: float = 0.0
    q_mvar: float = 0.0


class NewLineElement(BaseModel):
    """Proposed transmission line corridor connecting two bus IDs."""

    name: str
    from_bus: int
    to_bus: int
    length_km: float = Field(default=65.0, gt=0)
    conductor_type: str = "Bison 330kV"
    vn_kv: float = Field(default=330.0, gt=0)


class NewGenElement(BaseModel):
    """Proposed generating station attached to an existing or newly proposed bus."""

    name: str
    bus: int
    p_mw: float = Field(default=150.0, ge=0)
    vm_pu: float = Field(default=1.03, ge=0.85, le=1.15)
    p_max_mw: float = Field(default=225.0, gt=0)


class PowerFlowVariables(BaseModel):
    """Operational deck parameters and sandbox planning additions for AC power flow."""

    loadMultiplier: float = Field(default=1.0, ge=0.2, le=3.0)
    targetPowerFactor: float = Field(default=0.90, ge=0.70, le=1.0)
    slackVoltagePu: float = Field(default=1.05, ge=0.85, le=1.15)
    shuntMvarCompensation: float = 0.0
    thermalDeratingFactor: float = Field(default=1.0, ge=0.5, le=1.5)
    newBuses: List[NewBusElement] = Field(default_factory=list)
    newLines: List[NewLineElement] = Field(default_factory=list)
    newGenerators: List[NewGenElement] = Field(default_factory=list)


class PowerFlowRequest(BaseModel):
    """Request payload for steady-state power flow simulation."""

    pf_variables: Optional[PowerFlowVariables] = None
    tripped_lines: List[int] = Field(default_factory=list)


class LoadSharingRequest(BaseModel):
    """Request payload for decentralized governor droop load-sharing calculation."""

    load_step_mw: float = 300.0
    system_damping_d: float = Field(default=1.2, ge=0.0, le=10.0)
    # Keyed by generator ID (e.g. "gen_0") or bus ID string (e.g. "17") -> droop in %
    droop_overrides: Dict[str, float] = Field(default_factory=dict)


class CascadeRequest(BaseModel):
    """Request payload for sequential thermal overload cascading simulation."""

    initial_tripped_lines: List[int] = Field(default_factory=list)
    overload_threshold_percent: float = Field(default=100.0, ge=50.0, le=200.0)
    max_cascade_steps: int = Field(default=8, ge=1, le=20)
    load_multiplier: float = Field(default=1.0, ge=0.2, le=3.0)
    slack_voltage_pu: float = Field(default=1.05, ge=0.85, le=1.15)
    target_power_factor: float = Field(default=0.90, ge=0.70, le=1.0)


class DynamicSimRequest(BaseModel):
    """Request payload for center-of-inertia frequency response and UFLS simulation."""

    disturbance_mw: float = Field(default=650.0, ge=10.0, le=5000.0)
    inertia_constant_H: float = Field(default=4.5, ge=1.0, le=15.0)
    damping_coefficient_D: float = Field(default=1.8, ge=0.0, le=10.0)
    enable_governor: bool = True
    droop_R: float = Field(default=0.05, ge=0.01, le=0.20)
    governor_time_constant_Tg: float = Field(default=0.2, ge=0.05, le=5.0)
    turbine_time_constant_Tt: float = Field(default=0.5, ge=0.1, le=10.0)
    enable_pss: bool = True
    pss_gain_K: float = Field(default=25.0, ge=0.0, le=100.0)
    enable_ufls: bool = True
    sim_duration_s: float = Field(default=12.0, ge=2.0, le=30.0)


class MultiMachineRequest(BaseModel):
    """Request payload for multi-machine transient rotor-angle and CCT analysis."""

    fault_bus_id: int
    fault_start_time_s: float = Field(default=1.0, ge=0.1, le=5.0)
    fault_duration_ms: float = Field(default=80.0, ge=10.0, le=600.0)
    sim_duration_s: float = Field(default=4.0, ge=1.5, le=15.0)
    calc_cct: bool = True


class LoadPayloadRequest(BaseModel):
    """Request payload to rehydrate a serialized pandapower network into solver memory."""

    id: str
    name: str
    voltage_level: Optional[str] = "330kV"
    domain: Optional[str] = "Static Power Flow"
    platform: Optional[str] = "MATPOWER"
    network_payload: str


class UserLoginRequest(BaseModel):
    """Credentials payload for operator login."""

    email: str
    password: str


class AccessRequestPayload(BaseModel):
    """Payload for submitting or updating a platform access request."""

    id: Optional[str] = None
    full_name: str
    email: str
    institution: str = "Independent"
    reason: str = "Power System Simulation"
    password: Optional[str] = None
    role: str = "user"
    status: str = "pending"
    created_at: Optional[str] = None
