from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.models import get_model_router
from routers.simulations import get_sim_router
from routers.auth import get_auth_router

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