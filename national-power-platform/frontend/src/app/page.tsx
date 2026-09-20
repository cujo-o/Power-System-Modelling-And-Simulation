'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Home,
  Grid,
  TrendingUp,
  DollarSign,
  UploadCloud,
  BarChart3,
  FileText,
  ShieldCheck,
  Play,
  Sliders,
  LogIn,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  FileCode,
  Menu,
  X,
  Trash2,
  Layers,
  MapPin,
  User,
  Activity,
  Check,
  Download,
  Info,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface BusData {
  id: number;
  name: string;
  zone: string;
  x?: number;
  y?: number;
  v_pu: number;
  va_deg: number;
  p_mw: number;
  q_mvar: number;
}

interface LineData {
  id: number;
  name: string;
  from_bus: number;
  to_bus: number;
  in_service: boolean;
  loading_percent: number;
  flow_mw: number;
  losses_mw: number;
}

interface SimResult {
  converged: boolean;
  model_name?: string;
  frequency: number;
  total_gen_mw: number;
  total_load_mw: number;
  total_losses_mw: number;
  buses: BusData[];
  lines: LineData[];
  message?: string;
}

interface DynamicSimResult {
  time: number[];
  frequency: number[];
  rocof: number[];
  pss_output: number[];
  metrics: {
    nadir_hz: number;
    settling_hz: number;
    initial_rocof_hz_per_s: number;
    ufls_triggered: boolean;
  };
}

interface UserAccount {
  id: string;
  name: string;
  email: string;
  institution: string;
  role: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  registered_at: string;
}

interface GeneratorDispatch {
  id: number;
  name: string;
  type: string;
  marginal_cost: number;
  dispatched_mw: number;
  max_mw: number;
  capacity_utilization: number;
  hourly_cost_ngn: number;
}

interface BusLMP {
  id: number;
  name: string;
  zone: string;
  lmp_ngn_per_mwh: number;
}

interface MarketResult {
  converged: boolean;
  market_clearing_price_ngn: number;
  total_dispatched_mw: number;
  total_hourly_cost_ngn: number;
  hydro_share_percent: number;
  thermal_share_percent: number;
  merit_order: GeneratorDispatch[];
  buses_lmp: BusLMP[];
}

interface GridModelMeta {
  id: string;
  name: string;
  voltage_level: string;
  domain: string;
  platform: string;
  buses: number;
  branches: number;
  total_installed_mw: number;
  total_demand_mw: number;
  converged: boolean;
  is_default: boolean;
  is_active: boolean;
}

