from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.simulations import get_sim_router
from routers.models import get_model_router
from routers.admin import get_admin_router

app = FastAPI(title="National Power System Modelling & Simulation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared in-memory active cache
state = {"active_id": None}
model_registry = {}

users_db = [
    {
        "id": "usr-1",
        "name": "Opeyemi Ibrahim Abubakar",
        "email": "operator@futminna.edu.ng",
        "institution": "FUT Minna (ML4PS Group)",
        "department": "Electrical & Electronics Engineering",
        "role": "Taskforce Administrator",
        "reason": "Lead researcher",
        "referee": "Prof. Lead",
        "research_tags": "330kV, UFLS, Dynamics",
        "status": "APPROVED",
        "password": "ML4PS-ADMIN",
        "temp_password": "ML4PS-ADMIN",
        "registered_at": "2026-09-01 10:14"
    },
    {
        "id": "usr-2",
        "name": "Engr. Saliu Adamu",
        "email": "saliu.adamu@niso.gov.ng",
        "institution": "National Independent System Operator (NISO)",
        "department": "Grid Operations Control",
        "role": "Grid Controller",
        "reason": "NISO regional dispatch oversight",
        "referee": "TCN NCC Osogbo",
        "research_tags": "Contingency, SCADA, Real-Time",
        "status": "APPROVED",
        "password": "ML4PS-NISO",
        "temp_password": "ML4PS-NISO",
        "registered_at": "2026-09-04 14:22"
    }
]

def get_active():
    active_id = state["active_id"]
    if active_id and active_id in model_registry:
        entry = model_registry[active_id]
        return entry["net"], entry["name"]
    return None, "No Active Model (Upload a case file)"

app.include_router(get_sim_router(model_registry, get_active))
app.include_router(get_model_router(model_registry, state))
app.include_router(get_admin_router(users_db, get_active))

@app.get("/")
def root():
    _, name = get_active()
    return {"status": "online", "active_model": name}