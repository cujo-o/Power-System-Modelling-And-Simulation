from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from services.grid_builder import build_nig_10_bus, build_case330
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

# Shared State
state = {"active_id": "nig-10-bus"}
model_registry = {
    "nig-10-bus": {
        "id": "nig-10-bus",
        "name": "Nig 10-Bus Benchmark Grid",
        "voltage_level": "330kV",
        "domain": "Steady-State & Dynamic",
        "platform": "MATPOWER / PSAT",
        "net": build_nig_10_bus(),
        "buses": 10,
        "branches": 10,
        "total_installed_mw": 2690.0,
        "total_demand_mw": 1386.9,
        "converged": True,
        "is_default": True
    },
    "case-330kv-63": {
        "id": "case-330kv-63",
        "name": "Nigeria 330kV Grid (63-Bus NISO Equivalent)",
        "voltage_level": "330kV",
        "domain": "Steady-State & Dynamic",
        "platform": "DIgSILENT / MATPOWER",
        "net": build_case330(),
        "buses": 63,
        "branches": 29,
        "total_installed_mw": 4850.0,
        "total_demand_mw": 3397.7,
        "converged": True,
        "is_default": False
    }
}

users_db = [
    {
        "id": "usr-1",
        "name": "Opeyemi Ibrahim Abubakar",
        "email": "operator@futminna.edu.ng",
        "institution": "FUT Minna (ML4PS Group)",
        "department": "Electrical & Electronics Engineering",
        "role": "Taskforce Administrator",
        "reason": "National grid simulation lead researcher",
        "referee": "Prof. ML4PS Lead",
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
    },
    {
        "id": "usr-3",
        "name": "Dr. K. A. Bello",
        "email": "kabello@abu.edu.ng",
        "institution": "Ahmadu Bello University",
        "department": "Electrical Engineering",
        "role": "Researcher",
        "reason": "Comparative voltage stability research for North-West region",
        "referee": "Dean of Engineering, ABU",
        "research_tags": "132kV Sub-Transmission, PSS",
        "status": "PENDING",
        "password": None,
        "temp_password": None,
        "registered_at": "2026-09-18 09:30"
    }
]

def get_active():
    entry = model_registry.get(state["active_id"], model_registry["nig-10-bus"])
    return entry["net"], entry["name"]

app.include_router(get_sim_router(model_registry, get_active))
app.include_router(get_model_router(model_registry, state))
app.include_router(get_admin_router(users_db, get_active))

@app.get("/")
def root():
    _, name = get_active()
    return {"status": "online", "active_model": name}