'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Home,
  Grid,
  TrendingUp,
  UploadCloud,
  BarChart3,
  FileText,
  ShieldCheck,
  Play,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  FileCode,
  Menu,
  X,
} from 'lucide-react';

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

interface UploadValidation {
  status: string;
  filename: string;
  converged: boolean;
  metrics: {
    buses: number;
    branches: number;
    generators: number;
    loads: number;
    total_installed_mw: number;
    total_demand_mw: number;
  };
  validation: {
    islanding_detected: boolean;
    isolated_bus_ids: number[];
    has_slack_bus: boolean;
  };
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

const FALLBACK_COORDS: Record<number, { x: number; y: number }> = {
  0: { x: 170, y: 70 },
  1: { x: 210, y: 140 },
  2: { x: 360, y: 100 },
  3: { x: 400, y: 180 },
  4: { x: 250, y: 240 },
  5: { x: 150, y: 330 },
  6: { x: 210, y: 390 },
  7: { x: 340, y: 330 },
  8: { x: 440, y: 390 },
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com';

export default function PowerPlatformDashboard() {
  const [activeTab, setActiveTab] = useState('Home');
  const [loading, setLoading] = useState(false);
  const [loadMultiplier, setLoadMultiplier] = useState(1.0);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [results, setResults] = useState<SimResult | null>(null);
  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);
  const [divergedNotice, setDivergedNotice] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Upload State
  const [uploadResult, setUploadResult] = useState<UploadValidation | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Market Simulation State
  const [gasPriceFactor, setGasPriceFactor] = useState(1.0);
  const [hydroAvailability, setHydroAvailability] = useState(1.0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketResults, setMarketResults] = useState<MarketResult | null>(null);

  const navItems = [
    { id: 'Home', label: 'Home', icon: Home },
    { id: 'Grid Models', label: 'Grid Models', icon: Grid },
    { id: 'Market Simulations', label: 'Market Simulations', icon: BarChart3 },
    { id: 'Data Upload', label: 'Data Upload/Down-', icon: UploadCloud },
    { id: 'Visualization', label: 'Visualization Tools', icon: TrendingUp },
    { id: 'Reports', label: 'Reports & Publicati-', icon: FileText },
    { id: 'Admin Panel', label: 'Task Force/Admin Panel', icon: ShieldCheck },
  ];

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

      if (!res.ok) {
        setDivergedNotice('Simulation backend unreachable.');
        return;
      }

      const data: SimResult = await res.json();
      setResults(data);

      if (!data.converged) {
        setDivergedNotice(data.message || 'Grid diverged under current contingency.');
      } else {
        setDivergedNotice(null);
      }

      if (selectedBus && data.buses) {
        const updated = data.buses.find((b: BusData) => b.id === selectedBus.id);
        if (updated) setSelectedBus(updated);
      }
    } catch {
      setDivergedNotice('Cannot connect to simulation server.');
    } finally {
      setLoading(false);
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

      if (!res.ok) {
        setDivergedNotice('Market dispatch solver failed to converge.');
        return;
      }

      const data = await res.json();
      setMarketResults(data);
    } catch {
      setDivergedNotice('Failed to calculate economic dispatch.');
    } finally {
      setMarketLoading(false);
    }
  };

  useEffect(() => {
    runSimulation(1.0, []);
    runMarketSimulation();
  }, []);

  const toggleLine = (lineId: number) => {
    const nextTripped = trippedLines.includes(lineId)
      ? trippedLines.filter((id) => id !== lineId)
      : [...trippedLines, lineId];
    setTrippedLines(nextTripped);
    runSimulation(loadMultiplier, nextTripped);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploadLoading(true);
    setUploadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/upload/matpower`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Server returned ${res.status}`);
      }

      const data: UploadValidation = await res.json();
      setUploadResult(data);
      setTrippedLines([]);
      setLoadMultiplier(1.0);
      setSelectedBus(null);
      await runSimulation(1.0, []);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse MATPOWER case');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleResetBaseline = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/grid/reset`, { method: 'POST' });
      setUploadResult(null);
      setUploadError(null);
      setTrippedLines([]);
      setLoadMultiplier(1.0);
      setSelectedBus(null);
      setDivergedNotice(null);
      await runSimulation(1.0, []);
      await runMarketSimulation();
    } catch {
      setDivergedNotice('Failed to reset grid.');
    } finally {
      setLoading(false);
    }
  };

  const getCoordinates = (bus: BusData) => {
    if (bus.x !== undefined && bus.y !== undefined) {
      return { x: bus.x, y: bus.y };
    }
    return FALLBACK_COORDS[bus.id] || { x: 250, y: 250 };
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#eef2f6] font-sans text-slate-800 antialiased overflow-hidden">
      {/* Top Header - Faithful to Figure 6 */}
      <header className="flex h-16 w-full items-center justify-between border-b border-slate-300 bg-[#e2e8f0] px-4 md:px-6 z-20 select-none shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-300 transition"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Purple proposal logo badge */}
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#3b2d54] text-white shadow-xs shrink-0">
            <Zap className="h-5 w-5 fill-white text-white" />
          </div>

          <div className="leading-tight">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-800 uppercase">
              National Power System Modelling
            </h1>
            <p className="text-xs sm:text-sm font-bold tracking-tight text-slate-800 uppercase">
              and Simulation Platform (Nigeria)
            </p>
          </div>
        </div>

        {/* Clean rectangular Login button */}
        <button className="rounded border border-slate-400/80 bg-[#f8fafc] px-5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-white hover:border-slate-500 transition">
          Login
        </button>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <aside
              className="w-64 h-full bg-[#f8fafc] border-r border-slate-300 p-4 flex flex-col justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Navigation</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-slate-600 hover:text-slate-900">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="space-y-1">
                  {navItems.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition ${
                          isActive
                            ? 'bg-slate-300/80 text-slate-900 font-semibold'
                            : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-slate-600" />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="pt-3 border-t border-slate-200">
                <button
                  onClick={handleResetBaseline}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-1.5 rounded border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                  <span>Reset Grid</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Desktop Sidebar - Faithful to Figure 6 */}
        <aside className="hidden md:flex w-56 border-r border-slate-300 bg-[#f1f5f9] p-3 flex-col justify-between shrink-0 select-none">
          <nav className="space-y-1 pt-1">
            {navItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs transition ${
                    isActive
                      ? 'bg-slate-300/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 font-medium'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Clean Reset Button (no solver or pandapower label) */}
          <div className="pt-3 border-t border-slate-200/90">
            <button
              onClick={handleResetBaseline}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 rounded border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>Reset Grid</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-[#f8fafc] p-6 sm:p-8">
          {/* TAB 1: HOME - Faithful 2x2 Grid from Figure 6 */}
          {activeTab === 'Home' && (
            <div className="h-full flex items-center justify-center max-w-4xl mx-auto">
              <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                {/* 1. Grid Stability Models */}
                <div
                  onClick={() => setActiveTab('Grid Models')}
                  className="group cursor-pointer rounded-xl border border-slate-300 bg-white p-10 sm:p-12 flex flex-col items-center justify-center shadow-2xs hover:shadow-md hover:border-slate-400 transition min-h-[220px]"
                >
                  <div className="mb-6 flex h-16 w-16 items-center justify-center text-slate-600 group-hover:text-slate-900 transition">
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-14 h-14">
                      <line x1="8" y1="56" x2="8" y2="8" />
                      <line x1="8" y1="56" x2="56" y2="56" />
                      <polyline points="14 42 26 28 36 36 50 18" />
                      <polyline points="42 18 50 18 50 26" />
                    </svg>
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold tracking-wider text-slate-700 text-center uppercase group-hover:text-slate-900 leading-snug">
                    Grid Stability<br />Models
                  </h3>
                </div>

                {/* 2. Market Simulation Models */}
                <div
                  onClick={() => setActiveTab('Market Simulations')}
                  className="group cursor-pointer rounded-xl border border-slate-300 bg-white p-10 sm:p-12 flex flex-col items-center justify-center shadow-2xs hover:shadow-md hover:border-slate-400 transition min-h-[220px]"
                >
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-500 text-white font-serif text-3xl font-bold shadow-2xs group-hover:bg-slate-700 transition">
                    $
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold tracking-wider text-slate-700 text-center uppercase group-hover:text-slate-900 leading-snug">
                    Market Simulation<br />Models
                  </h3>
                </div>

                {/* 3. Data Upload & Validation */}
                <div
                  onClick={() => setActiveTab('Data Upload')}
                  className="group cursor-pointer rounded-xl border border-slate-300 bg-white p-10 sm:p-12 flex flex-col items-center justify-center shadow-2xs hover:shadow-md hover:border-slate-400 transition min-h-[220px]"
                >
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-500 text-white shadow-2xs group-hover:bg-slate-700 transition">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                      <path d="M12 17V3" />
                      <path d="m6 9 6-6 6 6" />
                    </svg>
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold tracking-wider text-slate-700 text-center uppercase group-hover:text-slate-900 leading-snug">
                    Data Upload<br />& Validation
                  </h3>
                </div>

                {/* 4. Reports & Visualization */}
                <div
                  onClick={() => setActiveTab('Reports')}
                  className="group cursor-pointer rounded-xl border border-slate-300 bg-white p-10 sm:p-12 flex flex-col items-center justify-center shadow-2xs hover:shadow-md hover:border-slate-400 transition min-h-[220px]"
                >
                  <div className="mb-6 flex h-16 w-16 items-center justify-center text-slate-600 group-hover:text-slate-900 transition">
                    <svg viewBox="0 0 64 64" fill="currentColor" className="w-12 h-12">
                      <rect x="12" y="34" width="8" height="22" rx="1" />
                      <rect x="28" y="22" width="8" height="34" rx="1" />
                      <rect x="44" y="10" width="8" height="46" rx="1" />
                    </svg>
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold tracking-wider text-slate-700 text-center uppercase group-hover:text-slate-900 leading-snug">
                    Reports &<br />Visualization
                  </h3>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GRID MODELS */}
          {activeTab === 'Grid Models' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {divergedNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>{divergedNotice}</span>
                </div>
              )}

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Static Power Flow & Contingency</h2>
                  <p className="text-xs text-slate-500">AC Newton-Raphson load flow analysis for N-1 contingency verification.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-slate-300 text-xs">
                    <Sliders className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-slate-600">Load:</span>
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
                      className="w-16 accent-slate-700 cursor-pointer"
                    />
                    <span className="font-mono font-bold text-slate-800">{(loadMultiplier * 100).toFixed(0)}%</span>
                  </div>

                  <button
                    onClick={() => runSimulation()}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded border border-slate-400 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-700 transition disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    <span>Solve</span>
                  </button>

                  <button
                    onClick={handleResetBaseline}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* Substation Bus Voltages */}
              <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-slate-700">Substation Bus Voltage Profiles</h3>
                  <span className="text-slate-500">Statutory Band: 0.95 – 1.05 p.u.</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[550px]">
                    <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-3">Bus</th>
                        <th className="p-3">Substation</th>
                        <th className="p-3">Zone</th>
                        <th className="p-3">Voltage (|V|)</th>
                        <th className="p-3">Angle (°)</th>
                        <th className="p-3">Active (MW)</th>
                        <th className="p-3">Reactive (MVAR)</th>
                        <th className="p-3">State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                      {results?.buses?.map((bus) => {
                        const isUnder = bus.v_pu < 0.95;
                        const isOver = bus.v_pu > 1.05;
                        return (
                          <tr key={bus.id} className="hover:bg-slate-50">
                            <td className="p-3 font-mono text-slate-500">#{bus.id}</td>
                            <td className="p-3 font-semibold text-slate-800">{bus.name}</td>
                            <td className="p-3 text-slate-500">{bus.zone}</td>
                            <td className="p-3 font-mono font-bold">
                              <span className={isUnder ? 'text-rose-600' : isOver ? 'text-amber-600' : 'text-emerald-600'}>
                                {bus.v_pu.toFixed(3)} pu
                              </span>
                            </td>
                            <td className="p-3 font-mono">{bus.va_deg.toFixed(2)}°</td>
                            <td className="p-3 font-mono">{bus.p_mw}</td>
                            <td className="p-3 font-mono">{bus.q_mvar}</td>
                            <td className="p-3">
                              {isUnder ? (
                                <span className="flex items-center gap-1 text-rose-600 font-semibold text-[11px]">
                                  <AlertTriangle className="h-3 w-3" /> Low
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                                  <CheckCircle2 className="h-3 w-3" /> Normal
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

              {/* Line Breaker Controls */}
              <div className="rounded-xl border border-slate-300 bg-white p-5 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-800 mb-1">N-1 Line Contingency & Breaker Controls</h3>
                <p className="text-xs text-slate-500 mb-4">Click "Trip" to open a breaker and observe power redistribution across adjacent corridors.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {results?.lines?.map((line) => {
                    const isTripped = trippedLines.includes(line.id);
                    return (
                      <div
                        key={line.id}
                        className={`rounded-lg border p-3 flex flex-col justify-between transition ${
                          isTripped
                            ? 'border-rose-300 bg-rose-50'
                            : line.loading_percent > 85
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-800 truncate">{line.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            !isTripped ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'
                          }`}>
                            {!isTripped ? 'Online' : 'Tripped'}
                          </span>
                        </div>

                        <div className="space-y-1 font-mono text-[11px] text-slate-600 mb-3">
                          <div className="flex justify-between">
                            <span>Flow:</span>
                            <span className="text-slate-800 font-semibold">{line.flow_mw} MW</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Loading:</span>
                            <span className={line.loading_percent > 85 ? 'text-amber-700 font-bold' : ''}>
                              {line.loading_percent}%
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => toggleLine(line.id)}
                          className={`w-full py-1.5 rounded text-[11px] font-semibold transition ${
                            !isTripped
                              ? 'bg-rose-100 text-rose-700 border border-rose-300 hover:bg-rose-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200'
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

          {/* TAB 3: MARKET SIMULATIONS */}
          {activeTab === 'Market Simulations' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Wholesale Electricity Market & Economic Dispatch</h2>
                  <p className="text-xs text-slate-500">Merit-order generation scheduling and Locational Marginal Pricing (LMP).</p>
                </div>

                <button
                  onClick={runMarketSimulation}
                  disabled={marketLoading}
                  className="flex items-center gap-1.5 rounded border border-slate-400 bg-slate-800 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-slate-700 transition disabled:opacity-50 w-fit"
                >
                  {marketLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{marketLoading ? 'Solving...' : 'Run Economic Dispatch'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-slate-300 bg-white flex flex-col justify-between shadow-2xs">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-700">Gas Fuel Price Index</span>
                    <span className="text-xs font-mono font-bold text-slate-900">{(gasPriceFactor * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="2.0"
                    step="0.1"
                    value={gasPriceFactor}
                    onChange={(e) => setGasPriceFactor(parseFloat(e.target.value))}
                    className="w-full accent-slate-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 mt-1.5">Simulate natural gas pipeline tariff fluctuations</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-300 bg-white flex flex-col justify-between shadow-2xs">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-700">Hydro Inflow Season</span>
                    <span className="text-xs font-mono font-bold text-slate-900">{hydroAvailability >= 0.9 ? 'Wet (Peak)' : 'Dry (Lean)'}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.1"
                    value={hydroAvailability}
                    onChange={(e) => setHydroAvailability(parseFloat(e.target.value))}
                    className="w-full accent-slate-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 mt-1.5">Kainji, Jebba & Shiroro reservoir water head levels</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-300 bg-white flex flex-col justify-between sm:col-span-2 lg:col-span-1 shadow-2xs">
                  <span className="text-xs font-semibold text-slate-700 mb-1">System Clearing Price</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono font-bold text-slate-900">
                      ₦{marketResults?.market_clearing_price_ngn?.toLocaleString() || '--'}
                    </span>
                    <span className="text-xs text-slate-500">/ MWh</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1">Marginal unit setting wholesale spot settlement</span>
                </div>
              </div>

              {/* Merit Order Stack */}
              <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-slate-700">Merit Order Generation Dispatch Stack</h3>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-medium text-slate-700">Hydro: {marketResults?.hydro_share_percent || 0}%</span>
                    <span className="font-medium text-slate-700">Thermal: {marketResults?.thermal_share_percent || 0}%</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[650px]">
                    <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-3">Rank</th>
                        <th className="p-3">Generating Station</th>
                        <th className="p-3">Primary Fuel</th>
                        <th className="p-3">Marginal Cost (₦/MWh)</th>
                        <th className="p-3">Dispatched (MW)</th>
                        <th className="p-3">Capacity Max (MW)</th>
                        <th className="p-3">Capacity Factor</th>
                        <th className="p-3">Hourly Total (₦)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                      {marketResults?.merit_order?.map((gen, idx) => (
                        <tr key={gen.name} className="hover:bg-slate-50">
                          <td className="p-3 font-mono text-slate-500">#{idx + 1}</td>
                          <td className="p-3 font-semibold text-slate-800">{gen.name}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                              {gen.type}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-800">₦{gen.marginal_cost.toLocaleString()}</td>
                          <td className="p-3 font-mono font-semibold">{gen.dispatched_mw} MW</td>
                          <td className="p-3 font-mono text-slate-500">{gen.max_mw} MW</td>
                          <td className="p-3 font-mono">{gen.capacity_utilization}%</td>
                          <td className="p-3 font-mono text-slate-800">₦{gen.hourly_cost_ngn.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DATA UPLOAD & VALIDATION */}
          {activeTab === 'Data Upload' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {uploadError && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>Upload Notice: {uploadError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Grid Model Ingestion & Validation</h2>
                  <p className="text-xs text-slate-500">Ingest MATPOWER (.m) case files into the active simulation session.</p>
                </div>
                <button
                  onClick={handleResetBaseline}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition w-fit shadow-2xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                  <span>Reset to Baseline</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-300 bg-white p-6 sm:p-8 space-y-6 shadow-2xs">
                <div className="border-2 border-dashed border-slate-300 hover:border-slate-500 rounded-xl p-8 text-center transition flex flex-col items-center justify-center bg-slate-50">
                  <UploadCloud className="h-10 w-10 text-slate-400 mb-3" />
                  <p className="text-xs sm:text-sm font-semibold text-slate-700">Select or drop a MATPOWER case file (.m)</p>
                  <p className="text-[11px] text-slate-400 mt-1">Supports standard IEEE cases or TCN custom models</p>

                  <input
                    type="file"
                    id="fileUploadInput"
                    accept=".m"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <label
                    htmlFor="fileUploadInput"
                    className={`mt-4 cursor-pointer rounded border border-slate-400 bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition ${
                      uploadLoading ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    {uploadLoading ? 'Parsing Case...' : 'Browse .m File'}
                  </label>
                </div>

                {uploadResult && (
                  <div className="rounded-xl border border-slate-300 bg-slate-50 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2 truncate">
                        <FileCode className="h-4 w-4 text-slate-600 shrink-0" />
                        <span className="font-bold text-slate-800 text-xs sm:text-sm truncate">{uploadResult.filename}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 ${
                        uploadResult.converged
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}>
                        {uploadResult.converged ? 'AC Solved' : 'Diverged'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded border border-slate-300 bg-white">
                        <span className="text-slate-500">Buses</span>
                        <p className="text-base sm:text-lg font-mono font-bold text-slate-800 mt-1">{uploadResult.metrics.buses}</p>
                      </div>
                      <div className="p-3 rounded border border-slate-300 bg-white">
                        <span className="text-slate-500">Branches</span>
                        <p className="text-base sm:text-lg font-mono font-bold text-slate-800 mt-1">{uploadResult.metrics.branches}</p>
                      </div>
                      <div className="p-3 rounded border border-slate-300 bg-white">
                        <span className="text-slate-500">Generation</span>
                        <p className="text-base sm:text-lg font-mono font-bold text-slate-800 mt-1">{uploadResult.metrics.total_installed_mw} MW</p>
                      </div>
                      <div className="p-3 rounded border border-slate-300 bg-white">
                        <span className="text-slate-500">Demand</span>
                        <p className="text-base sm:text-lg font-mono font-bold text-slate-800 mt-1">{uploadResult.metrics.total_demand_mw} MW</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: VISUALIZATION TOOLS */}
          {activeTab === 'Visualization' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {divergedNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>{divergedNotice}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Interactive Single-Line Diagram</h2>
                  <p className="text-xs text-slate-500">Click corridors to trip breakers or select substation nodes for live telemetry.</p>
                </div>
                <button
                  onClick={handleResetBaseline}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition w-fit shadow-2xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                  <span>Reset Grid</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-xl border border-slate-300 bg-white p-4 relative overflow-hidden flex flex-col items-center justify-center shadow-2xs">
                  <svg viewBox="100 40 440 420" className="w-full h-[360px] sm:h-[440px] select-none">
                    {results?.lines.map((line) => {
                      const fromBus = results.buses.find((b) => b.id === line.from_bus);
                      const toBus = results.buses.find((b) => b.id === line.to_bus);
                      if (!fromBus || !toBus) return null;

                      const cFrom = getCoordinates(fromBus);
                      const cTo = getCoordinates(toBus);
                      const isTripped = trippedLines.includes(line.id);

                      return (
                        <g key={line.id} className="cursor-pointer" onClick={() => toggleLine(line.id)}>
                          <line
                            x1={cFrom.x}
                            y1={cFrom.y}
                            x2={cTo.x}
                            y2={cTo.y}
                            stroke={isTripped ? '#e11d48' : line.loading_percent > 85 ? '#d97706' : '#334155'}
                            strokeWidth={isTripped ? 2 : 2.5}
                            strokeDasharray={isTripped ? '5 5' : 'none'}
                            className="transition-colors hover:stroke-slate-900"
                          />
                          {!isTripped && (
                            <text
                              x={(cFrom.x + cTo.x) / 2}
                              y={(cFrom.y + cTo.y) / 2 - 5}
                              fill="#64748b"
                              fontSize="8"
                              textAnchor="middle"
                              className="font-mono font-semibold select-none"
                            >
                              {line.flow_mw} MW
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {results?.buses.map((bus) => {
                      const isSelected = selectedBus?.id === bus.id;
                      const isUnder = bus.v_pu < 0.95;
                      const isOver = bus.v_pu > 1.05;
                      const nodeColor = isUnder ? '#e11d48' : isOver ? '#d97706' : '#0f766e';
                      const coords = getCoordinates(bus);

                      return (
                        <g
                          key={bus.id}
                          transform={`translate(${coords.x}, ${coords.y})`}
                          onClick={() => setSelectedBus(bus)}
                          className="cursor-pointer group"
                        >
                          <circle
                            r={isSelected ? 10 : 7}
                            fill={nodeColor}
                            stroke="#ffffff"
                            strokeWidth="2"
                            className="transition-all group-hover:scale-125"
                          />
                          <text
                            x={11}
                            y={3.5}
                            fill="#1e293b"
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {bus.name.split(' ')[0]}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="rounded-xl border border-slate-300 bg-white p-5 flex flex-col justify-between shadow-2xs">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-tight">Substation Inspector</h3>
                    {selectedBus ? (
                      <div className="space-y-3 text-xs">
                        <div className="p-3 rounded border border-slate-200 bg-slate-50">
                          <span className="text-slate-500 block text-[10px] uppercase">Substation</span>
                          <span className="font-bold text-slate-800 text-sm">{selectedBus.name}</span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">{selectedBus.zone} Zone</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 font-mono">
                          <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                            <span className="text-slate-500 block text-[10px]">Voltage (|V|)</span>
                            <span className={`font-bold ${selectedBus.v_pu < 0.95 ? 'text-rose-600' : 'text-slate-800'}`}>
                              {selectedBus.v_pu} pu
                            </span>
                          </div>
                          <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                            <span className="text-slate-500 block text-[10px]">Angle</span>
                            <span className="font-bold text-slate-800">{selectedBus.va_deg}°</span>
                          </div>
                          <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                            <span className="text-slate-500 block text-[10px]">Active</span>
                            <span className="font-bold text-slate-800">{selectedBus.p_mw} MW</span>
                          </div>
                          <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                            <span className="text-slate-500 block text-[10px]">Reactive</span>
                            <span className="font-bold text-slate-800">{selectedBus.q_mvar} MVAR</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-40 flex items-center justify-center text-center text-xs text-slate-400 border border-dashed border-slate-300 rounded-lg p-4">
                        Click on any node in the diagram to inspect telemetry.
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] text-slate-500">
                    Click line corridors to simulate breaker trip (N-1).
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: REPORTS & PUBLICATIONS */}
          {activeTab === 'Reports' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">National Grid Contingency Audit Report</h2>
                  <p className="text-xs text-slate-500">Grid Code compliance audit (0.95 ≤ |V| ≤ 1.05 p.u., loading ≤ 85%).</p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`${API_BASE_URL}/api/reports/export-csv`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                    <span>Download CSV</span>
                  </a>

                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded border border-slate-400 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition shadow-2xs"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Print Document</span>
                  </button>
                </div>
              </div>

              {/* Summary Audit Scorecard */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-4 rounded-xl border border-slate-300 bg-white shadow-2xs">
                  <span className="text-slate-500 block mb-1">Total System Infeed</span>
                  <span className="text-xl font-mono font-bold text-slate-800">
                    {results?.total_gen_mw ? `${results.total_gen_mw.toLocaleString()} MW` : '--'}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-300 bg-white shadow-2xs">
                  <span className="text-slate-500 block mb-1">Total System Losses</span>
                  <span className="text-xl font-mono font-bold text-slate-800">
                    {results?.total_losses_mw ? `${results.total_losses_mw} MW` : '--'}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-300 bg-white shadow-2xs">
                  <span className="text-slate-500 block mb-1">Voltage Violations</span>
                  <span className="text-xl font-mono font-bold text-slate-800">
                    {results?.buses ? results.buses.filter((b) => b.v_pu < 0.95 || b.v_pu > 1.05).length : 0} Nodes
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-300 bg-white shadow-2xs">
                  <span className="text-slate-500 block mb-1">Critical Lines (&gt;80%)</span>
                  <span className="text-xl font-mono font-bold text-slate-800">
                    {results?.lines ? results.lines.filter((l) => l.loading_percent > 80).length : 0} Corridors
                  </span>
                </div>
              </div>

              {/* Itemized Violation Ledger */}
              <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-slate-700">Grid Code Violation & Contingency Ledger</h3>
                </div>

                <div className="divide-y divide-slate-200 text-xs">
                  {results?.buses
                    ?.filter((b) => b.v_pu < 0.95)
                    .map((bus) => (
                      <div key={bus.id} className="p-3.5 flex items-center justify-between bg-rose-50/50">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-800">{bus.name} ({bus.zone} Zone)</span>
                            <span className="block text-[11px] text-rose-700">Under-voltage detected: {bus.v_pu} p.u.</span>
                          </div>
                        </div>
                        <span className="font-mono text-rose-700 font-bold px-2 py-0.5 rounded bg-rose-100 border border-rose-200 text-[11px]">
                          V-LOW
                        </span>
                      </div>
                    ))}

                  {results?.lines
                    ?.filter((l) => l.loading_percent > 80 && l.in_service)
                    .map((line) => (
                      <div key={line.id} className="p-3.5 flex items-center justify-between bg-amber-50/50">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-800">{line.name}</span>
                            <span className="block text-[11px] text-amber-700">Loading reached {line.loading_percent}% ({line.flow_mw} MW)</span>
                          </div>
                        </div>
                        <span className="font-mono text-amber-700 font-bold px-2 py-0.5 rounded bg-amber-100 border border-amber-200 text-[11px]">
                          OVERLOAD
                        </span>
                      </div>
                    ))}

                  {results?.buses?.every((b) => b.v_pu >= 0.95 && b.v_pu <= 1.05) &&
                    results?.lines?.every((l) => l.loading_percent <= 80 && l.in_service) && (
                      <div className="p-6 text-center text-slate-500 flex flex-col items-center justify-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600 mb-2" />
                        <span className="font-semibold text-slate-800">Full Grid Code Compliance</span>
                        <span className="text-[11px] text-slate-500 mt-0.5">All substation voltages and branch loadings fall within standard operating limits.</span>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: TASK FORCE & OPERATOR ADMIN PANEL */}
          {activeTab === 'Admin Panel' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">National Grid Task Force & Administration</h2>
                <p className="text-xs text-slate-500">Statutory NERC Grid Code operational criteria and system security margins.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-300 bg-white p-5 space-y-4 shadow-2xs">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight border-b border-slate-200 pb-2">
                    NERC Grid Code Criteria
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-600">Nominal Frequency</span>
                      <span className="font-mono font-bold text-slate-800">50.00 Hz (±0.5%)</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-600">Statutory Voltage Band</span>
                      <span className="font-mono font-bold text-slate-800">0.95 – 1.05 p.u.</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Thermal Alarm Limit</span>
                      <span className="font-mono font-bold text-slate-800">85.0% Loading</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-300 bg-white p-5 space-y-4 shadow-2xs">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight border-b border-slate-200 pb-2">
                    System Authority
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Operated under the National Research Fund (NRF) Power Systems Research Initiative for the Nigerian bulk electricity transmission network.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}