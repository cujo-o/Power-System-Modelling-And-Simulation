from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class SimulationRequest(BaseModel):
    load_multiplier: Optional[float] = 1.0
    tripped_lines: Optional[List[int]] = []

class DynamicSimRequest(BaseModel):
    disturbance_mw: float = 450.0
    inertia_constant_H: float = 4.5
    enable_governor: bool = True
    droop_R: float = 0.05
    enable_pss: bool = True
    pss_gain_K: float = 25.0

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