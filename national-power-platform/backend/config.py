from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_TITLE: str = "National Power System Simulation API"
    V_MIN_PU: float = 0.95
    V_MAX_PU: float = 1.05
    F_NOMINAL_HZ: float = 50.00
    F_DEADBAND_HZ: float = 0.25
    LINE_THERMAL_LIMIT: float = 85.0
    GRID_STIFFNESS_MW_PER_HZ: float = 3500.0

settings = Settings()