# National Power System Modelling and Simulation Platform

Web-based engineering workspace for modelling, stability analysis, contingency screening, and electricity market simulation of the Nigerian Electricity Supply Industry (NESI) 330 kV and 132 kV transmission networks.

Developed by the **Machine Learning 4 Power Systems (ML4PS)** research group, Department of Electrical & Electronics Engineering, **Federal University of Technology, Minna**.

---

## Architecture

```text
national-power-platform/
├── backend/                     # FastAPI + pandapower simulation engine
│   ├── main.py                  # Application entry point, CORS, and router wiring
│   ├── config.py                # Grid Code constants, conductor catalog, env settings
│   ├── models/
│   │   └── schemas.py           # Pydantic v2 request schemas
│   ├── routers/
│   │   ├── auth.py              # Login and operator access-request endpoints
│   │   ├── models.py            # Upload, payload hydration, activation, listing, deletion
│   │   └── simulations.py       # Power flow, load sharing, cascade, dynamics, multi-machine
│   └── services/
│       ├── parser.py            # MATPOWER (.m) and pandapower (.json) parsers
│       ├── power_flow.py        # Multi-stage AC power flow solver + planning sandbox
│       ├── cascade.py           # Sequential thermal cascade and NetworkX island detection
│       ├── load_sharing.py      # Decentralized governor droop pickup and parallel sharing
│       ├── dynamics.py          # COI frequency response (RK2) and 4-stage UFLS
│       └── multi_machine.py     # Classical multi-machine swing equations & binary-search CCT
│
└── frontend/                    # Next.js (App Router) + React 19 + TypeScript + Tailwind CSS
    └── src/
        ├── app/                 # Route pages (/, /stability, /sld, /dynamics, /market, /reports, /upload, /workforce, /about)
        ├── context/
        │   └── GridContext.tsx  # Model registry sync, solver state, automatic backend hydration
        ├── lib/
        │   ├── apiClient.ts     # Timeout + gateway retry HTTP client
        │   ├── auth.ts          # Session persistence and cross-device access request store
        │   └── supabase.ts      # Null-safe Supabase client
        ├── types/
        │   └── grid.ts          # Shared domain interfaces
        └── components/
            ├── diagram/         # Force-directed interactive SVG Single-Line Diagram
            ├── layout/          # AppShell (AuthContext), Header, Sidebar
            ├── tabs/            # Workspace views and modular stability panels
            └── ui/              # Shared UI primitives
```

---

## Capabilities

- **Steady-State AC Power Flow (`/stability`)**: Multi-stage pandapower solver (`Newton-Raphson flat -> Newton-Raphson auto -> Iwamoto damped -> Fast-Decoupled -> DC approximation fallback`) supporting load scaling, target power factor, slack voltage setpoint, shunt MVAR compensation, thermal ampacity derating, and N-1 branch/bus switching.
- **Element Property Editor & Disruptions**: Per-bus, per-line, per-generator (Hydro intake/head, Gas pressure/ambient temperature, Solar irradiance/cloud cover), and per-load editing with wide-area disruption scenarios.
- **Governor Droop Load Sharing (`P–f`)**: Computes composite grid stiffness, steady-state frequency shift, per-unit participation factors, headroom limits, and parallel corridor current division.
- **Cascading Failure & Islanding**: Sequential thermal overload tripping at configurable relay thresholds with NetworkX connected-component island detection (`SYNCHRONOUS_ONLINE`, `DEFICIT_COLLAPSE`, `BLACKOUT_ISLAND`) and direct SLD visualization.
- **Regional Expansion Planning**: In-memory sandbox to propose substations with tie lines, standalone corridors using standard ACSR conductors (`Bison 330kV`, `Bear 330kV`, `Panther 132kV`, `Bear 132kV`, `Wolf 132kV`), new generators, and node isolation.
- **Interactive Single-Line Diagram (`/sld`)**: Adaptive force-directed SVG topology with draggable substations, parallel circuit separation, live bus telemetry inspector, inline breaker toggling, and PNG/SVG/CSV export.
- **Time-Domain Stability (`/dynamics`)**:
  - Center-of-inertia (COI) frequency swing simulator with governor droop, Power System Stabilizer (PSS), and statutory 4-stage UFLS (`48.80 / 48.60 / 48.40 / 48.20 Hz`).
  - Multi-machine rotor-angle swing solver using reactance-weighted Dijkstra electrical distance from the fault bus and binary-search Critical Clearing Time (CCT).
