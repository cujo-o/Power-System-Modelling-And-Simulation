from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.models import get_model_router
from routers.simulations import get_sim_router
from routers.auth import get_auth_router
# In backend/main.py (or startup event):
from services.importers import parse_matpower_case # or your case parser function

@app.on_event("startup")
def seed_default_models():
    """Seeds default Nigerian grid benchmarks into model_registry on container startup."""
    default_cases = [
        ("case10_nigeria_dynamic.m", "330kV", "Static & Dynamic", "PSAT"),
        ("case330.m", "330kV", "Static Power Flow", "MATPOWER"),
    ]
    for filename, v_level, domain, platform in default_cases:
        if filename not in model_registry:
            try:
                # Load from backend cases directory
                net = parse_matpower_case(f"cases/{filename}")
                model_registry[filename] = {
                    "name": filename,
                    "net": net,
                    "voltage_level": v_level,
                    "domain": domain,
                    "platform": platform,
                    "is_default": True
                }
            except Exception as e:
                print(f"Notice: Could not pre-seed {filename}: {e}")

    # Set initial active model
    if not state.get("active_model_id") and model_registry:
        state["active_model_id"] = list(model_registry.keys())[0]

app = FastAPI(title="National Power System Simulation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared in-memory registry & state
model_registry = {}
state = {"active_model_id": None}

# Include routers
app.include_router(get_auth_router())
app.include_router(get_model_router(model_registry, state))
app.include_router(get_sim_router(model_registry, lambda: (
    model_registry[state["active_model_id"]]["net"] if state.get("active_model_id") and state["active_model_id"] in model_registry else None,
    model_registry[state["active_model_id"]]["name"] if state.get("active_model_id") and state["active_model_id"] in model_registry else "No Model"
)))

@app.get("/health")
def health_check():
    return {"status": "ONLINE", "active_model": state.get("active_model_id")}