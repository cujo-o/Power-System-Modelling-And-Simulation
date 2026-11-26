"""FastAPI application entry point for the National Power System Simulation backend."""

import os
import sys
from typing import Any, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure sibling packages (config, models, routers, services) resolve regardless of CWD
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import settings
from routers.auth import get_auth_router
from routers.models import get_model_router, resolve_active_network
from routers.simulations import get_sim_router

app = FastAPI(
    title=settings.APP_TITLE,
    description=settings.APP_DESCRIPTION,
    version=settings.APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared in-memory model store for the active worker process
model_registry: Dict[str, Dict[str, Any]] = {}
state: Dict[str, Any] = {"active_model_id": None}


def get_active_net_and_name():
    """Resolves the active pandapower network and display name from shared state."""
    return resolve_active_network(model_registry, state)


# Mount domain routers (keeping singular/plural prefix aliases for client compatibility)
app.include_router(get_auth_router())

model_router = get_model_router(model_registry, state)
app.include_router(model_router, prefix="/api/models")
app.include_router(model_router, prefix="/api/model")

sim_router = get_sim_router(get_active_net_and_name)
app.include_router(sim_router, prefix="/api/simulations")
app.include_router(sim_router, prefix="/api/simulate")


@app.get("/")
def root():
    """Service overview and loaded model count."""
    return {
        "service": settings.APP_TITLE,
        "version": settings.APP_VERSION,
        "status": "ONLINE",
        "active_model": state.get("active_model_id"),
        "models_count": len(model_registry),
    }


@app.get("/health")
def health_check():
    """Lightweight liveness check used by hosting providers."""
    return {
        "status": "ONLINE",
        "active_model": state.get("active_model_id"),
    }
