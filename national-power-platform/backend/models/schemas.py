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

class UserApprovalRequest(BaseModel):
    user_id: str
    status: str  # APPROVED | REJECTED