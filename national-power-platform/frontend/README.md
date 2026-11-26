# Frontend — National Power System Simulation Platform

Next.js (App Router) + React 19 + TypeScript interface for the ML4PS National Power System Modelling and Simulation Platform.

## Scripts

```bash
npm run dev     # Start local development server on http://localhost:3000
npm run lint    # Run ESLint checks
npm run build   # Production build & TypeScript verification
npm run start   # Serve production build
```

## Key Modules

- `src/context/GridContext.tsx`: Synchronizes registered models across Supabase, the FastAPI solver, and localStorage; manages live power flow state and automatic backend cold-start hydration (`callWithHydration`).
- `src/lib/apiClient.ts`: Centralized backend fetch wrapper with timeout and gateway retry handling.
- `src/lib/auth.ts`: Session storage and cross-device access request helpers.
- `src/lib/supabase.ts`: Null-safe Supabase client initialization.
- `src/components/layout/AppShell.tsx`: Authentication gate, `AuthContext` provider (`useAuth`), and workspace shell.
- `src/components/diagram/SingleLineDiagram.tsx`: Force-directed interactive SVG diagram with live telemetry inspector and PNG/SVG/CSV exports.
- `src/components/tabs/GridStabilityTab.tsx`: Operational deck and sub-modules (`ModelSelector`, `ElementPropertyModal`, `LoadSharingPanel`, `CascadePanel`, `RegionalPlanningPanel`).
- `src/components/tabs/DynamicsTab.tsx`: COI frequency response and multi-machine rotor angle / CCT plots.
- `src/components/tabs/MarketTab.tsx`: Merit-order wholesale dispatch and nodal load settlement.
- `src/components/tabs/ReportsTab.tsx`: Statutory voltage and thermal compliance report with CSV and print support.
- `src/components/tabs/UploadTab.tsx`: MATPOWER `.m` and pandapower `.json` ingestion portal.
- `src/components/tabs/AdminTab.tsx`: ML4PS workforce directory and administrator account approval queue.
