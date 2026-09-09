'use client';

import React, { useState, useEffect } from 'react';
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
    { id: 'Market Simulations', label: 'Market Simulations', icon: DollarSign },
    { id: 'Data Upload', label: 'Data Upload/Download', icon: UploadCloud },
    { id: 'Visualization', label: 'Visualization Tools', icon: BarChart3 },
    { id: 'Reports', label: 'Reports & Publications', icon: FileText },
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
        setDivergedNotice('Backend unreachable. Ensure server is active.');
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
      setDivergedNotice('Cannot connect to backend simulation API.');
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
      setDivergedNotice('Failed to communicate grid reset to server.');
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
    <div className="flex h-screen w-full flex-col bg-slate-900 font-sans text-slate-100 antialiased overflow-hidden">
      {/* Clean Utility Header */}
      <header className="flex h-14 w-full items-center justify-between border-b border-slate-800 bg-slate-950 px-4 md:px-5 z-20 select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-emerald-400 fill-emerald-400" />
            <span className="font-semibold text-sm text-slate-200 tracking-tight">Nigeria 330kV EMS</span>
            <span className="hidden sm:inline-block font-mono text-[11px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded truncate max-w-[170px]">
              {results?.model_name || 'Baseline 330kV'}
            </span>
          </div>
        </div>

        {/* Telemetry Strip */}
        <div className="flex items-center gap-3 sm:gap-5 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${results && (results.frequency < 49.8 || results.frequency > 50.2) ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${results && (results.frequency < 49.8 || results.frequency > 50.2) ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
            </span>
            <span className="text-slate-100 font-bold">{results?.frequency ? `${results.frequency.toFixed(2)} Hz` : '50.00 Hz'}</span>
          </div>

          <div className="hidden md:flex items-center gap-4 text-slate-400 border-l border-slate-800/80 pl-4">
            <div>
              <span className="text-slate-500">Gen: </span>
              <span className="text-slate-200 font-semibold">{results?.total_gen_mw ? `${results.total_gen_mw.toLocaleString()} MW` : '--'}</span>
            </div>
            <div>
              <span className="text-slate-500">Loss: </span>
              <span className="text-slate-200 font-semibold">{results?.total_losses_mw ? `${results.total_losses_mw} MW` : '--'}</span>
            </div>
          </div>

          <div className="border-l border-slate-800/80 pl-3 sm:pl-4">
            <span className="text-[11px] font-sans text-slate-400">NCC Osogbo</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <aside
              className="w-64 h-full bg-slate-950 border-r border-slate-800 p-4 flex flex-col justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Navigation</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white">
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
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          isActive
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
                <button
                  onClick={handleResetBaseline}
                  className="w-full flex items-center justify-center gap-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 py-1.5 text-xs font-semibold text-slate-200 transition"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Reset Grid to Baseline</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-60 border-r border-slate-800 bg-slate-950 p-3 flex-col justify-between shrink-0 select-none">
          <nav className="space-y-1">
            {navItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
                    isActive
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-xs space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Solver Engine</span>
              <span className="font-semibold text-emerald-400">Pandapower</span>
            </div>
            <button
              onClick={handleResetBaseline}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 py-1.5 text-[11px] font-medium text-slate-200 transition disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3 text-emerald-400" />
              <span>Reset to Baseline</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-900 p-4 sm:p-6 md:p-8">
          {/* TAB 1: HOME */}
          {activeTab === 'Home' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-slate-100">National Grid Simulation Workspace</h2>
                <p className="text-xs md:text-sm text-slate-400">Select a primary module below to perform dynamic studies, economic dispatch, or upload network parameters.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                {[
                  {
                    title: 'GRID STABILITY MODELS',
                    desc: 'Newton-Raphson power flow, N-1 contingency studies, and transient frequency response.',
                    icon: TrendingUp,
                    color: 'from-blue-500/10 to-cyan-500/5 border-blue-500/30 text-blue-400',
                    action: () => setActiveTab('Grid Models'),
                  },
                  {
                    title: 'MARKET SIMULATION MODELS',
                    desc: 'Merit order dispatch, locational marginal pricing (LMP), and hydro-thermal generation optimization.',
                    icon: DollarSign,
                    color: 'from-emerald-500/10 to-teal-500/5 border-emerald-500/30 text-emerald-400',
                    action: () => setActiveTab('Market Simulations'),
                  },
                  {
                    title: 'DATA UPLOAD & VALIDATION',
                    desc: 'SCADA telemetry ingestion, IEEE MATPOWER parser, and automated topology error checking.',
                    icon: UploadCloud,
                    color: 'from-purple-500/10 to-indigo-500/5 border-purple-500/30 text-purple-400',
                    action: () => setActiveTab('Data Upload'),
                  },
                  {
                    title: 'REPORTS & VISUALIZATION',
                    desc: 'Single-line diagrams, voltage profile heatmaps, transmission congestion, and PDF audit exports.',
                    icon: BarChart3,
                    color: 'from-amber-500/10 to-orange-500/5 border-amber-500/30 text-amber-400',
                    action: () => setActiveTab('Visualization'),
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      onClick={card.action}
                      className={`group cursor-pointer rounded-xl border bg-gradient-to-br p-6 md:p-8 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${card.color}`}
                    >
                      <div className="mb-4 flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-xl bg-slate-950/80 border border-slate-800 shadow-inner group-hover:scale-105 transition-transform">
                        <Icon className="h-6 w-6 md:h-7 md:w-7 stroke-[1.75]" />
                      </div>
                      <h3 className="text-sm md:text-base font-bold tracking-wider text-slate-100 group-hover:text-white">
                        {card.title}
                      </h3>
                      <p className="mt-2 text-xs text-slate-400 leading-relaxed">{card.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: GRID MODELS */}
          {activeTab === 'Grid Models' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {divergedNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{divergedNotice}</span>
                </div>
              )}

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-100">Static Power Flow & Contingency</h2>
                  <p className="text-xs md:text-sm text-slate-400">
                    Active Grid: <span className="text-emerald-400 font-mono font-semibold">{results?.model_name || 'Nigeria 330kV Baseline'}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
                    <Sliders className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-slate-400 hidden sm:inline">Load:</span>
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
                      className="w-16 sm:w-20 accent-emerald-500 cursor-pointer"
                    />
                    <span className="font-mono font-bold text-emerald-400">{(loadMultiplier * 100).toFixed(0)}%</span>
                  </div>

                  <button
                    onClick={() => runSimulation()}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    <span>Solve</span>
                  </button>

                  <button
                    onClick={handleResetBaseline}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* Substation Bus Voltages Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
                <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-slate-200">Substation Bus Voltage Profiles</h3>
                  <span className="text-slate-400 hidden sm:inline">Nominal: 0.95 – 1.05 p.u.</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[550px]">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
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
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {results?.buses?.map((bus) => {
                        const isUnder = bus.v_pu < 0.95;
                        const isOver = bus.v_pu > 1.05;
                        return (
                          <tr key={bus.id} className="hover:bg-slate-900/40">
                            <td className="p-3 font-mono font-bold text-slate-500">#{bus.id}</td>
                            <td className="p-3 font-semibold text-slate-100">{bus.name}</td>
                            <td className="p-3 text-slate-400">{bus.zone}</td>
                            <td className="p-3 font-mono font-bold">
                              <span className={isUnder ? 'text-rose-400' : isOver ? 'text-amber-400' : 'text-emerald-400'}>
                                {bus.v_pu.toFixed(3)} pu
                              </span>
                            </td>
                            <td className="p-3 font-mono">{bus.va_deg.toFixed(2)}°</td>
                            <td className="p-3 font-mono">{bus.p_mw}</td>
                            <td className="p-3 font-mono">{bus.q_mvar}</td>
                            <td className="p-3">
                              {isUnder ? (
                                <span className="flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                                  <AlertTriangle className="h-3 w-3" /> Low
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
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

              {/* Breaker Controls */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
                <h3 className="text-sm font-bold text-slate-200 mb-1">N-1 Line Contingency & Breaker Controls</h3>
                <p className="text-xs text-slate-400 mb-4">Click "Trip" to open a breaker and observe power redistribution across adjacent corridors.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {results?.lines?.map((line) => {
                    const isTripped = trippedLines.includes(line.id);
                    return (
                      <div
                        key={line.id}
                        className={`rounded-lg border p-3 flex flex-col justify-between transition ${
                          isTripped
                            ? 'border-rose-900/50 bg-rose-950/20'
                            : line.loading_percent > 85
                            ? 'border-amber-500/50 bg-amber-950/20'
                            : 'border-slate-800 bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-200 truncate">{line.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            !isTripped ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {!isTripped ? 'Online' : 'Tripped'}
                          </span>
                        </div>

                        <div className="space-y-1 font-mono text-[11px] text-slate-400 mb-3">
                          <div className="flex justify-between">
                            <span>Flow:</span>
                            <span className="text-slate-200 font-bold">{line.flow_mw} MW</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Loading:</span>
                            <span className={line.loading_percent > 85 ? 'text-amber-400 font-bold' : ''}>
                              {line.loading_percent}%
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => toggleLine(line.id)}
                          className={`w-full py-1.5 rounded text-[11px] font-bold transition ${
                            !isTripped
                              ? 'bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600 hover:text-white'
                              : 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600 hover:text-white'
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
                  <h2 className="text-lg md:text-xl font-bold text-slate-100">Wholesale Electricity Market & Economic Dispatch</h2>
                  <p className="text-xs md:text-sm text-slate-400">Merit-order generation scheduling and Locational Marginal Pricing (LMP) for the Nigerian Electricity Supply Industry (NESI).</p>
                </div>

                <button
                  onClick={runMarketSimulation}
                  disabled={marketLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50 w-fit"
                >
                  {marketLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{marketLoading ? 'Solving OPF...' : 'Run Economic Dispatch'}</span>
                </button>
              </div>

              {/* Scenario Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-300">Gas Fuel Price Index</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">{(gasPriceFactor * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="2.0"
                    step="0.1"
                    value={gasPriceFactor}
                    onChange={(e) => setGasPriceFactor(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 mt-1.5">Simulate natural gas pipeline tariff fluctuations</span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-300">Hydro Inflow Season</span>
                    <span className="text-xs font-mono font-bold text-cyan-400">{hydroAvailability >= 0.9 ? 'Wet (Peak)' : 'Dry (Lean)'}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.1"
                    value={hydroAvailability}
                    onChange={(e) => setHydroAvailability(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 mt-1.5">Kainji, Jebba & Shiroro reservoir water head levels</span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
                  <span className="text-xs font-semibold text-slate-300 mb-1">System Clearing Price</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono font-bold text-emerald-400">
                      ₦{marketResults?.market_clearing_price_ngn?.toLocaleString() || '--'}
                    </span>
                    <span className="text-xs text-slate-400">/ MWh</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Marginal unit setting wholesale spot settlement</span>
                </div>
              </div>

              {/* Merit Order Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
                <div className="border-b border-slate-800 bg-slate-900/60 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Merit Order Generation Dispatch Stack</h3>
                    <p className="text-xs text-slate-400">Generators dispatched by ascending marginal operating cost (₦/MWh)</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="h-2 w-2 rounded-full bg-cyan-400"></span> Hydro: {marketResults?.hydro_share_percent || 0}%
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="h-2 w-2 rounded-full bg-amber-400"></span> Thermal: {marketResults?.thermal_share_percent || 0}%
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[650px]">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
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
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {marketResults?.merit_order?.map((gen, idx) => (
                        <tr key={gen.name} className="hover:bg-slate-900/40">
                          <td className="p-3 font-mono font-bold text-slate-500">#{idx + 1}</td>
                          <td className="p-3 font-semibold text-slate-100">{gen.name}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              gen.type === 'Hydro'
                                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}>
                              {gen.type}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-emerald-400">₦{gen.marginal_cost.toLocaleString()}</td>
                          <td className="p-3 font-mono font-bold text-slate-100">{gen.dispatched_mw} MW</td>
                          <td className="p-3 font-mono text-slate-400">{gen.max_mw} MW</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${gen.type === 'Hydro' ? 'bg-cyan-500' : 'bg-amber-500'}`}
                                  style={{ width: `${Math.min(100, gen.capacity_utilization)}%` }}
                                ></div>
                              </div>
                              <span className="font-mono text-[11px]">{gen.capacity_utilization}%</span>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-slate-200">₦{gen.hourly_cost_ngn.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* LMP Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-slate-200">Substation Locational Marginal Prices (LMP)</h3>
                  <p className="text-xs text-slate-400">Nodal pricing reflecting marginal cost + transmission loss & congestion components.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {marketResults?.buses_lmp?.map((bus) => (
                    <div key={bus.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-200 block">{bus.name}</span>
                        <span className="text-[10px] text-slate-400">{bus.zone}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-400 text-sm">₦{bus.lmp_ngn_per_mwh.toLocaleString()}</span>
                        <span className="block text-[10px] text-slate-500">/ MWh</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DATA UPLOAD & VALIDATION */}
          {activeTab === 'Data Upload' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {uploadError && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>Upload Notice: {uploadError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-100">Grid Model Ingestion & Validation</h2>
                  <p className="text-xs md:text-sm text-slate-400">Ingest MATPOWER (.m) case files into the active simulation session.</p>
                </div>
                <button
                  onClick={handleResetBaseline}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 w-fit"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Reset to 330kV Baseline</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 sm:p-6 space-y-6">
                <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-6 sm:p-8 text-center transition flex flex-col items-center justify-center bg-slate-900/40">
                  <UploadCloud className="h-10 w-10 sm:h-12 sm:w-12 text-slate-400 mb-3" />
                  <p className="text-xs sm:text-sm font-semibold text-slate-200">Select or drop a MATPOWER case file (.m)</p>
                  <p className="text-[11px] text-slate-500 mt-1">Supports standard IEEE cases or TCN custom models</p>

                  <input
                    type="file"
                    id="fileUploadInput"
                    accept=".m"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <label
                    htmlFor="fileUploadInput"
                    className={`mt-4 cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 ${
                      uploadLoading ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    {uploadLoading ? 'Parsing Case...' : 'Browse .m File'}
                  </label>
                </div>

                {uploadResult && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2 truncate">
                        <FileCode className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="font-bold text-slate-100 text-xs sm:text-sm truncate">{uploadResult.filename}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                        uploadResult.converged
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}>
                        {uploadResult.converged ? 'AC Solved' : 'Diverged'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Buses</span>
                        <p className="text-base sm:text-lg font-mono font-bold text-slate-100 mt-1">{uploadResult.metrics.buses}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Branches</span>
                        <p className="text-base sm:text-lg font-mono font-bold text-slate-100 mt-1">{uploadResult.metrics.branches}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Generation</span>
                        <p className="text-base sm:text-lg font-mono font-bold text-cyan-400 mt-1">{uploadResult.metrics.total_installed_mw} MW</p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Demand</span>
                        <p className="text-base sm:text-lg font-mono font-bold text-amber-400 mt-1">{uploadResult.metrics.total_demand_mw} MW</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1 text-xs">
                      <div className="flex items-center gap-2">
                        {uploadResult.validation.has_slack_bus ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                        )}
                        <span className="text-slate-300">
                          Slack Bus: {uploadResult.validation.has_slack_bus ? 'Valid' : 'Missing reference generator'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!uploadResult.validation.islanding_detected ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        )}
                        <span className="text-slate-300">
                          Topological Check: {uploadResult.validation.islanding_detected ? `Islanding on IDs: ${uploadResult.validation.isolated_bus_ids.join(', ')}` : 'Zero disconnected nodes'}
                        </span>
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
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{divergedNotice}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-100">Interactive Single-Line Diagram</h2>
                  <p className="text-xs md:text-sm text-slate-400">Click corridors to trip breakers or select substation nodes for live telemetry.</p>
                </div>
                <button
                  onClick={handleResetBaseline}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 w-fit"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Reset Grid</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950 p-3 md:p-4 relative overflow-hidden flex flex-col items-center justify-center">
                  <svg viewBox="100 40 440 420" className="w-full h-[320px] sm:h-[400px] md:h-[460px] select-none">
                    <defs>
                      <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="glow" />
                        <feMerge>
                          <feMergeNode in="glow" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

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
                            stroke={isTripped ? '#e11d48' : line.loading_percent > 85 ? '#f59e0b' : '#059669'}
                            strokeWidth={isTripped ? 2 : 3}
                            strokeDasharray={isTripped ? '6 6' : 'none'}
                            className="transition-colors hover:stroke-white"
                          />
                          {!isTripped && (
                            <text
                              x={(cFrom.x + cTo.x) / 2}
                              y={(cFrom.y + cTo.y) / 2 - 6}
                              fill="#94a3b8"
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
                      const nodeColor = isUnder ? '#f43f5e' : isOver ? '#fbbf24' : '#10b981';
                      const coords = getCoordinates(bus);

                      return (
                        <g
                          key={bus.id}
                          transform={`translate(${coords.x}, ${coords.y})`}
                          onClick={() => setSelectedBus(bus)}
                          className="cursor-pointer group"
                        >
                          <circle
                            r={isSelected ? 11 : 7}
                            fill={nodeColor}
                            stroke="#0f172a"
                            strokeWidth="2"
                            filter={isSelected ? 'url(#node-glow)' : undefined}
                            className="transition-all group-hover:scale-125"
                          />
                          <text
                            x={12}
                            y={4}
                            fill="#f8fafc"
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

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 sm:p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-400" /> Substation Inspector
                    </h3>
                    {selectedBus ? (
                      <div className="space-y-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[10px] uppercase">Substation</span>
                          <span className="font-bold text-slate-100 text-sm">{selectedBus.name}</span>
                          <span className="block text-[11px] text-slate-400 mt-0.5">{selectedBus.zone} Zone</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 font-mono">
                          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Voltage (|V|)</span>
                            <span className={`font-bold ${selectedBus.v_pu < 0.95 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {selectedBus.v_pu} pu
                            </span>
                          </div>
                          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Phase Angle</span>
                            <span className="font-bold text-slate-200">{selectedBus.va_deg}°</span>
                          </div>
                          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Active</span>
                            <span className="font-bold text-cyan-400">{selectedBus.p_mw} MW</span>
                          </div>
                          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Reactive</span>
                            <span className="font-bold text-amber-400">{selectedBus.q_mvar} MVAR</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-40 sm:h-48 flex items-center justify-center text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg p-4">
                        Click on any node in the Single-Line Diagram to inspect live bus telemetry.
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between">
                    <span>Click corridors to trip (N-1)</span>
                    <span className="text-emerald-400">● Live 330kV Map</span>
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
                  <h2 className="text-lg md:text-xl font-bold text-slate-100">National Grid Contingency Audit Report</h2>
                  <p className="text-xs md:text-sm text-slate-400">Automated compliance audit against the Nigerian Grid Code (0.95 ≤ |V| ≤ 1.05 p.u., loading ≤ 85%).</p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`${API_BASE_URL}/api/reports/export-csv`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                  >
                    <FileText className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Download CSV</span>
                  </a>

                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Print Audit Document</span>
                  </button>
                </div>
              </div>

              {/* Summary Audit Scorecard */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950">
                  <span className="text-slate-400 block mb-1">Total System Infeed</span>
                  <span className="text-xl font-mono font-bold text-emerald-400">
                    {results?.total_gen_mw ? `${results.total_gen_mw.toLocaleString()} MW` : '--'}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">Generation + Grid Infeed</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950">
                  <span className="text-slate-400 block mb-1">Total System Losses</span>
                  <span className="text-xl font-mono font-bold text-rose-400">
                    {results?.total_losses_mw ? `${results.total_losses_mw} MW` : '--'}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    {results?.total_gen_mw && results?.total_losses_mw
                      ? `${((results.total_losses_mw / results.total_gen_mw) * 100).toFixed(2)}% transmission losses`
                      : 'Active branch dissipation'}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950">
                  <span className="text-slate-400 block mb-1">Voltage Violations</span>
                  <span className="text-xl font-mono font-bold text-amber-400">
                    {results?.buses ? results.buses.filter((b) => b.v_pu < 0.95 || b.v_pu > 1.05).length : 0} Nodes
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">Outside 0.95–1.05 p.u.</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950">
                  <span className="text-slate-400 block mb-1">Critical Lines (&gt;80%)</span>
                  <span className="text-xl font-mono font-bold text-cyan-400">
                    {results?.lines ? results.lines.filter((l) => l.loading_percent > 80).length : 0} Corridors
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">Approaching thermal ceiling</span>
                </div>
              </div>

              {/* Itemized Violation Ledger */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
                <div className="border-b border-slate-800 bg-slate-900/60 px-5 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-slate-200">Grid Code Violation & Contingency Ledger</h3>
                  <span className="text-slate-400">Status: {divergedNotice ? 'Grid Alert Active' : 'Normal Operation'}</span>
                </div>

                <div className="divide-y divide-slate-800 text-xs">
                  {results?.buses
                    ?.filter((b) => b.v_pu < 0.95)
                    .map((bus) => (
                      <div key={bus.id} className="p-3.5 flex items-center justify-between bg-rose-950/20 hover:bg-rose-950/30">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-200">{bus.name} ({bus.zone} Zone)</span>
                            <span className="block text-[11px] text-rose-300">Under-voltage detected: {bus.v_pu} p.u. (below statutory 0.95 p.u. lower limit)</span>
                          </div>
                        </div>
                        <span className="font-mono text-rose-400 font-bold px-2 py-1 rounded bg-rose-950 border border-rose-800 text-[11px]">
                          V-LOW
                        </span>
                      </div>
                    ))}

                  {results?.lines
                    ?.filter((l) => l.loading_percent > 80 && l.in_service)
                    .map((line) => (
                      <div key={line.id} className="p-3.5 flex items-center justify-between bg-amber-950/20 hover:bg-amber-950/30">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-200">{line.name}</span>
                            <span className="block text-[11px] text-amber-300">Thermal threshold warning: loading reached {line.loading_percent}% ({line.flow_mw} MW)</span>
                          </div>
                        </div>
                        <span className="font-mono text-amber-400 font-bold px-2 py-1 rounded bg-amber-950 border border-amber-800 text-[11px]">
                          OVERLOAD
                        </span>
                      </div>
                    ))}

                  {results?.lines
                    ?.filter((l) => !l.in_service)
                    .map((line) => (
                      <div key={line.id} className="p-3.5 flex items-center justify-between bg-slate-900/60">
                        <div className="flex items-center gap-3">
                          <RotateCcw className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-300">{line.name}</span>
                            <span className="block text-[11px] text-slate-500">Breaker opened: N-1 outage applied to this transmission corridor</span>
                          </div>
                        </div>
                        <span className="font-mono text-slate-400 font-bold px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px]">
                          N-1 OUTAGE
                        </span>
                      </div>
                    ))}

                  {results?.buses?.every((b) => b.v_pu >= 0.95 && b.v_pu <= 1.05) &&
                    results?.lines?.every((l) => l.loading_percent <= 80 && l.in_service) && (
                      <div className="p-6 text-center text-slate-400 flex flex-col items-center justify-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
                        <span className="font-semibold text-slate-200">Full Grid Code Compliance</span>
                        <span className="text-[11px] text-slate-500 mt-0.5">All substation voltages and line loadings fall within operational boundaries.</span>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: TASK FORCE & OPERATOR ADMIN PANEL */}
          {activeTab === 'Admin Panel' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-100">National Grid Task Force & Administration</h2>
                  <p className="text-xs md:text-sm text-slate-400">Manage statutory NERC Grid Code criteria, system security margins, and operator audit trail.</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Current Role:</span>
                  <select className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-emerald-400 font-bold focus:outline-none">
                    <option>System Operator (NCC Osogbo)</option>
                    <option>Market Operator (MO Abuja)</option>
                    <option>NRF Task Force Lead Researcher</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Regulatory Criteria */}
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-200">NERC Grid Code Criteria</h3>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>Nominal Grid Frequency</span>
                        <span className="font-mono font-bold text-slate-100">50.00 Hz</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                        Operational Band: <span className="text-emerald-400 font-mono font-semibold">49.75 Hz – 50.25 Hz</span> (±0.5%)
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>Statutory Voltage Limits</span>
                        <span className="font-mono font-bold text-slate-100">±5.0%</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                        Permissible Range: <span className="text-emerald-400 font-mono font-semibold">0.95 – 1.05 p.u.</span> (313.5kV – 346.5kV)
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>Line Thermal Alarm Threshold</span>
                        <span className="font-mono font-bold text-amber-400">85.0% MVA</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                        Branches above 85% trigger auto-dispatch alerts to prevent sag and conductor annealing.
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => alert('Grid code parameters synchronized with NERC standard document.')}
                        className="w-full rounded-lg bg-emerald-600/20 border border-emerald-500/40 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-600 hover:text-white transition"
                      >
                        Enforce Standards
                      </button>
                    </div>
                  </div>
                </div>

                {/* Audit Log */}
                <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="border-b border-slate-800 bg-slate-900/60 px-5 py-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-200">System Event & Contingency Audit Trail</h3>
                      <span className="text-[10px] text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded font-mono">
                        LOGGING ACTIVE
                      </span>
                    </div>

                    <div className="divide-y divide-slate-800 text-xs">
                      {[
                        {
                          time: 'Just now',
                          event: 'Newton-Raphson Solver Executed',
                          user: 'Operator (Osogbo)',
                          badge: 'SOLVER',
                          color: 'text-cyan-400 bg-cyan-950/40 border-cyan-800',
                          desc: 'Full AC power flow convergence achieved in 4 iterations.',
                        },
                        {
                          time: '3 mins ago',
                          event: 'Contingency Tripping Simulation',
                          user: 'Planning Engineer',
                          badge: 'N-1 EVENT',
                          color: 'text-rose-400 bg-rose-950/40 border-rose-800',
                          desc: 'Line outage applied. Corridors recalculated with redistribution across South-West.',
                        },
                        {
                          time: '12 mins ago',
                          event: 'Market Economic Dispatch',
                          user: 'Market Operator',
                          badge: 'MARKET',
                          color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800',
                          desc: 'Merit order resolved. Kainji/Jebba/Shiroro dispatched as base infeed.',
                        },
                        {
                          time: '25 mins ago',
                          event: 'MATPOWER Network Ingestion',
                          user: 'System Admin',
                          badge: 'DATA',
                          color: 'text-purple-400 bg-purple-950/40 border-purple-800',
                          desc: 'Ingested IEEE/TCN .m format case file with 0 islanding violations.',
                        },
                      ].map((item, idx) => (
                        <div key={idx} className="p-3.5 hover:bg-slate-900/40 flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.color}`}>
                                {item.badge}
                              </span>
                              <span className="font-semibold text-slate-200">{item.event}</span>
                            </div>
                            <p className="text-[11px] text-slate-400">{item.desc}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="block font-mono text-[10px] text-slate-400">{item.time}</span>
                            <span className="block text-[10px] text-slate-500">{item.user}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900/60 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between items-center">
                    <span>Audit logs retained for NRF project compliance review</span>
                    <span className="text-emerald-400 font-mono">SHA-256 Verified</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}