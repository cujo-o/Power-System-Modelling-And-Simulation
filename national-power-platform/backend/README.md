# Backend — National Power System Simulation Engine

FastAPI service powering steady-state AC power flow, cascading contingency analysis, governor droop load sharing, COI frequency dynamics, and multi-machine transient stability.

## Module Layout

- `main.py`: FastAPI initialization, CORS middleware, shared in-memory model registry, and router mounting.
- `config.py`: Statutory Nigerian Grid Code operating bounds, standard 330/132 kV ACSR conductor specs (`CONDUCTOR_CATALOG`), and environment configuration.
- `models/schemas.py`: Shared Pydantic v2 input schemas with bounds validation.
- `routers/models.py`: Model upload, payload hydration, activation, listing, and deletion.
- `routers/simulations.py`: Thin HTTP layer delegating simulation calls to `services/`.
- `routers/auth.py`: Access-request store and operator login fallback.
- `services/parser.py`: MATPOWER v2 (`.m`) and pandapower (`.json`) network parsers.
- `services/power_flow.py`: Multi-stage AC power flow solver (`nr` -> `iwamoto` -> `fdpb` -> `rundcpp` fallback) with planning additions and thermal derating.
- `services/cascade.py`: Sequential thermal relay tripping with NetworkX island classification.
- `services/load_sharing.py`: Primary frequency droop allocation and parallel circuit admittance sharing.
- `services/dynamics.py`: RK2-integrated COI swing equation with turbine-governor, PSS washout/lead-lag, and 4-stage UFLS.
- `services/multi_machine.py`: Classical multi-machine swing equations using Dijkstra reactance distance and binary-search CCT.

## Running Locally

```bash
python -m venv venv
.\venv\Scripts\Activate.ps1   # or: source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
