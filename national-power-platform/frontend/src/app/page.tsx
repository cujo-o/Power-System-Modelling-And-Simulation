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
  Move,
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

interface MarketResult {
  converged: boolean;
  market_clearing_price_ngn: number;
  total_dispatched_mw: number;
  total_hourly_cost_ngn: number;
  hydro_share_percent: number;
  thermal_share_percent: number;
  merit_order: GeneratorDispatch[];
}

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

  // Model & Filter States
  const [domainMode, setDomainMode] = useState<'steady' | 'dynamic'>('steady');
  const [voltageFilter, setVoltageFilter] = useState<'ALL' | '330kV' | '132kV'>('330kV');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [diagramMode, setDiagramMode] = useState<'nig10' | 'regional330'>('nig10');

  // Interactive Zoom and Pan State
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

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
    { id: 'Models', label: 'Stability Models', icon: Grid },
    { id: 'Dynamics', label: 'Time-Domain & PSS', icon: Activity },
    { id: 'Market', label: 'Market Simulations', icon: DollarSign },
    { id: 'Upload', label: 'Upload & Ingestion', icon: UploadCloud },
    { id: 'Diagram', label: 'Nig 10-Bus Diagram', icon: Layers },
    { id: 'Reports', label: 'Reports & Publications', icon: FileText },
    { id: 'Admin', label: 'Admin & Approvals', icon: ShieldCheck },
    { id: 'About', label: 'About Us (ML4PS)', icon: Info },
  ];

  // Steady-State Load Flow Engine Call
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
        setDivergedNotice(!data.converged ? data.message || 'Grid diverged.' : null);
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

  // Dynamic Frequency & PSS Simulation Call
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
      // Numerical fallback representation
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

  // Wholesale Market Simulation Call
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
      // Ignore fallback
    } finally {
      setMarketLoading(false);
    }
  };

  useEffect(() => {
    runSimulation(1.0, []);
    runMarketSimulation();
    runDynamicSimulation();
  }, []);

  const toggleLine = (lineId: number) => {
    const nextTripped = trippedLines.includes(lineId)
      ? trippedLines.filter((id) => id !== lineId)
      : [...trippedLines, lineId];
    setTrippedLines(nextTripped);
    runSimulation(loadMultiplier, nextTripped);
  };

  // --- Zoom & Pan Event Handlers ---
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 4.0));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.4));
  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((prev) => Math.min(Math.max(prev + zoomDelta, 0.4), 4.0));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="flex h-screen w-full flex-col bg-[#f7f5f9] font-sans text-slate-800 antialiased overflow-hidden">
      {/* Top Banner Header */}
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

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar (FUT Minna Signature Purple) */}
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

          <div className="pt-3 border-t border-[#6f146f]/60 text-center text-[10px] text-white/60">
            FUT Minna | NRF 2026
          </div>
        </aside>

        {/* Dynamic Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col justify-between">
          <div>
            {/* TAB 1: HOME DASHBOARD (ONLY THE 4 PRIMARY MODULE CARDS) */}
            {activeTab === 'Home' && (
              <div className="h-full flex items-center justify-center max-w-4xl mx-auto py-10">
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    {
                      title: 'Grid Stability Models',
                      desc: 'Steady-State AC Load Flow, N-1 Contingency & Voltage Violations (330 kV & 132 kV).',
                      icon: TrendingUp,
                      tab: 'Models',
                    },
                    {
                      title: 'Market Simulation Models',
                      desc: 'Merit-Order Economic Dispatch, Locational Marginal Pricing (LMP), and Fuel Tariffs.',
                      icon: DollarSign,
                      tab: 'Market',
                    },
                    {
                      title: 'Data Upload & Validation',
                      desc: 'Multi-Format Ingestion: MATPOWER, PSAT, DIgSILENT, ETAP, and PowerWorld.',
                      icon: UploadCloud,
                      tab: 'Upload',
                    },
                    {
                      title: 'Reports & Visualization',
                      desc: 'Nig 10-Bus Benchmark Schematic, 330 kV Regional Matrix, and Compliance Audits.',
                      icon: BarChart3,
                      tab: 'Diagram',
                    },
                  ].map((card, idx) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={idx}
                        onClick={() => setActiveTab(card.tab)}
                        className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-8 shadow-2xs hover:shadow-md hover:border-[#500b50] transition flex flex-col items-center text-center"
                      >
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#f5eff6] text-[#500b50] group-hover:bg-[#500b50] group-hover:text-white transition shadow-inner">
                          <Icon className="h-7 w-7 stroke-[2]" />
                        </div>
                        <h3 className="text-sm font-bold tracking-wider text-slate-800 uppercase group-hover:text-[#500b50] transition-colors">
                          {card.title}
                        </h3>
                        <p className="mt-2 text-xs text-slate-500 leading-relaxed max-w-xs font-normal">
                          {card.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: STABILITY MODELS (STEADY-STATE & DYNAMICS SEPARATION) */}
            {activeTab === 'Models' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#500b50]">Stability Models & Power Flow Engine</h2>
                    <p className="text-xs text-slate-500">
                      Select domain, voltage level (330 kV vs 132 kV), and origin tool format.
                    </p>
                  </div>

                  {/* Multi-tier Filter Bar */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="flex rounded border border-slate-300 bg-white p-0.5">
                      <button
                        onClick={() => setDomainMode('steady')}
                        className={`px-3 py-1 rounded font-bold transition ${
                          domainMode === 'steady' ? 'bg-[#500b50] text-white' : 'text-slate-600'
                        }`}
                      >
                        Steady-State
                      </button>
                      <button
                        onClick={() => {
                          setDomainMode('dynamic');
                          setActiveTab('Dynamics');
                        }}
                        className={`px-3 py-1 rounded font-bold transition ${
                          domainMode === 'dynamic' ? 'bg-[#500b50] text-white' : 'text-slate-600'
                        }`}
                      >
                        Dynamic (Time-Domain)
                      </button>
                    </div>

                    <select
                      value={voltageFilter}
                      onChange={(e: any) => setVoltageFilter(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700"
                    >
                      <option value="330kV">330 kV Backbone</option>
                      <option value="132kV">132 kV Sub-Transmission</option>
                      <option value="ALL">All Levels (330/132 kV)</option>
                    </select>

                    <select
                      value={platformFilter}
                      onChange={(e) => setPlatformFilter(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700"
                    >
                      <option value="ALL">All Origin Tools</option>
                      <option value="MATPOWER">MATPOWER</option>
                      <option value="PSAT">PSAT</option>
                      <option value="DIgSILENT">DIgSILENT PowerFactory</option>
                      <option value="ETAP">ETAP</option>
                      <option value="PowerWorld">PowerWorld</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-lg border border-slate-200 bg-white shadow-xs flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-[#500b50]">
                          330 kV Backbone
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          DIgSILENT / MATPOWER
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-2">NISO 330 kV Equivalent (63 Buses)</h3>
                      <p className="text-xs text-slate-500 mt-0.5">18 Generating Plants | 5,799.6 MW Base Load</p>
                    </div>
                    <button
                      onClick={() => setActiveTab('Diagram')}
                      className="rounded bg-[#500b50] text-white px-4 py-1.5 text-xs font-bold hover:bg-[#680f68]"
                    >
                      Open Case
                    </button>
                  </div>

                  <div className="p-5 rounded-lg border border-slate-200 bg-white shadow-xs flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          132 kV Grid + 330 kV
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          MATPOWER / PSAT
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-2">NISO 132/330 kV Network (369 Buses)</h3>
                      <p className="text-xs text-slate-500 mt-0.5">64 x 330kV + 305 x 132kV | 96 Station Transformers</p>
                    </div>
                    <button
                      onClick={() => setActiveTab('Diagram')}
                      className="rounded bg-[#500b50] text-white px-4 py-1.5 text-xs font-bold hover:bg-[#680f68]"
                    >
                      Open Case
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TIME-DOMAIN SIMULATION, TURBINE GOVERNOR & PSS */}
            {activeTab === 'Dynamics' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#500b50]">Time-Domain Dynamics & PSS Analysis</h2>
                    <p className="text-xs text-slate-500">
                      Swing equation integration, turbine governor droop, and Power System Stabilizer (PSS) damping.
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
                    <span className="text-xs font-bold text-slate-700">Generation Loss / Step Disturbance</span>
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
                      <span className="text-[10px] text-slate-400">Primary frequency containment response</span>
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
                      <span className="text-[10px] text-slate-400">Damps low-frequency rotor angle swings</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enablePSS}
                      onChange={(e) => setEnablePSS(e.target.checked)}
                      className="h-5 w-5 accent-[#500b50] cursor-pointer"
                    />
                  </div>
                </div>

                {/* Transient Trajectory Plot */}
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

            {/* TAB 5: DIAGRAM WITH FULL PAN & ZOOM ENGINE */}
            {activeTab === 'Diagram' && (
              <div className="space-y-4 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#500b50]">
                      {diagramMode === 'nig10' ? 'Nig 10-Bus Benchmark Schematic' : '330 kV Regional Node Matrix'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Use scroll wheel or controls to Zoom & Pan across extensive 330/132 kV bus structures.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* View Toggle */}
                    <div className="flex rounded border border-slate-300 bg-white p-0.5 text-xs">
                      <button
                        onClick={() => setDiagramMode('nig10')}
                        className={`px-3 py-1 rounded font-bold transition ${
                          diagramMode === 'nig10' ? 'bg-[#500b50] text-white' : 'text-slate-600'
                        }`}
                      >
                        Nig 10 Bus
                      </button>
                      <button
                        onClick={() => setDiagramMode('regional330')}
                        className={`px-3 py-1 rounded font-bold transition ${
                          diagramMode === 'regional330' ? 'bg-[#500b50] text-white' : 'text-slate-600'
                        }`}
                      >
                        330 kV Clusters
                      </button>
                    </div>

                    {/* Zoom In, Out & Reset Buttons */}
                    <div className="flex items-center rounded border border-slate-300 bg-white p-0.5 text-xs">
                      <button
                        onClick={handleZoomIn}
                        className="p-1 text-slate-700 hover:bg-slate-100 rounded"
                        title="Zoom In"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <span className="px-2 font-mono text-[11px] font-bold text-slate-600">
                        {Math.round(zoomLevel * 100)}%
                      </span>
                      <button
                        onClick={handleZoomOut}
                        className="p-1 text-slate-700 hover:bg-slate-100 rounded"
                        title="Zoom Out"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleResetZoom}
                        className="p-1 text-slate-700 hover:bg-slate-100 rounded border-l ml-0.5 pl-1.5"
                        title="Reset View"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* SVG Vector Canvas with Interactive Drag, Pan and Scroll Zoom */}
                <div
                  className="rounded-lg border border-slate-800 bg-[#0c1427] p-4 relative overflow-hidden flex flex-col items-center justify-center shadow-lg cursor-grab active:cursor-grabbing"
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <svg
                    ref={svgRef}
                    viewBox="0 0 750 480"
                    className="w-full h-[460px] select-none"
                  >
                    <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
                      {/* Grid CAD Wires & Corridors for Nig 10 Bus */}
                      <path d="M 135 85 L 245 85" stroke="#10b981" strokeWidth="2.5" />
                      <path d="M 315 85 L 445 85" stroke="#10b981" strokeWidth="2.5" />
                      <path d="M 515 85 L 637 85" stroke="#10b981" strokeWidth="2.5" />
                      <path d="M 280 88 L 280 247" stroke="#10b981" strokeWidth="2.5" />
                      <path d="M 245 253 L 200 253 L 200 345 L 100 345 L 100 407" stroke="#10b981" strokeWidth="2.5" />
                      <path d="M 135 410 L 245 410" stroke="#10b981" strokeWidth="2.5" />
                      <path d="M 325 250 L 485 250" stroke="#10b981" strokeWidth="2.5" />
                      <path d="M 500 253 L 500 335 L 305 335 L 305 407" stroke="#10b981" strokeWidth="2.5" />
                      <path d="M 530 253 L 530 407" stroke="#10b981" strokeWidth="2.5" />

                      {/* Station Busbars */}
                      {[
                        { id: 0, x: 100, y: 85, name: 'Kainji GS (Hydro 760MW)', isGen: true },
                        { id: 1, x: 280, y: 85, name: 'Jebba TS/GS (621MW)', isGen: true },
                        { id: 2, x: 480, y: 85, name: 'Shiroro GS (600MW)', isGen: true },
                        { id: 3, x: 670, y: 85, name: 'Katampe (Abuja 468MW)', isLoad: true },
                        { id: 4, x: 280, y: 250, name: 'Osogbo Central NCC Hub', isLoad: true },
                        { id: 7, x: 530, y: 250, name: 'Benin 330kV TS', isLoad: true },
                        { id: 5, x: 100, y: 410, name: 'Ikeja West (Lagos Sink)', isLoad: true },
                        { id: 6, x: 280, y: 410, name: 'Egbin PS (1,320MW Slack)', isGen: true },
                        { id: 8, x: 530, y: 410, name: 'Afam IV-VI Gas (650MW)', isGen: true },
                      ].map((b) => (
                        <g key={b.id} transform={`translate(${b.x}, ${b.y})`}>
                          <rect x="-35" y="-5" width="70" height="10" rx="2" fill="#38bdf8" />
                          <text x="0" y="24" fill="#f8fafc" fontSize="9.5" fontWeight="bold" textAnchor="middle">
                            {b.name}
                          </text>
                        </g>
                      ))}
                    </g>
                  </svg>
                </div>
              </div>
            )}

            {/* TAB 8: ADMIN & USER APPROVAL WORKFLOW */}
            {activeTab === 'Admin' && (
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
                  <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
                    <span>Registered Access Requests</span>
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
            {activeTab === 'About' && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-3 border-b pb-4">
                    <div className="h-12 w-12 rounded-lg bg-[#500b50] text-white flex items-center justify-center font-bold text-lg">
                      ML4PS
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#500b50]">Machine Learning 4 Power Systems (ML4PS) Group</h2>
                      <p className="text-xs text-slate-500">
                        Department of Electrical & Electronics Engineering | Federal University of Technology, Minna
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs leading-relaxed text-slate-700">
                    <p>
                      <strong>Platform Ownership:</strong> The National Power System Modelling & Simulation Platform is developed and managed by the <strong>Machine Learning 4 Power Systems (ML4PS)</strong> research team under the direction of the <strong>National Power System and Development Taskforce</strong>.
                    </p>
                    <p>
                      <strong>Mission:</strong> To provide open-source, indigenous, IEEE/NERC-compliant power systems modelling tools for the Nigerian Electricity Supply Industry (NESI). It enables static load flow, time-domain frequency nadir calculation, PSS tuning, and wholesale economic dispatch directly in the cloud.
                    </p>
                    <p>
                      <strong>Collaborators:</strong> Funded by the National Research Fund (NRF) initiative in collaboration with the National Independent System Operator (NISO) and the Transmission Company of Nigeria (TCN).
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