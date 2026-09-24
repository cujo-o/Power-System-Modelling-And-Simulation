import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from routers.auth import get_auth_router
from routers.models import get_model_router
from routers.simulations import get_sim_router

app = FastAPI(
    title="National Power System Simulation API",
    description="Backend engine for Nigerian Electricity Supply Industry (NESI) 330/132 kV Grid",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_registry = {}
state = {"active_model_id": None}

def get_active_net_and_name():
    active_id = state.get("active_model_id")
    if active_id and active_id in model_registry:
        return model_registry[active_id]["net"], model_registry[active_id]["name"]
    if model_registry:
        first_id = list(model_registry.keys())[0]
        state["active_model_id"] = first_id
        return model_registry[first_id]["net"], model_registry[first_id]["name"]
    return None, "No Active Model"

# Auth Router
app.include_router(get_auth_router())

# Model Routers (Supports /api/models and /api/model)
model_router = get_model_router(model_registry, state)
app.include_router(model_router, prefix="/api/models")
app.include_router(model_router, prefix="/api/model")

# Simulation Routers (Supports both /api/simulate and /api/simulations)
sim_router = get_sim_router(model_registry, get_active_net_and_name)
app.include_router(sim_router, prefix="/api/simulate")
app.include_router(sim_router, prefix="/api/simulations")

@app.get("/")
def root():
    return {
        "service": "National Power System Simulation API",
        "status": "ONLINE",
        "active_model": state.get("active_model_id"),
        "models_count": len(model_registry),
    }

@app.get("/health")
def health_check():
    return {
        "status": "ONLINE",
        "active_model": state.get("active_model_id"),
    }