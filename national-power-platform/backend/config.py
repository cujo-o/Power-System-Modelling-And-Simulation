"""Platform configuration, Nigerian Grid Code limits, and standard conductor parameters."""

import os
from dataclasses import dataclass, field
from typing import Dict, List


@dataclass(frozen=True)
class ConductorSpec:
    """Electrical per-km parameters and thermal current rating for overhead lines."""

    r_ohm_per_km: float
    x_ohm_per_km: float
    c_nf_per_km: float
    max_i_ka: float


# Standard ACSR conductor types used on NESI 330 kV and 132 kV transmission corridors.
CONDUCTOR_CATALOG: Dict[str, ConductorSpec] = {
    "Bison 330kV": ConductorSpec(r_ohm_per_km=0.035, x_ohm_per_km=0.320, c_nf_per_km=11.2, max_i_ka=1.25),
    "Bear 330kV": ConductorSpec(r_ohm_per_km=0.045, x_ohm_per_km=0.340, c_nf_per_km=10.5, max_i_ka=1.01),
    "Panther 132kV": ConductorSpec(r_ohm_per_km=0.095, x_ohm_per_km=0.380, c_nf_per_km=9.8, max_i_ka=0.70),
    "Wolf 132kV": ConductorSpec(r_ohm_per_km=0.145, x_ohm_per_km=0.400, c_nf_per_km=9.2, max_i_ka=0.55),
    "Bear 132kV": ConductorSpec(r_ohm_per_km=0.085, x_ohm_per_km=0.360, c_nf_per_km=10.0, max_i_ka=0.65),
}


def _parse_csv_env(name: str, default: str = "") -> List[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    """Immutable runtime settings and statutory Nigerian Grid Code operating limits."""

    APP_TITLE: str = "National Power System Simulation API"
    APP_DESCRIPTION: str = (
        "AC power flow, contingency, transient dynamics, and governor load-sharing "
        "engine for the Nigerian Electricity Supply Industry (NESI) transmission grid."
    )
    APP_VERSION: str = "2.1.0"

    # Nigerian Grid Code statutory operating bounds
    V_MIN_PU: float = 0.95
    V_MAX_PU: float = 1.05
    F_NOMINAL_HZ: float = 50.00
    F_DEADBAND_HZ: float = 0.25
    LINE_THERMAL_WARN_PCT: float = 85.0
    LINE_THERMAL_LIMIT_PCT: float = 100.0
    DEFAULT_GRID_STIFFNESS_MW_PER_HZ: float = 3500.0

    # Optional environment-configured root admin and CORS origins
    ADMIN_EMAIL: str = field(default_factory=lambda: os.getenv("ADMIN_EMAIL", "").strip().lower())
    ADMIN_PASSWORD: str = field(default_factory=lambda: os.getenv("ADMIN_PASSWORD", "").strip())
    CORS_ORIGINS: List[str] = field(default_factory=lambda: _parse_csv_env("CORS_ORIGINS", "*"))


settings = Settings()
