from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class MultiMachineSimRequest(BaseModel):
    fault_bus_id: Optional[int] = 12           # Bus where 3-phase fault occurs (default: Osogbo NCC Hub)
    fault_start_time_s: Optional[float] = 1.0  # Time of fault inception (s)
    fault_duration_ms: Optional[float] = 160.0 # Protection operating time / breaker clearing (ms)
    sim_duration_s: Optional[float] = 4.0      # Simulation horizon (s)
    calc_cct: Optional[bool] = True            # Automatically solve for Critical Clearing Time (ms)

class UFLSStageConfig(BaseModel):
    stage: int
    frequency_threshold_hz: float
    shed_percentage: float
    time_delay_ms: float = 100.0

class DynamicSimRequest(BaseModel):
    disturbance_mw: float = 450.0
    inertia_constant_H: float = 4.5
    damping_coefficient_D: float = 1.8
    enable_governor: bool = True
    droop_R: float = 0.05
    governor_time_constant_Tg: float = 0.2
    turbine_time_constant_Tt: float = 0.5
    enable_pss: bool = True
    pss_gain_K: float = 25.0
    enable_ufls: bool = True
    sim_duration_s: float = 12.0

class CascadeSimulationRequest(BaseModel):
    initial_tripped_lines: List[int] = []
    overload_threshold_percent: Optional[float] = 100.0
    max_cascade_steps: Optional[int] = 8
    load_multiplier: Optional[float] = 1.0
    slack_voltage_pu: Optional[float] = 1.05
    target_power_factor: Optional[float] = 0.90

class NewBusElement(BaseModel):
    name: str
    vn_kv: float = 330.0
    zone: str = "North-Central"
    p_mw: float = 0.0
    q_mvar: float = 0.0

class NewLineElement(BaseModel):
    name: str
    from_bus: int
    to_bus: int
    length_km: float = 50.0
    conductor_type: str = "Bison 330kV"
    vn_kv: float = 330.0

class NewGenElement(BaseModel):
    name: str
    bus: int
    p_mw: float = 100.0
    vm_pu: float = 1.03
    p_max_mw: float = 250.0

class SimulationRequest(BaseModel):
    load_multiplier: Optional[float] = 1.0
    target_power_factor: Optional[float] = 0.90
    slack_voltage_pu: Optional[float] = 1.05
    shunt_mvar_compensation: Optional[float] = 0.0
    thermal_derating_factor: Optional[float] = 1.0
    tripped_lines: Optional[List[int]] = []
    new_buses: Optional[List[NewBusElement]] = []
    new_lines: Optional[List[NewLineElement]] = []
    new_generators: Optional[List[NewGenElement]] = []

class MarketSimulationRequest(BaseModel):
    load_multiplier: Optional[float] = 1.0
    gas_price_factor: Optional[float] = 1.0
    hydro_availability: Optional[float] = 1.0
    tripped_lines: Optional[List[int]] = []

class LoadPayloadRequest(BaseModel):
    id: str
    name: str
    voltage_level: Optional[str] = "330kV"
    domain: Optional[str] = "Static & Dynamic"
    platform: Optional[str] = "MATPOWER"
    network_payload: str

class UserRegisterRequest(BaseModel):
    name: str
    email: str
    institution: str
    department: Optional[str] = "Electrical & Electronics Engineering"
    reason: str
    referee: Optional[str] = None
    research_tags: Optional[str] = "Power Flow, Grid Code"

class UserLoginRequest(BaseModel):
    email: str
    password: str