- **Wholesale Market Clearing (`/market`)**: Merit-order dispatch supporting Uniform SMP and Pay-as-Bid settlement, competitive vs. strategic offers, gas fuel indexing, price caps, and nodal load obligations.
- **Grid Code Compliance Reports (`/reports`)**: Automated bus voltage (`0.95–1.05 pu`) and branch thermal (`<= 100%`) auditing with printable layout and CSV export.
- **Model Ingestion (`/upload`)**: Administrator portal for uploading MATPOWER (`.m`) and pandapower (`.json`) network files with Supabase persistence and local caching.

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 20+ and npm 10+

### 1. Backend

```bash
cd national-power-platform/backend
python -m venv venv

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd national-power-platform/frontend
npm install
cp .env.example .env.local
# Edit .env.local to set NEXT_PUBLIC_API_URL=http://localhost:8000 (and optional Supabase keys)
npm run dev
```

Open `http://localhost:3000`.

---

## Environment Variables

### Backend (`national-power-platform/backend`)

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed browser origins |
| `ADMIN_EMAIL` | No | — | Optional seed administrator email for backend auth fallback |
| `ADMIN_PASSWORD` | No | — | Password paired with `ADMIN_EMAIL` |

### Frontend (`national-power-platform/frontend/.env.local`)

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | No | `https://national-power-backend.onrender.com` | Base URL of the FastAPI backend |
| `NEXT_PUBLIC_SUPABASE_URL` | No | — | Supabase project URL for cross-device model & access storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | — | Supabase anonymous/public API key |
| `NEXT_PUBLIC_SUPABASE_BUCKET` | No | — | Optional Storage bucket name storing raw `.m` case files |
| `NEXT_PUBLIC_ADMIN_EMAIL` | No | — | Comma-separated administrator emails |
| `NEXT_PUBLIC_ADMIN_PASSWORD` | No | — | Optional password for env-configured admin login |

---

## API Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/`, `/health` | Service status and active model summary |
| `GET` | `/api/models` | List models currently loaded in solver memory |
| `POST` | `/api/models/upload` | Parse and activate an uploaded `.m` or `.json` file |
| `POST` | `/api/models/load-payload` | Rehydrate a serialized pandapower JSON payload |
| `POST` | `/api/models/activate/{id}` | Set a loaded model as active |
| `DELETE` | `/api/models/{id}` | Remove a model from solver memory |
| `POST` | `/api/simulations/power-flow` | Run steady-state AC power flow |
| `POST` | `/api/simulations/load-sharing/solve` | Compute governor droop allocations & parallel sharing |
| `POST` | `/api/simulations/cascade` | Run sequential overload cascading & island analysis |
| `POST` | `/api/simulations/dynamics` | Simulate COI frequency response and 4-stage UFLS |
| `POST` | `/api/simulations/multi-machine` | Simulate multi-machine rotor angles and CCT |
| `POST` | `/api/auth/login` | Authenticate an approved operator |
| `POST` | `/api/auth/request-access` | Submit or update an access request |
| `GET` | `/api/admin/requests` | List operator access requests |

---

## Deployment

- **Backend (Render)**: Root directory `national-power-platform/backend`, build command `pip install -r requirements.txt`, start command `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- **Frontend (Vercel)**: Root directory `national-power-platform/frontend`, standard Next.js preset, configure `NEXT_PUBLIC_*` environment variables in project settings.