const NIG10_SCHEMATIC_COORDS: Record<number, { x: number; y: number; isGen?: boolean; isLoad?: boolean }> = {
  0: { x: 120, y: 90, isGen: true },
  1: { x: 270, y: 90, isGen: true },
  2: { x: 470, y: 90, isGen: true },
  3: { x: 650, y: 90, isLoad: true },
  4: { x: 270, y: 240, isLoad: true },
  7: { x: 500, y: 240, isLoad: true },
  5: { x: 120, y: 390, isLoad: true },
  6: { x: 270, y: 390, isGen: true },
  8: { x: 500, y: 390, isGen: true },
  9: { x: 650, y: 390, isGen: true },
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com';

export default function PowerPlatformDashboard() {
  const [activeTab, setActiveTab] = useState('Home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMultiplier, setLoadMultiplier] = useState(1.0);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [results, setResults] = useState<SimResult | null>(null);
  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);
  const [divergedNotice, setDivergedNotice] = useState<string | null>(null);

  // Model Management & Filters
  const [models, setModels] = useState<GridModelMeta[]>([]);
  const [selectedVoltage, setSelectedVoltage] = useState<'ALL' | '330kV' | '132kV'>('330kV');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');

  // Interactive Zoom and Pan State
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Dynamic Simulation Parameters
  const [dynLoading, setDynLoading] = useState(false);
  const [dynDisturbance, setDynDisturbance] = useState(450.0);
  const [enableGovernor, setEnableGovernor] = useState(true);
  const [enablePSS, setEnablePSS] = useState(true);
  const [dynResult, setDynResult] = useState<DynamicSimResult | null>(null);

  // Market Simulation State
  const [gasPriceFactor, setGasPriceFactor] = useState(1.0);
  const [hydroAvailability, setHydroAvailability] = useState(1.0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketResults, setMarketResults] = useState<MarketResult | null>(null);

  // Upload state
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  // Admin User Approvals
  const [users, setUsers] = useState<UserAccount[]>([
    {
      id: 'usr-1',
      name: 'Opeyemi Ibrahim Abubakar',
      email: 'operator@futminna.edu.ng',
      institution: 'FUT Minna (ML4PS Group)',
      role: 'Lead Systems Engineer',
      status: 'APPROVED',
      registered_at: '2026-09-01 10:14',
    },
    {
      id: 'usr-2',
      name: 'Engr. Saliu Adamu',
      email: 'saliu.adamu@niso.gov.ng',
      institution: 'NISO Osogbo',
      role: 'Grid Controller',
      status: 'APPROVED',
      registered_at: '2026-09-04 14:22',
    },
    {
      id: 'usr-3',
      name: 'Dr. K. A. Bello',
      email: 'kabello@abu.edu.ng',
      institution: 'Ahmadu Bello University',
      role: 'Power Systems Researcher',
      status: 'PENDING',
      registered_at: '2026-09-18 09:30',
    },
  ]);

  const navItems = [
    { id: 'Home', label: 'Dashboard', icon: Home },
    { id: 'Grid Models', label: 'Grid Stability Models', icon: Grid },
    { id: 'Dynamics', label: 'Time-Domain & PSS', icon: Activity },
    { id: 'Market Simulations', label: 'Market Simulations', icon: DollarSign },
    { id: 'Data Upload', label: 'Upload & Ingestion', icon: UploadCloud },
    { id: 'Visualization', label: 'Single-Line Diagram', icon: Layers },
    { id: 'Reports', label: 'Reports & Publications', icon: FileText },
    { id: 'Admin Panel', label: 'Admin & Approvals', icon: ShieldCheck },
    { id: 'About Us', label: 'About Us (ML4PS)', icon: Info },
  ];

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/models`);
      if (res.ok) {
        const data = await res.json();
        setModels(data);
      }
    } catch {
      // Fallback
    }
  };

  const runSimulation = async (multiplier = loadMultiplier, outages = trippedLines) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/simulate/power-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          load_multiplier: multiplier,
          tripped_lines: outages,
        }),
      });

      if (res.ok) {
        const data: SimResult = await res.json();
        setResults(data);
        setDivergedNotice(!data.converged ? data.message || 'Grid calculation diverged.' : null);
        if (selectedBus && data.buses) {
          const updated = data.buses.find((b) => b.id === selectedBus.id);
          if (updated) setSelectedBus(updated);
        }
      }
    } catch {
      setDivergedNotice('Simulation backend unreachable.');
    } finally {
      setLoading(false);
    }
  };

  const runDynamicSimulation = async () => {
    setDynLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/simulate/dynamics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disturbance_mw: dynDisturbance,
          inertia_constant_H: 4.5,
          enable_governor: enableGovernor,
          droop_R: 0.05,
          enable_pss: enablePSS,
          pss_gain_K: 25.0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDynResult(data);
      }
    } catch {
      const t = Array.from({ length: 120 }, (_, i) => i * 0.1);
      const f = t.map((time) => {
        if (time < 1.0) return 50.0;
        const decay = Math.exp(-(time - 1.0) * (enablePSS ? 0.7 : 0.2));
        const nadirDelta = (dynDisturbance / 3500) * 7.5;
        return 50.0 - nadirDelta * (1 - decay) * Math.sin((time - 1.0) * 2.2);
      });
      setDynResult({
        time: t,
        frequency: f,
        rocof: t.map((_, i) => (i > 10 ? -0.42 : 0.0)),
        pss_output: t.map(() => 0.04),
        metrics: {
          nadir_hz: Math.min(...f),
          settling_hz: f[f.length - 1],
          initial_rocof_hz_per_s: -0.55,
          ufls_triggered: Math.min(...f) < 48.8,
        },
      });
    } finally {
      setDynLoading(false);
    }
  };

  const runMarketSimulation = async () => {
    setMarketLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/simulate/market-dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          load_multiplier: loadMultiplier,
          gas_price_factor: gasPriceFactor,
          hydro_availability: hydroAvailability,
          tripped_lines: trippedLines,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMarketResults(data);
      }
    } catch {
      // Fallback
    } finally {
      setMarketLoading(false);
    }
  };

  useEffect(() => {
    runSimulation(1.0, []);
    runMarketSimulation();
    runDynamicSimulation();
    fetchModels();
  }, []);

  const toggleLine = (lineId: number) => {
    const nextTripped = trippedLines.includes(lineId)
      ? trippedLines.filter((id) => id !== lineId)
      : [...trippedLines, lineId];
    setTrippedLines(nextTripped);
    runSimulation(loadMultiplier, nextTripped);
  };

  const handleActivateModel = async (modelId: string) => {
    setLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/models/${modelId}/activate`, { method: 'POST' });
      setTrippedLines([]);
      setLoadMultiplier(1.0);
      setSelectedBus(null);
      await fetchModels();
      await runSimulation(1.0, []);
      await runMarketSimulation();
    } catch {
      alert('Could not activate model.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetBaseline = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/grid/reset`, { method: 'POST' });
      setTrippedLines([]);
      setLoadMultiplier(1.0);
      setSelectedBus(null);
      await fetchModels();
      await runSimulation(1.0, []);
      await runMarketSimulation();
    } catch {
      alert('Failed to reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploadLoading(true);
    setUploadNotice(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/upload/model`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload parsing failed');
      }

      const data = await res.json();
      setUploadNotice(`Model '${data.filename}' ingested successfully (${data.platform} / ${data.voltage_level}).`);
      await fetchModels();
      await handleActivateModel(data.model_id);
    } catch (err: any) {
      setUploadNotice(`Upload Error: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  // Zoom and Pan Controls
  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 4.0));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.4));
  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((z) => Math.min(Math.max(z + delta, 0.4), 4.0));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const getCoordinates = (bus: BusData) => {
    if (results?.model_name?.includes('10-Bus') && NIG10_SCHEMATIC_COORDS[bus.id]) {
      return NIG10_SCHEMATIC_COORDS[bus.id];
    }
    if (bus.x !== undefined && bus.y !== undefined) {
      return { x: bus.x, y: bus.y };
    }
    return { x: 250, y: 250 };
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#f7f5f9] font-sans text-slate-800 antialiased overflow-hidden">
      {/* FUT Minna Portal Header */}
      <header className="flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 z-20 select-none shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded bg-[#500b50] text-white hover:bg-[#680f68] transition"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <div>
            <h1 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#500b50]">
              National Power System Modelling & Simulation
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">
              National Power System & Development Taskforce | Machine Learning 4 Power Systems (ML4PS)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#f5eff6] text-[#500b50] border border-[#500b50]/20">
            ML4PS Lab
          </span>
          <span className="rounded bg-[#ffefe5] px-3 py-1 text-xs font-semibold text-[#c2410c] border border-[#ffedd5]">
            Operator Active
          </span>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Signature FUT Minna Purple Sidebar */}
        <aside className="hidden md:flex w-64 bg-[#500b50] text-white p-3 flex-col justify-between shrink-0 select-none shadow-md">
          <div className="space-y-4">
            <div className="flex flex-col items-center pt-2 pb-3 border-b border-[#6f146f]/60 text-center">
              <div className="h-12 w-12 rounded-full bg-white/20 p-1 flex items-center justify-center border border-white/50 mb-1.5">
                <User className="h-7 w-7 text-white" />
              </div>
              <span className="text-xs font-bold leading-tight truncate w-full px-2">
                Opeyemi Ibrahim Abubakar
              </span>
              <span className="text-[10px] text-white/70 font-mono">500L | ML4PS Researcher</span>
              <span className="mt-1.5 inline-block px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-600 text-white">
                Taskforce Administrator
              </span>
            </div>

            <nav className="space-y-1">
              {navItems.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs transition ${
                      isActive
                        ? 'bg-[#15803d] text-white font-bold shadow-xs'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="pt-3 border-t border-[#6f146f]/60">
            <button
              onClick={handleResetBaseline}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 rounded bg-white/10 hover:bg-white/20 py-2 text-xs font-medium text-white transition disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-emerald-300" />
              <span>Reset Grid Baseline</span>
            </button>
          </div>
        </aside>

        {/* Dynamic Workspace Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col justify-between">
          <div>
            {/* TAB 1: DASHBOARD (EXACT 4 WHITE CARDS WITH DARK BORDERS) */}
            {activeTab === 'Home' && (
              <div className="h-full flex items-center justify-center max-w-4xl mx-auto py-10">
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    {
                      title: 'Grid Stability Models',
                      desc: 'Steady-State AC Load Flow, N-1 Line Outage Contingency, and Statutory Voltage Compliance.',
                      icon: TrendingUp,
                      tab: 'Grid Models',
                    },
                    {
                      title: 'Market Simulation Models',
                      desc: 'Merit-Order Economic Dispatch, Locational Marginal Pricing (LMP), and Gas Price Tariffs.',
                      icon: DollarSign,
                      tab: 'Market Simulations',
                    },
                    {
                      title: 'Data Upload & Ingestion',
                      desc: 'Multi-Format Ingestion: MATPOWER (.m), PSAT, DIgSILENT (.raw), ETAP (.xlsx), and PowerWorld.',
                      icon: UploadCloud,
                      tab: 'Data Upload',
                    },
                    {
                      title: 'Reports & Visualization',
                      desc: 'Interactive CAD Single-Line Diagram with Zoom/Pan, Breaker Controls, and CSV/PDF Audits.',
                      icon: BarChart3,
                      tab: 'Visualization',
                    },
                  ].map((card, idx) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={idx}
                        onClick={() => setActiveTab(card.tab)}
                        className="group cursor-pointer rounded-xl border-2 border-slate-800 bg-white p-8 shadow-xs hover:shadow-xl hover:border-[#500b50] transition flex flex-col items-center text-center"
                      >
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 group-hover:scale-110 transition shadow-inner">
                          <Icon className="h-7 w-7 stroke-[2]" />
                        </div>
                        <h3 className="text-sm font-bold tracking-wider text-slate-900 uppercase group-hover:text-[#500b50] transition-colors">
                          {card.title}
                        </h3>
                        <p className="mt-2 text-xs text-slate-600 leading-relaxed max-w-xs font-normal">
                          {card.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: GRID STABILITY MODELS (STEADY-STATE AC LOAD FLOW WORKSPACE) */}
            {activeTab === 'Grid Models' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                {divergedNotice && (
                  <div className="flex items-center gap-2 rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                    <span>{divergedNotice}</span>
                  </div>
                )}

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#500b50]">Steady-State AC Power Flow & Contingency</h2>
                    <p className="text-xs text-slate-500">
                      Active Network: <span className="font-bold text-slate-900">{results?.model_name || 'Nig 10-Bus Benchmark Grid'}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-slate-300 text-xs shadow-2xs">
                      <Sliders className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-slate-600">Demand:</span>
                      <input
                        type="range"
                        min="0.7"
                        max="1.4"
                        step="0.05"
                        value={loadMultiplier}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setLoadMultiplier(val);
                          runSimulation(val, trippedLines);
                        }}
                        className="w-16 sm:w-20 accent-[#500b50] cursor-pointer"
                      />
                      <span className="font-mono font-bold text-[#500b50]">{(loadMultiplier * 100).toFixed(0)}%</span>
                    </div>

                    <button
                      onClick={() => runSimulation()}
                      disabled={loading}
                      className="flex items-center gap-1.5 rounded bg-[#500b50] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs disabled:opacity-50"
                    >
                      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      <span>Solve AC Flow</span>
                    </button>

                    <button
                      onClick={handleResetBaseline}
                      disabled={loading}
                      className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Substation Bus Voltage Profiles Table */}
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
                    <span>Substation Bus Voltage Profiles</span>
                    <span className="font-normal text-[11px] text-white/80">Statutory NERC Band: 0.95 – 1.05 p.u.</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[550px]">
                      <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-semibold">
                        <tr>
                          <th className="p-2.5">ID</th>
                          <th className="p-2.5">Substation Name</th>
                          <th className="p-2.5">Regional Zone</th>
                          <th className="p-2.5">Voltage (|V|)</th>
                          <th className="p-2.5">Angle (°)</th>
                          <th className="p-2.5">Active (MW)</th>
                          <th className="p-2.5">Reactive (MVAR)</th>
                          <th className="p-2.5">Compliance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {results?.buses?.map((bus) => {
                          const isUnder = bus.v_pu < 0.95;
                          const isOver = bus.v_pu > 1.05;
                          return (
                            <tr key={bus.id} className="hover:bg-[#fcfaff]">
                              <td className="p-2.5 font-mono text-slate-400 font-bold">#{bus.id}</td>
                              <td className="p-2.5 font-bold text-slate-900">{bus.name}</td>
                              <td className="p-2.5 text-slate-500">{bus.zone}</td>
                              <td className="p-2.5 font-mono font-bold">
                                <span className={isUnder ? 'text-rose-600' : isOver ? 'text-amber-600' : 'text-emerald-700'}>
                                  {bus.v_pu.toFixed(3)} pu
                                </span>
                              </td>
                              <td className="p-2.5 font-mono">{bus.va_deg.toFixed(2)}°</td>
                              <td className="p-2.5 font-mono">{bus.p_mw}</td>
                              <td className="p-2.5 font-mono">{bus.q_mvar}</td>
                              <td className="p-2.5">
                                {isUnder ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                    Low (Under-voltage)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                    Compliant
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* N-1 Line Contingency & Breaker Controls */}
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-[#500b50] mb-1">N-1 Line Contingency & Breaker Controls</h3>
                  <p className="text-xs text-slate-500 mb-4">Click "Trip Breaker" to isolate a corridor and observe power redistribution across adjacent branches.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    {results?.lines?.map((line) => {
                      const isTripped = trippedLines.includes(line.id);
                      return (
                        <div
                          key={line.id}
                          className={`rounded border p-3 flex flex-col justify-between transition ${
                            isTripped
                              ? 'border-rose-300 bg-rose-50/50'
                              : line.loading_percent > 85
                              ? 'border-amber-300 bg-amber-50/50'
                              : 'border-slate-200 bg-slate-50/60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-slate-800 truncate">{line.name}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              !isTripped ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {!isTripped ? 'Online' : 'Tripped'}
                            </span>
                          </div>

                          <div className="space-y-1 font-mono text-[11px] text-slate-600 mb-3">
                            <div className="flex justify-between">
                              <span>Active Flow:</span>
                              <span className="text-slate-900 font-bold">{line.flow_mw} MW</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Loading:</span>
                              <span className={line.loading_percent > 85 ? 'text-amber-600 font-bold' : ''}>
                                {line.loading_percent}%
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => toggleLine(line.id)}
                            className={`w-full py-1 rounded text-[11px] font-bold transition ${
                              !isTripped
                                ? 'bg-rose-600 text-white hover:bg-rose-700'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            {!isTripped ? 'Trip Breaker (N-1)' : 'Reclose Line'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TIME-DOMAIN SIMULATION & PSS */}
            {activeTab === 'Dynamics' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#500b50]">Time-Domain Dynamics & PSS Analysis</h2>
                    <p className="text-xs text-slate-500">
                      Numerical swing equation integration, turbine governor droop, and Power System Stabilizer (PSS) damping.
                    </p>
                  </div>

                  <button
                    onClick={runDynamicSimulation}
                    disabled={dynLoading}
                    className="flex items-center gap-1.5 rounded bg-[#500b50] px-4 py-2 text-xs font-bold text-white shadow-xs disabled:opacity-50"
                  >
                    {dynLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    <span>Simulate Transient Response</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg border border-slate-200 bg-white">
                    <span className="text-xs font-bold text-slate-700">Trip Disturbance Size</span>
                    <div className="flex items-center justify-between mt-2">
                      <input
                        type="range"
                        min="100"
                        max="1200"
                        step="50"
                        value={dynDisturbance}
                        onChange={(e) => setDynDisturbance(parseFloat(e.target.value))}
                        className="w-2/3 accent-[#500b50]"
                      />
                      <span className="font-mono font-bold text-xs text-[#500b50]">{dynDisturbance} MW</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">Simulates trip of Egbin (1,080 MW) or Kainji</span>
                  </div>

                  <div className="p-4 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Turbine Governor Droop (R = 5%)</span>
                      <span className="text-[10px] text-slate-400">Primary frequency containment action</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableGovernor}
                      onChange={(e) => setEnableGovernor(e.target.checked)}
                      className="h-5 w-5 accent-[#500b50] cursor-pointer"
                    />
                  </div>

                  <div className="p-4 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Power System Stabilizer (PSS)</span>
                      <span className="text-[10px] text-slate-400">Damps rotor oscillation modes</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enablePSS}
                      onChange={(e) => setEnablePSS(e.target.checked)}
                      className="h-5 w-5 accent-[#500b50] cursor-pointer"
                    />
                  </div>
                </div>

                {/* Trajectory Plot Canvas */}
                <div className="rounded-lg border border-slate-800 bg-[#0c1427] p-5 shadow-md text-white">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      System Frequency Trajectory: f(t) [50.00 Hz Base]
                    </span>
                    <div className="flex gap-4 text-xs font-mono">
                      <span>Nadir: <strong className="text-rose-400">{dynResult?.metrics.nadir_hz.toFixed(2)} Hz</strong></span>
                      <span>Initial RoCoF: <strong className="text-amber-400">{dynResult?.metrics.initial_rocof_hz_per_s.toFixed(2)} Hz/s</strong></span>
                      <span>Settling: <strong className="text-cyan-400">{dynResult?.metrics.settling_hz.toFixed(2)} Hz</strong></span>
                    </div>
                  </div>

                  <svg viewBox="0 0 600 200" className="w-full h-56 select-none">
                    <line x1="40" y1="30" x2="580" y2="30" stroke="#1e293b" strokeDasharray="3 3" />
                    <line x1="40" y1="100" x2="580" y2="100" stroke="#334155" strokeWidth="1" />
                    <line x1="40" y1="170" x2="580" y2="170" stroke="#1e293b" strokeDasharray="3 3" />

                    <text x="5" y="35" fill="#64748b" fontSize="9" fontFamily="monospace">50.5Hz</text>
                    <text x="5" y="105" fill="#94a3b8" fontSize="9" fontFamily="monospace">50.0Hz</text>
                    <text x="5" y="175" fill="#64748b" fontSize="9" fontFamily="monospace">49.0Hz</text>

                    <line x1="40" y1="185" x2="580" y2="185" stroke="#e11d48" strokeDasharray="4 4" strokeWidth="1.5" />
                    <text x="440" y="180" fill="#f43f5e" fontSize="8" fontFamily="monospace">NERC UFLS Stage 1: 48.80 Hz</text>

                    {dynResult && (
                      <polyline
                        fill="none"
                        stroke={dynResult.metrics.ufls_triggered ? '#f43f5e' : '#10b981'}
                        strokeWidth="2.5"
                        points={dynResult.time
                          .map((t, idx) => {
                            const x = 40 + (t / 15.0) * 540;
                            const freq = dynResult.frequency[idx];
                            const y = 100 - (freq - 50.0) * 70;
                            return `${x},${Math.max(20, Math.min(195, y))}`;
                          })
                          .join(' ')}
                      />
                    )}
                  </svg>
                </div>
              </div>
            )}

            {/* TAB 4: WHOLESALE MARKET SIMULATIONS */}
            {activeTab === 'Market Simulations' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#500b50]">Wholesale Electricity Market & Economic Dispatch</h2>
                    <p className="text-xs text-slate-500">Merit-order generation scheduling and Locational Marginal Pricing (LMP).</p>
                  </div>

                  <button
                    onClick={runMarketSimulation}
                    disabled={marketLoading}
                    className="flex items-center gap-1.5 rounded bg-[#500b50] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs disabled:opacity-50 w-fit"
                  >
                    {marketLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    <span>Run Economic Dispatch</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-slate-700">Gas Fuel Tariff Factor</span>
                      <span className="text-xs font-mono font-bold text-[#500b50]">{(gasPriceFactor * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.7"
                      max="2.0"
                      step="0.1"
                      value={gasPriceFactor}
                      onChange={(e) => setGasPriceFactor(parseFloat(e.target.value))}
                      className="w-full accent-[#500b50] cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-400 mt-1.5 block">Pipeline gas pricing index</span>
                  </div>

                  <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-slate-700">Hydro Inflow Season</span>
                      <span className="text-xs font-mono font-bold text-emerald-700">{hydroAvailability >= 0.9 ? 'Wet Peak (100%)' : 'Dry Lean (60%)'}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.1"
                      value={hydroAvailability}
                      onChange={(e) => setHydroAvailability(parseFloat(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-400 mt-1.5 block">Kainji, Jebba & Shiroro reservoir water head</span>
                  </div>

                  <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
                    <span className="text-xs font-semibold text-slate-700 mb-1 block">Market Clearing Price</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-mono font-bold text-[#500b50]">
                        ₦{marketResults?.market_clearing_price_ngn?.toLocaleString() || '--'}
                      </span>
                      <span className="text-xs text-slate-500">/ MWh</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Wholesale marginal unit settlement rate</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
                    <span>Merit Order Generation Dispatch Stack</span>
                    <div className="flex items-center gap-3 text-xs font-normal">
                      <span>Hydro: {marketResults?.hydro_share_percent || 0}%</span>
                      <span>Thermal: {marketResults?.thermal_share_percent || 0}%</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[650px]">
                      <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Rank</th>
                          <th className="p-2.5">Generating Station</th>
                          <th className="p-2.5">Primary Fuel</th>
                          <th className="p-2.5">Marginal Cost</th>
                          <th className="p-2.5">Dispatched (MW)</th>
                          <th className="p-2.5">Capacity Max</th>
                          <th className="p-2.5">Hourly Cost (₦)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {marketResults?.merit_order?.map((gen, idx) => (
                          <tr key={gen.name} className="hover:bg-[#fcfaff]">
                            <td className="p-2.5 font-mono text-slate-400 font-bold">#{idx + 1}</td>
                            <td className="p-2.5 font-bold text-slate-900">{gen.name}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                gen.type === 'Hydro' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {gen.type}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono font-bold text-[#500b50]">₦{gen.marginal_cost.toLocaleString()}</td>
                            <td className="p-2.5 font-mono font-bold text-slate-900">{gen.dispatched_mw} MW</td>
                            <td className="p-2.5 font-mono text-slate-500">{gen.max_mw} MW</td>
                            <td className="p-2.5 font-mono text-slate-900">₦{gen.hourly_cost_ngn.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: UPLOAD & INGESTION */}
            {activeTab === 'Data Upload' && (
              <div className="space-y-6 max-w-5xl mx-auto">
                {uploadNotice && (
                  <div className="flex items-center gap-2 rounded border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-[#500b50]" />
                    <span>{uploadNotice}</span>
                  </div>
                )}

                <div>
                  <h2 className="text-lg font-bold text-[#500b50]">Multi-Format Grid Model Ingestion</h2>
                  <p className="text-xs text-slate-500">
                    Supports MATPOWER (.m), PSAT, DIgSILENT PowerFactory (.raw/.xml), ETAP (.xlsx), and PowerWorld (.aux).
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
                  <div className="border-2 border-dashed border-slate-300 hover:border-[#500b50] rounded-lg p-8 text-center transition flex flex-col items-center justify-center bg-slate-50">
                    <UploadCloud className="h-10 w-10 text-[#500b50] mb-2.5" />
                    <p className="text-xs sm:text-sm font-bold text-slate-800">
                      Select or drop grid case files
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Multi-format ingestion pipeline for 330 kV bulk and 132 kV sub-transmission cases
                    </p>

                    <input
                      type="file"
                      id="fileUploadInput"
                      accept=".m,.json,.xlsx,.xls,.raw,.aux"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <label
                      htmlFor="fileUploadInput"
                      className={`mt-4 cursor-pointer rounded bg-[#500b50] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#6a106a] ${
                        uploadLoading ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      {uploadLoading ? 'Parsing Simulation File...' : 'Choose Case File'}
                    </label>
                  </div>
                </div>

                {/* Model Repository Table */}
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
                    <span>Registered Simulation Models</span>
                    <span className="font-mono text-emerald-300">{models.length} Models Available</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[650px]">
                      <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-semibold">
                        <tr>
                          <th className="p-2.5">Active</th>
                          <th className="p-2.5">Model Name</th>
                          <th className="p-2.5">Voltage</th>
                          <th className="p-2.5">Platform Format</th>
                          <th className="p-2.5">Buses</th>
                          <th className="p-2.5">Branches</th>
                          <th className="p-2.5">Capacity</th>
                          <th className="p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {models.map((m) => (
                          <tr key={m.id} className={`hover:bg-[#fcfaff] ${m.is_active ? 'bg-emerald-50/50' : ''}`}>
                            <td className="p-2.5">
                              {m.is_active ? (
                                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600"></span>
                              ) : (
                                <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300"></span>
                              )}
                            </td>
                            <td className="p-2.5 font-bold text-slate-900">
                              <div className="flex items-center gap-2">
                                <FileCode className="h-4 w-4 text-[#500b50] shrink-0" />
                                <span>{m.name}</span>
                                {m.is_default && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                                    Default
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-2.5 font-mono text-slate-600">{m.voltage_level}</td>
                            <td className="p-2.5 font-mono text-slate-500">{m.platform}</td>
                            <td className="p-2.5 font-mono">{m.buses}</td>
                            <td className="p-2.5 font-mono">{m.branches}</td>
                            <td className="p-2.5 font-mono font-bold text-[#500b50]">{m.total_installed_mw} MW</td>
                            <td className="p-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {!m.is_active ? (
                                  <button
                                    onClick={() => handleActivateModel(m.id)}
                                    className="rounded bg-[#500b50] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#6a106a] transition"
                                  >
                                    Activate
                                  </button>
                                ) : (
                                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                    Active
                                  </span>
                                )}
                                {!m.is_default && (
                                  <button
                                    onClick={async () => {
                                      await fetch(`${API_BASE_URL}/api/models/${m.id}`, { method: 'DELETE' });
                                      fetchModels();
                                    }}
                                    className="p-1 rounded text-slate-400 hover:text-rose-600"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: CAD SINGLE-LINE DIAGRAM (WITH FULL PAN, ZOOM, BREAKER CONTROLS & INSPECTOR) */}
            {activeTab === 'Visualization' && (
              <div className="space-y-4 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#500b50]">Interactive CAD Single-Line Diagram</h2>
                    <p className="text-xs text-slate-500">
                      Use mouse wheel to zoom, click and drag to pan across substations, and toggle breaker cubicles (N-1).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Zoom & Pan Toolbar */}
                    <div className="flex items-center rounded border border-slate-300 bg-white p-0.5 text-xs shadow-xs">
                      <button
                        onClick={handleZoomIn}
                        className="p-1.5 text-slate-700 hover:bg-slate-100 rounded"
                        title="Zoom In (+)"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <span className="px-2 font-mono text-[11px] font-bold text-slate-600">
                        {Math.round(zoomLevel * 100)}%
                      </span>
                      <button
                        onClick={handleZoomOut}
                        className="p-1.5 text-slate-700 hover:bg-slate-100 rounded"
                        title="Zoom Out (-)"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleResetZoom}
                        className="p-1.5 text-slate-700 hover:bg-slate-100 rounded border-l ml-0.5"
                        title="Reset View"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={handleResetBaseline}
                      disabled={loading}
                      className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                  {/* Zoomable & Pannable Vector Canvas */}
                  <div
                    className="lg:col-span-2 rounded-lg border border-slate-800 bg-[#0c1427] p-4 relative overflow-hidden flex flex-col items-center justify-center shadow-md cursor-grab active:cursor-grabbing"
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <svg viewBox="0 0 760 480" className="w-full h-[400px] sm:h-[460px] select-none">
                      <defs>
                        <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="3" result="glow" />
                          <feMerge>
                            <feMergeNode in="glow" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>

                      <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
                        {/* Dynamic Lines */}
                        {results?.lines.map((line) => {
                          const fromBus = results.buses.find((b) => b.id === line.from_bus);
                          const toBus = results.buses.find((b) => b.id === line.to_bus);
                          if (!fromBus || !toBus) return null;

                          const cFrom = getCoordinates(fromBus);
                          const cTo = getCoordinates(toBus);
                          const isTripped = trippedLines.includes(line.id);
                          const midX = (cFrom.x + cTo.x) / 2;
                          const midY = (cFrom.y + cTo.y) / 2;

                          const strokeColor = isTripped
                            ? '#f43f5e'
                            : line.loading_percent > 85
                            ? '#fbbf24'
                            : '#10b981';

                          return (
                            <g key={line.id} className="cursor-pointer group" onClick={() => toggleLine(line.id)}>
                              <line
                                x1={cFrom.x}
                                y1={cFrom.y}
                                x2={cTo.x}
                                y2={cTo.y}
                                stroke={strokeColor}
                                strokeWidth={2.5}
                                strokeDasharray={isTripped ? '6 6' : 'none'}
                                className="transition-colors group-hover:stroke-white"
                              />

                              {/* Breaker Box */}
                              <g
                                transform={`translate(${midX}, ${midY})`}
                                className="transition-transform group-hover:scale-125"
                              >
                                <rect
                                  x="-6.5"
                                  y="-6.5"
                                  width="13"
                                  height="13"
                                  rx="2"
                                  fill={isTripped ? '#4c0519' : '#064e3b'}
                                  stroke={isTripped ? '#f43f5e' : '#10b981'}
                                  strokeWidth="1.5"
                                />
                              </g>

                              {!isTripped && (
                                <g transform={`translate(${midX}, ${midY - 14})`}>
                                  <rect
                                    x="-24"
                                    y="-8"
                                    width="48"
                                    height="15"
                                    rx="3"
                                    fill="#0a0f1d"
                                    stroke="#334155"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x="0"
                                    y="3.5"
                                    fill="#f8fafc"
                                    fontSize="8.5"
                                    fontFamily="monospace"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                  >
                                    {line.flow_mw} MW
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        })}

                        {/* Substation Busbars */}
                        {results?.buses.map((bus) => {
                          const isSelected = selectedBus?.id === bus.id;
                          const isUnder = bus.v_pu < 0.95;
                          const isOver = bus.v_pu > 1.05;
                          const nodeColor = isUnder ? '#f43f5e' : isOver ? '#fbbf24' : '#10b981';
                          const coords = getCoordinates(bus);

                          return (
                            <g
                              key={bus.id}
                              transform={`translate(${coords.x}, ${coords.y})`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBus(bus);
                              }}
                              className="cursor-pointer group"
                            >
                              <rect
                                x="-32"
                                y="-4.5"
                                width="64"
                                height="9"
                                rx="2"
                                fill={isSelected ? '#38bdf8' : nodeColor}
                                stroke="#0a0f1d"
                                strokeWidth="1.5"
                                filter={isSelected ? 'url(#node-glow)' : undefined}
                                className="transition-all group-hover:brightness-125"
                              />

                              <text
                                x="0"
                                y="22"
                                fill="#f8fafc"
                                fontSize="9"
                                fontFamily="monospace"
                                fontWeight="bold"
                                textAnchor="middle"
                              >
                                {bus.name.split(' ')[0]}
                              </text>
                              <text
                                x="0"
                                y="32"
                                fill={nodeColor}
                                fontSize="8"
                                fontFamily="monospace"
                                textAnchor="middle"
                              >
                                {bus.v_pu.toFixed(2)} pu
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    </svg>
                  </div>

                  {/* Substation Inspector Side Panel */}
                  <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between shadow-xs">
                    <div>
                      <h3 className="text-sm font-bold text-[#500b50] mb-3 flex items-center gap-2">
                        <Zap className="h-4 w-4" /> Substation Inspector
                      </h3>
                      {selectedBus ? (
                        <div className="space-y-3 text-xs">
                          <div className="p-3 rounded bg-slate-50 border border-slate-200">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Substation</span>
                            <span className="font-bold text-slate-900 text-sm">{selectedBus.name}</span>
                            <span className="block text-[11px] text-slate-500 mt-0.5">{selectedBus.zone} Regional Zone</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 font-mono">
                            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                              <span className="text-slate-400 block text-[10px]">Voltage (|V|)</span>
                              <span className={`font-bold ${selectedBus.v_pu < 0.95 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                {selectedBus.v_pu} pu
                              </span>
                            </div>
                            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                              <span className="text-slate-400 block text-[10px]">Angle (°)</span>
                              <span className="font-bold text-slate-800">{selectedBus.va_deg}°</span>
                            </div>
                            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                              <span className="text-slate-400 block text-[10px]">Active</span>
                              <span className="font-bold text-[#500b50]">{selectedBus.p_mw} MW</span>
                            </div>
                            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                              <span className="text-slate-400 block text-[10px]">Reactive</span>
                              <span className="font-bold text-amber-700">{selectedBus.q_mvar} MVAR</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="h-40 flex items-center justify-center text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded p-4">
                          Click on any busbar in the Single-Line Diagram to inspect live bus telemetry.
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
                      <span>Click breaker boxes to trip (N-1)</span>
                      <span className="text-[#500b50] font-bold">● Active Telemetry</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: REPORTS & AUDIT PDF */}
            {activeTab === 'Reports' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#500b50]">National Grid Contingency Audit Report</h2>
                    <p className="text-xs text-slate-500">Grid Code compliance audit against statutory boundaries (0.95 ≤ |V| ≤ 1.05 p.u., loading ≤ 85%).</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`${API_BASE_URL}/api/reports/export-csv`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                    >
                      <FileText className="h-3.5 w-3.5 text-[#500b50]" />
                      <span>Download CSV</span>
                    </a>

                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 rounded bg-[#500b50] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span>Print / Save PDF</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
                    <span className="text-slate-400 block mb-1">Total System Infeed</span>
                    <span className="text-xl font-mono font-bold text-[#500b50]">
                      {results?.total_gen_mw ? `${results.total_gen_mw.toLocaleString()} MW` : '--'}
                    </span>
                  </div>

                  <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
                    <span className="text-slate-400 block mb-1">Total System Losses</span>
                    <span className="text-xl font-mono font-bold text-rose-600">
                      {results?.total_losses_mw ? `${results.total_losses_mw} MW` : '--'}
                    </span>
                  </div>

                  <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
                    <span className="text-slate-400 block mb-1">Voltage Violations</span>
                    <span className="text-xl font-mono font-bold text-amber-600">
                      {results?.buses ? results.buses.filter((b) => b.v_pu < 0.95 || b.v_pu > 1.05).length : 0} Nodes
                    </span>
                  </div>

                  <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
                    <span className="text-slate-400 block mb-1">Critical Lines (&gt;80%)</span>
                    <span className="text-xl font-mono font-bold text-emerald-700">
                      {results?.lines ? results.lines.filter((l) => l.loading_percent > 80).length : 0} Corridors
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 8: ADMIN & USER APPROVAL WORKFLOW */}
            {activeTab === 'Admin Panel' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-[#500b50]">Taskforce Administrator & Access Requests</h2>
                    <p className="text-xs text-slate-500">Review, verify, and approve system operators and researchers.</p>
                  </div>
                  <span className="px-3 py-1 rounded bg-[#500b50] text-white text-xs font-bold">
                    Admin Privilege: Active
                  </span>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <div className="bg-[#500b50] text-white px-4 py-2.5 text-xs font-bold">
                    Registered Access Requests
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 border-b">
                      <tr>
                        <th className="p-3">Researcher / Operator</th>
                        <th className="p-3">Institution</th>
                        <th className="p-3">Designation</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Approval Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <span className="font-bold text-slate-900 block">{u.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{u.email}</span>
                          </td>
                          <td className="p-3">{u.institution}</td>
                          <td className="p-3 font-medium">{u.role}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                u.status === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : u.status === 'PENDING'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {u.status === 'PENDING' ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() =>
                                    setUsers(users.map((item) => (item.id === u.id ? { ...item, status: 'APPROVED' } : item)))
                                  }
                                  className="flex items-center gap-1 bg-emerald-600 text-white px-2.5 py-1 rounded font-bold hover:bg-emerald-700"
                                >
                                  <Check className="h-3 w-3" /> Approve
                                </button>
                                <button
                                  onClick={() =>
                                    setUsers(users.map((item) => (item.id === u.id ? { ...item, status: 'REJECTED' } : item)))
                                  }
                                  className="flex items-center gap-1 bg-rose-600 text-white px-2.5 py-1 rounded font-bold hover:bg-rose-700"
                                >
                                  <X className="h-3 w-3" /> Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">Verified</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 9: ABOUT US (MACHINE LEARNING 4 POWER SYSTEMS - ML4PS) */}
            {activeTab === 'About Us' && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-3 border-b pb-4">
                    <div className="h-12 w-12 rounded-lg bg-[#500b50] text-white flex items-center justify-center font-bold text-lg">
                      ML4PS
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#500b50]">Machine Learning 4 Power Systems (ML4PS) Laboratory</h2>
                      <p className="text-xs text-slate-500">
                        Department of Electrical & Electronics Engineering | Federal University of Technology, Minna
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs leading-relaxed text-slate-700">
                    <p>
                      <strong>Platform Ownership:</strong> The National Power System Modelling & Simulation Platform is developed and managed by the <strong>Machine Learning 4 Power Systems (ML4PS)</strong> research group under the auspices of the <strong>National Power System & Development Taskforce</strong>.
                    </p>
                    <p>
                      <strong>Mission:</strong> To deliver an open-access, indigenous, IEEE- and NERC-compliant computational suite for the Nigerian Electricity Supply Industry (NESI). It empowers researchers and transmission operators to perform steady-state AC load flow, transient dynamic frequency studies, Power System Stabilizer (PSS) tuning, and locational marginal pricing without proprietary software lock-in.
                    </p>
                    <p>
                      <strong>Sponsorship:</strong> Funded under the National Research Fund (NRF) initiative in technical collaboration with the National Independent System Operator (NISO) and the Transmission Company of Nigeria (TCN).
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* FUT Minna Signature Footer */}
          <footer className="mt-8 pt-3 border-t border-slate-200 text-center text-[11px] text-slate-500">
            Copyright 2026 National Power System Modelling & Simulation Platform | Machine Learning 4 Power Systems (ML4PS) | FUT Minna
          </footer>
        </main>
      </div>
    </div>
  );
}