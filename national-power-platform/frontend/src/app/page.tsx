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

interface UploadValidation {
  status: string;
  filename: string;
  format: string;
  converged: boolean;
  network_payload: string;
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

interface GridModelMeta {
  id: string;
  name: string;
  format?: string;
  uploaded_at: string;
  buses: number;
  branches: number;
  total_installed_mw: number;
  total_demand_mw: number;
  converged: boolean;
  is_default: boolean;
  is_active: boolean;
  network_payload?: string;
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

const GEOGRAPHIC_COORDS: Record<number, { x: number; y: number }> = {
  0: { x: 170, y: 80 },   // Kainji
  1: { x: 210, y: 150 },  // Jebba
  2: { x: 360, y: 110 },  // Shiroro
  3: { x: 410, y: 180 },  // Katampe/Abuja
  4: { x: 250, y: 250 },  // Osogbo
  5: { x: 150, y: 340 },  // Ikeja West
  6: { x: 220, y: 390 },  // Egbin
  7: { x: 340, y: 330 },  // Benin
  8: { x: 440, y: 380 },  // Afam
};

// Standard IEEE Control-Room 3-Tier Busbar Layout
const SCHEMATIC_BUSBARS: Record<number, { x: number; y: number; width: number; isGen?: boolean; isLoad?: boolean }> = {
  0: { x: 130, y: 90, width: 65, isGen: true },       // Kainji (Hydro Gen)
  1: { x: 240, y: 90, width: 65, isGen: true },       // Jebba (Hydro Gen)
  2: { x: 360, y: 90, width: 65, isGen: true },       // Shiroro (Hydro Gen)
  3: { x: 460, y: 90, width: 60, isLoad: true },      // Katampe (Load)
  4: { x: 250, y: 230, width: 90, isLoad: true },     // Osogbo (Central Interconnection)
  7: { x: 400, y: 230, width: 90, isLoad: true },     // Benin (Load & Mid-Station)
  5: { x: 140, y: 350, width: 70, isLoad: true },     // Ikeja West (Major Industrial Load)
  6: { x: 260, y: 350, width: 70, isGen: true },      // Egbin (Thermal Slack Gen)
  8: { x: 440, y: 350, width: 70, isGen: true },      // Afam (Gas Turbine Gen)
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

  // Diagram Layout Toggle: 'geographic' vs 'schematic'
  const [diagramView, setDiagramView] = useState<'geographic' | 'schematic'>('geographic');

  // Authentication State
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  // Upload & Model Management State
  const [modelList, setModelList] = useState<GridModelMeta[]>([]);
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
    { id: 'Data Upload', label: 'Data Upload/Down-', icon: UploadCloud },
    { id: 'Visualization', label: 'Visualization Tools', icon: TrendingUp },
    { id: 'Reports', label: 'Reports & Publicati-', icon: FileText },
    { id: 'Admin Panel', label: 'Task Force/Admin Panel', icon: ShieldCheck },
  ];

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMsg(null);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setAuthMsg('Registration complete! You may now sign in.');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setShowAuthModal(false);
      }
    } catch (err: any) {
      setAuthMsg(err.message || 'Authentication failed');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/models`);
      let backendModels: GridModelMeta[] = [];
      if (res.ok) {
        backendModels = await res.json();
      }

      const { data: dbModels } = await supabase
        .from('grid_models')
        .select('*')
        .order('created_at', { ascending: false });

      if (dbModels && dbModels.length > 0) {
        const mappedDbModels: GridModelMeta[] = dbModels.map((m: any) => ({
          id: m.id,
          name: m.name,
          format: m.format,
          uploaded_at: new Date(m.created_at).toLocaleDateString(),
          buses: m.buses,
          branches: m.branches,
          total_installed_mw: Number(m.total_installed_mw),
          total_demand_mw: Number(m.total_demand_mw),
          converged: m.converged,
          is_default: m.is_default,
          is_active: backendModels.some((bm) => bm.id === m.id && bm.is_active),
          network_payload: m.network_payload,
        }));

        const baseline = backendModels.find((m) => m.is_default);
        const combined = baseline ? [baseline, ...mappedDbModels.filter((m) => m.id !== baseline.id)] : mappedDbModels;
        setModelList(combined);
      } else {
        setModelList(backendModels);
      }
    } catch {
      // Ignore network fallback
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
    fetchModels();
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
      const res = await fetch(`${API_BASE_URL}/api/upload/model`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Server returned ${res.status}`);
      }

      const data: UploadValidation = await res.json();
      setUploadResult(data);

      try {
        await supabase.from('grid_models').insert({
          id: data.filename.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now().toString(36),
          name: data.filename,
          format: data.format,
          buses: data.metrics.buses,
          branches: data.metrics.branches,
          total_installed_mw: data.metrics.total_installed_mw,
          total_demand_mw: data.metrics.total_demand_mw,
          converged: data.converged,
          network_payload: data.network_payload,
          user_id: user?.id ?? null,
        });
      } catch (dbErr) {
        console.warn('Supabase DB save note:', dbErr);
      }

      setTrippedLines([]);
      setLoadMultiplier(1.0);
      setSelectedBus(null);
      await fetchModels();
      await runSimulation(1.0, []);
      await runMarketSimulation();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse model case');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleActivateModel = async (model: GridModelMeta) => {
    setLoading(true);
    try {
      if (model.network_payload) {
        await fetch(`${API_BASE_URL}/api/models/load-payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: model.id,
            name: model.name,
            network_payload: model.network_payload,
          }),
        });
      } else {
        await fetch(`${API_BASE_URL}/api/models/${model.id}/activate`, { method: 'POST' });
      }

      setTrippedLines([]);
      setLoadMultiplier(1.0);
      setSelectedBus(null);
      await fetchModels();
      await runSimulation(1.0, []);
      await runMarketSimulation();
    } catch {
      setDivergedNotice('Failed to activate selected model.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm('Are you sure you want to remove this model from the repository?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/models/${modelId}`, { method: 'DELETE' });
      await supabase.from('grid_models').delete().eq('id', modelId);
      await fetchModels();
      await runSimulation(1.0, []);
      await runMarketSimulation();
    } catch {
      alert('Could not remove model.');
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
      await fetchModels();
      await runSimulation(1.0, []);
      await runMarketSimulation();
    } catch {
      setDivergedNotice('Failed to reset grid.');
    } finally {
      setLoading(false);
    }
  };

  const getCoordinates = (bus: BusData) => {
    if (diagramView === 'schematic') {
      const sch = SCHEMATIC_BUSBARS[bus.id];
      if (sch) return { x: sch.x, y: sch.y };
    }
    if (bus.x !== undefined && bus.y !== undefined) {
      return { x: bus.x, y: bus.y };
    }
    return GEOGRAPHIC_COORDS[bus.id] || { x: 250, y: 250 };
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-900 font-sans text-slate-100 antialiased overflow-hidden">
      {/* Header */}
      <header className="flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-950 px-4 md:px-6 z-20 select-none shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 shrink-0">
            <Zap className="h-5 w-5 fill-current" />
          </div>

          <div className="leading-tight">
            <h1 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-100">
              National Power System Modelling
            </h1>
            <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400">
              and Simulation Platform (Nigeria)
            </p>
          </div>
        </div>

        {/* Operator Profile / Login Button */}
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline font-mono text-xs text-emerald-400 truncate max-w-[180px]">
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Login</span>
          </button>
        )}
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
                <nav className="space-y-1.5">
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
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                          isActive
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
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

              <div className="pt-3 border-t border-slate-800">
                <button
                  onClick={handleResetBaseline}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 py-2 text-xs font-medium text-slate-300 transition hover:text-white disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Reset Grid</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-60 border-r border-slate-800 bg-slate-950 p-3.5 flex-col justify-between shrink-0 select-none">
          <nav className="space-y-1.5">
            {navItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition ${
                    isActive
                      ? 'bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-900/30'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-slate-800">
            <button
              onClick={handleResetBaseline}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 py-2 text-xs font-medium text-slate-300 transition hover:text-white disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
              <span>Reset Grid</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 overflow-y-auto bg-slate-900 p-6 sm:p-8">
          {/* TAB 1: HOME */}
          {activeTab === 'Home' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    title: 'GRID STABILITY MODELS',
                    desc: 'Newton-Raphson power flow, N-1 contingency studies, and transient frequency response.',
                    icon: TrendingUp,
                    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30 text-blue-400',
                    action: () => setActiveTab('Grid Models'),
                  },
                  {
                    title: 'MARKET SIMULATION MODELS',
                    desc: 'Merit order dispatch, locational marginal pricing (LMP), and hydro-thermal generation optimization.',
                    icon: DollarSign,
                    color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
                    action: () => setActiveTab('Market Simulations'),
                  },
                  {
                    title: 'DATA UPLOAD & VALIDATION',
                    desc: 'SCADA telemetry ingestion, multi-format model parser, and automated topology error checking.',
                    icon: UploadCloud,
                    color: 'from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-400',
                    action: () => setActiveTab('Data Upload'),
                  },
                  {
                    title: 'REPORTS & VISUALIZATION',
                    desc: 'Single-line diagrams, voltage profile heatmaps, transmission congestion, and PDF audit exports.',
                    icon: BarChart3,
                    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400',
                    action: () => setActiveTab('Visualization'),
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      onClick={card.action}
                      className={`group cursor-pointer rounded-xl border bg-gradient-to-br p-8 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${card.color}`}
                    >
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-950/60 border border-slate-800 shadow-inner group-hover:scale-110 transition-transform">
                        <Icon className="h-7 w-7 stroke-[1.75]" />
                      </div>
                      <h3 className="text-base font-bold tracking-wider text-slate-100 group-hover:text-white">
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
                  <p className="text-xs text-slate-400">
                    Active Grid Model: <span className="text-emerald-400 font-mono font-bold">{results?.model_name || 'Nigeria 330kV'}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
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
                  <span className="text-slate-400 hidden sm:inline">Statutory Band: 0.95 – 1.05 p.u.</span>
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

              {/* Line Breaker Controls */}
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
                  <p className="text-xs text-slate-400">Merit-order generation scheduling and Locational Marginal Pricing (LMP).</p>
                </div>

                <button
                  onClick={runMarketSimulation}
                  disabled={marketLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50 w-fit"
                >
                  {marketLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{marketLoading ? 'Solving...' : 'Run Economic Dispatch'}</span>
                </button>
              </div>

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
                <div className="border-b border-slate-800 bg-slate-900/60 px-5 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-slate-200">Merit Order Generation Dispatch Stack</h3>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-cyan-400">Hydro: {marketResults?.hydro_share_percent || 0}%</span>
                    <span className="text-amber-400">Thermal: {marketResults?.thermal_share_percent || 0}%</span>
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
                          <td className="p-3 font-mono">{gen.capacity_utilization}%</td>
                          <td className="p-3 font-mono text-slate-200">₦{gen.hourly_cost_ngn.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DATA UPLOAD & CASE LIBRARY */}
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
                  <h2 className="text-lg md:text-xl font-bold text-slate-100">Grid Model Ingestion & Case Library</h2>
                  <p className="text-xs md:text-sm text-slate-400">Ingest, manage, and persist network topologies (.m, .json, .xlsx, .raw).</p>
                </div>
              </div>

              {/* Multi-Format Upload Dropzone */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 space-y-6">
                <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-8 text-center transition flex flex-col items-center justify-center bg-slate-900/40">
                  <UploadCloud className="h-10 w-10 sm:h-12 sm:w-12 text-slate-400 mb-3" />
                  <p className="text-xs sm:text-sm font-semibold text-slate-200">
                    Select or drop grid case files
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Supports MATPOWER (.m), Pandapower (.json), Excel spreadsheets (.xlsx), and PSS/E (.raw)
                  </p>

                  <input
                    type="file"
                    id="fileUploadInput"
                    accept=".m,.json,.xlsx,.xls,.raw"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <label
                    htmlFor="fileUploadInput"
                    className={`mt-4 cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 ${
                      uploadLoading ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    {uploadLoading ? 'Parsing Case...' : 'Browse Model File'}
                  </label>
                </div>
              </div>

              {/* Model Repository Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
                <div className="border-b border-slate-800 bg-slate-900/60 px-5 py-3.5 flex justify-between items-center text-xs">
                  <div>
                    <h3 className="font-bold text-slate-200">Model Repository</h3>
                    <p className="text-[11px] text-slate-400">All registered network topologies available for simulation.</p>
                  </div>
                  <span className="font-mono text-emerald-400 text-xs">{modelList.length} Model{modelList.length !== 1 ? 's' : ''} Loaded</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[650px]">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 font-mono">
                      <tr>
                        <th className="p-3">Active</th>
                        <th className="p-3">Model Name</th>
                        <th className="p-3">Format</th>
                        <th className="p-3">Buses</th>
                        <th className="p-3">Branches</th>
                        <th className="p-3">Capacity</th>
                        <th className="p-3">Demand</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {modelList.map((model) => (
                        <tr key={model.id} className={`hover:bg-slate-900/40 transition ${model.is_active ? 'bg-emerald-950/15' : ''}`}>
                          <td className="p-3">
                            <span className="flex items-center">
                              {model.is_active ? (
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" title="Active Model"></span>
                              ) : (
                                <span className="h-2.5 w-2.5 rounded-full bg-slate-700" title="Inactive"></span>
                              )}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-100">
                            <div className="flex items-center gap-2">
                              <FileCode className="h-4 w-4 text-emerald-400 shrink-0" />
                              <span className="truncate max-w-[180px]">{model.name}</span>
                              {model.is_default && (
                                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 border border-slate-700">
                                  Default
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-mono text-slate-400 text-[11px]">{model.format || 'MATPOWER'}</td>
                          <td className="p-3 font-mono">{model.buses}</td>
                          <td className="p-3 font-mono">{model.branches}</td>
                          <td className="p-3 font-mono text-cyan-400">{model.total_installed_mw} MW</td>
                          <td className="p-3 font-mono text-amber-400">{model.total_demand_mw} MW</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {!model.is_active ? (
                                <button
                                  onClick={() => handleActivateModel(model)}
                                  className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-emerald-600 hover:border-emerald-500 hover:text-white transition"
                                >
                                  Activate
                                </button>
                              ) : (
                                <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-800">
                                  Current
                                </span>
                              )}

                              {!model.is_default && (
                                <button
                                  onClick={() => handleDeleteModel(model.id)}
                                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition"
                                  title="Delete Model"
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

          {/* TAB 5: VISUALIZATION TOOLS (WITH DUAL-VIEW TOGGLE) */}
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
                  <p className="text-xs text-slate-400">
                    {diagramView === 'geographic'
                      ? 'Geographic spatial layout of the 330kV transmission network.'
                      : 'IEEE standard busbar schematic with synchronous generators, feeder loads, and breakers.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* View Mode Toggle */}
                  <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                    <button
                      onClick={() => setDiagramView('geographic')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                        diagramView === 'geographic'
                          ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span>Geographic</span>
                    </button>
                    <button
                      onClick={() => setDiagramView('schematic')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                        diagramView === 'schematic'
                          ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>Busbar (IEEE)</span>
                    </button>
                  </div>

                  <button
                    onClick={handleResetBaseline}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 w-fit"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* SVG Vector Canvas */}
                <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950 p-3 md:p-4 relative overflow-hidden flex flex-col items-center justify-center">
                  <svg viewBox="90 30 430 390" className="w-full h-[360px] sm:h-[440px] select-none">
                    <defs>
                      <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="glow" />
                        <feMerge>
                          <feMergeNode in="glow" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* Transmission Corridors */}
                    {results?.lines.map((line) => {
                      const fromBus = results.buses.find((b) => b.id === line.from_bus);
                      const toBus = results.buses.find((b) => b.id === line.to_bus);
                      if (!fromBus || !toBus) return null;

                      const cFrom = getCoordinates(fromBus);
                      const cTo = getCoordinates(toBus);
                      const isTripped = trippedLines.includes(line.id);

                      // Calculate midpoint for circuit breaker symbol
                      const midX = (cFrom.x + cTo.x) / 2;
                      const midY = (cFrom.y + cTo.y) / 2;

                      const strokeColor = isTripped
                        ? '#e11d48'
                        : line.loading_percent > 85
                        ? '#f59e0b'
                        : '#059669';

                      return (
                        <g key={line.id} className="cursor-pointer group" onClick={() => toggleLine(line.id)}>
                          <line
                            x1={cFrom.x}
                            y1={cFrom.y}
                            x2={cTo.x}
                            y2={cTo.y}
                            stroke={strokeColor}
                            strokeWidth={isTripped ? 2 : 2.5}
                            strokeDasharray={isTripped ? '6 6' : 'none'}
                            className="transition-colors group-hover:stroke-white"
                          />

                          {/* Circuit Breaker Box (IEEE Standard) */}
                          <rect
                            x={midX - 5}
                            y={midY - 5}
                            width={10}
                            height={10}
                            rx={1.5}
                            fill={isTripped ? '#881337' : '#064e3b'}
                            stroke={isTripped ? '#f43f5e' : '#10b981'}
                            strokeWidth="1.5"
                            className="transition-transform group-hover:scale-125"
                          />

                          {!isTripped && (
                            <text
                              x={midX}
                              y={midY - 8}
                              fill="#94a3b8"
                              fontSize="8"
                              textAnchor="middle"
                              className="font-mono font-semibold select-none pointer-events-none"
                            >
                              {line.flow_mw} MW
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Substation Nodes & Busbars */}
                    {results?.buses.map((bus) => {
                      const isSelected = selectedBus?.id === bus.id;
                      const isUnder = bus.v_pu < 0.95;
                      const isOver = bus.v_pu > 1.05;
                      const nodeColor = isUnder ? '#f43f5e' : isOver ? '#fbbf24' : '#10b981';
                      const coords = getCoordinates(bus);

                      // VIEW 1: Electrical Busbar Schematic (IEEE)
                      if (diagramView === 'schematic') {
                        const sch = SCHEMATIC_BUSBARS[bus.id] || { width: 60 };
                        const barW = sch.width;

                        return (
                          <g
                            key={bus.id}
                            transform={`translate(${coords.x}, ${coords.y})`}
                            onClick={() => setSelectedBus(bus)}
                            className="cursor-pointer group"
                          >
                            {/* Horizontal Solid Busbar */}
                            <rect
                              x={-barW / 2}
                              y={-3}
                              width={barW}
                              height={6}
                              rx={1.5}
                              fill={isSelected ? '#38bdf8' : nodeColor}
                              stroke="#0f172a"
                              strokeWidth="1.5"
                              filter={isSelected ? 'url(#node-glow)' : undefined}
                              className="transition-all group-hover:brightness-125"
                            />

                            {/* Generator Component (Circle with Sine Wave) */}
                            {sch.isGen && (
                              <g transform="translate(0, -26)">
                                <line x1="0" y1="23" x2="0" y2="10" stroke="#94a3b8" strokeWidth="1.5" />
                                <circle r="10" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
                                <path
                                  d="M -5 0 Q -2.5 -4 0 0 Q 2.5 4 5 0"
                                  fill="none"
                                  stroke="#38bdf8"
                                  strokeWidth="1.5"
                                />
                              </g>
                            )}

                            {/* Load Component (Downward Arrow) */}
                            {sch.isLoad && (
                              <g transform="translate(0, 15)">
                                <line x1="0" y1="-12" x2="0" y2="4" stroke="#94a3b8" strokeWidth="1.5" />
                                <path d="M 0 10 L -4 4 L 4 4 Z" fill="#f59e0b" stroke="#f59e0b" />
                              </g>
                            )}

                            {/* Bus Identification Label */}
                            <text
                              x="0"
                              y={sch.isLoad ? 24 : -12}
                              fill="#f8fafc"
                              fontSize="8"
                              fontFamily="monospace"
                              fontWeight="bold"
                              textAnchor="middle"
                            >
                              {bus.name.split(' ')[0]}
                            </text>
                          </g>
                        );
                      }

                      // VIEW 2: Geographic Network Map
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

                {/* Substation Inspector */}
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
                        Click on any substation or busbar in the diagram to inspect live telemetry.
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between">
                    <span>Click breaker squares to trip (N-1)</span>
                    <span className="text-emerald-400">
                      {diagramView === 'geographic' ? '● Geographic View' : '● IEEE Busbar View'}
                    </span>
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
                  <p className="text-xs text-slate-400">Grid Code compliance audit (0.95 ≤ |V| ≤ 1.05 p.u., loading ≤ 85%).</p>
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
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950">
                  <span className="text-slate-400 block mb-1">Total System Losses</span>
                  <span className="text-xl font-mono font-bold text-rose-400">
                    {results?.total_losses_mw ? `${results.total_losses_mw} MW` : '--'}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950">
                  <span className="text-slate-400 block mb-1">Voltage Violations</span>
                  <span className="text-xl font-mono font-bold text-amber-400">
                    {results?.buses ? results.buses.filter((b) => b.v_pu < 0.95 || b.v_pu > 1.05).length : 0} Nodes
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950">
                  <span className="text-slate-400 block mb-1">Critical Lines (&gt;80%)</span>
                  <span className="text-xl font-mono font-bold text-cyan-400">
                    {results?.lines ? results.lines.filter((l) => l.loading_percent > 80).length : 0} Corridors
                  </span>
                </div>
              </div>

              {/* Itemized Violation Ledger */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
                <div className="border-b border-slate-800 bg-slate-900/60 px-5 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-slate-200">Grid Code Violation & Contingency Ledger</h3>
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
                            <span className="block text-[11px] text-rose-300">Under-voltage detected: {bus.v_pu} p.u.</span>
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
                            <span className="block text-[11px] text-amber-300">Loading reached {line.loading_percent}% ({line.flow_mw} MW)</span>
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
                            <span className="block text-[11px] text-slate-500">Breaker opened: N-1 outage applied to corridor</span>
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
                  <p className="text-xs text-slate-400">Statutory NERC Grid Code criteria and system security margins.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-200">NERC Grid Code Criteria</h3>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between border-b border-slate-900 pb-2">
                      <span className="text-slate-400">Nominal Grid Frequency</span>
                      <span className="font-mono font-bold text-slate-100">50.00 Hz (±0.5%)</span>
                    </div>

                    <div className="flex justify-between border-b border-slate-900 pb-2">
                      <span className="text-slate-400">Statutory Voltage Limits</span>
                      <span className="font-mono font-bold text-slate-100">0.95 – 1.05 p.u.</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Line Thermal Alarm Threshold</span>
                      <span className="font-mono font-bold text-amber-400">85.0% Loading</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">System Authority</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Operated under the National Research Fund (NRF) Power Systems Research Initiative for bulk transmission networks.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Operator Login Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                {isSignUp ? 'Register Operator' : 'Operator Login'}
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAuth} className="mt-4 space-y-3">
              {authMsg && (
                <div className="p-2 rounded bg-emerald-950/60 border border-emerald-800 text-[11px] text-emerald-300">
                  {authMsg}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  placeholder="operator@ncc.gov.ng"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition"
              >
                {isSignUp ? 'Create Operator Account' : 'Sign In'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setAuthMsg(null);
                  }}
                  className="text-[11px] text-slate-400 hover:text-emerald-400 transition"
                >
                  {isSignUp ? 'Already registered? Sign In' : 'Need an operator account? Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}