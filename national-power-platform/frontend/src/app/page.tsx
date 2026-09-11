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
  0: { x: 140, y: 90 },
  1: { x: 200, y: 160 },
  2: { x: 380, y: 110 },
  3: { x: 450, y: 180 },
  4: { x: 260, y: 260 },
  5: { x: 130, y: 350 },
  6: { x: 220, y: 400 },
  7: { x: 370, y: 330 },
  8: { x: 490, y: 390 },
};

interface BusbarConfig {
  x: number;
  y: number;
  width: number;
  isGen?: boolean;
  genName?: string;
  isLoad?: boolean;
}

const SCHEMATIC_BUSBARS: Record<number, BusbarConfig> = {
  0: { x: 100, y: 85, width: 70, isGen: true, genName: 'Kainji GS' },
  1: { x: 280, y: 85, width: 70, isGen: true, genName: 'Jebba GS' },
  2: { x: 480, y: 85, width: 70, isGen: true, genName: 'Shiroro GS' },
  3: { x: 670, y: 85, width: 65, isLoad: true },
  4: { x: 280, y: 250, width: 90, isLoad: true },
  7: { x: 530, y: 250, width: 90, isLoad: true },
  5: { x: 100, y: 410, width: 70, isLoad: true },
  6: { x: 280, y: 410, width: 70, isGen: true, genName: 'Egbin PS' },
  8: { x: 530, y: 410, width: 70, isGen: true, genName: 'Afam GS' },
};

interface OrthogonalRoute {
  path: string;
  breaker: { x: number; y: number };
  label: { x: number; y: number };
}

const ORTHOGONAL_CORRIDORS: Record<string, OrthogonalRoute> = {
  '0-1': { path: 'M 135 85 L 245 85', breaker: { x: 190, y: 85 }, label: { x: 190, y: 68 } },
  '1-2': { path: 'M 315 85 L 445 85', breaker: { x: 380, y: 85 }, label: { x: 380, y: 68 } },
  '2-3': { path: 'M 515 85 L 637 85', breaker: { x: 576, y: 85 }, label: { x: 576, y: 68 } },
  '1-4': { path: 'M 280 88 L 280 247', breaker: { x: 280, y: 167 }, label: { x: 280, y: 147 } },
  '4-5': { path: 'M 245 253 L 200 253 L 200 345 L 100 345 L 100 407', breaker: { x: 150, y: 345 }, label: { x: 150, y: 327 } },
  '5-6': { path: 'M 135 410 L 245 410', breaker: { x: 190, y: 410 }, label: { x: 190, y: 428 } },
  '4-7': { path: 'M 325 250 L 485 250', breaker: { x: 405, y: 250 }, label: { x: 405, y: 232 } },
  '7-6': { path: 'M 500 253 L 500 335 L 305 335 L 305 407', breaker: { x: 400, y: 335 }, label: { x: 400, y: 317 } },
  '7-8': { path: 'M 530 253 L 530 407', breaker: { x: 530, y: 330 }, label: { x: 530, y: 310 } },
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

  const [diagramView, setDiagramView] = useState<'schematic' | 'geographic'>('schematic');

  // Authentication State
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  // Model Management State
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

  const getGeoCoordinates = (bus: BusData) => {
    if (bus.x !== undefined && bus.y !== undefined) {
      return { x: bus.x, y: bus.y };
    }
    return GEOGRAPHIC_COORDS[bus.id] || { x: 250, y: 250 };
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#14080e] font-sans text-stone-100 antialiased overflow-hidden">
      {/* Executive Header */}
      <header className="flex h-16 w-full items-center justify-between border-b border-[#361327] bg-[#1a0c15] px-4 md:px-6 z-20 select-none shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-[#2c1223] transition"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#881337]/25 border border-[#9f1239]/40 text-[#fda4af] shrink-0">
            <Zap className="h-5 w-5 fill-current" />
          </div>

          <div className="leading-tight">
            <h1 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-stone-100">
              National Power System Modelling
            </h1>
            <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-stone-400">
              and Simulation Platform (Nigeria)
            </p>
          </div>
        </div>

        {/* Operator Profile / Login Button */}
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline font-mono text-xs text-[#fda4af] truncate max-w-[180px]">
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg border border-[#4a1c36] bg-[#220d1c] px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-[#34142b] hover:text-white transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-2 rounded-lg border border-[#4a1c36] bg-[#220d1c] px-4 py-1.5 text-xs font-semibold text-stone-200 transition hover:bg-[#34142b] hover:text-white"
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
            className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <aside
              className="w-64 h-full bg-[#180a13] border-r border-[#361327] p-4 flex flex-col justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#361327]">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-400">Navigation</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-stone-400 hover:text-white">
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
                            ? 'bg-[#881337] text-white shadow-lg shadow-[#881337]/30'
                            : 'text-stone-400 hover:bg-[#250f1d] hover:text-stone-200'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="pt-3 border-t border-[#361327]">
                <button
                  onClick={handleResetBaseline}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#220d1c] hover:bg-[#321329] border border-[#4a1c36] py-2 text-xs font-medium text-stone-300 transition hover:text-white disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#fda4af]" />
                  <span>Reset Grid</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-60 border-r border-[#361327] bg-[#180a13] p-3.5 flex-col justify-between shrink-0 select-none">
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
                      ? 'bg-[#881337] text-white font-semibold shadow-md shadow-[#881337]/30'
                      : 'text-stone-400 hover:bg-[#250f1d] hover:text-stone-200'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-[#361327]">
            <button
              onClick={handleResetBaseline}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#220d1c] hover:bg-[#321329] border border-[#4a1c36] py-2 text-xs font-medium text-stone-300 transition hover:text-white disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[#fda4af]" />
              <span>Reset Grid</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 overflow-y-auto bg-[#14080e] p-6 sm:p-8">
          {/* TAB 1: HOME */}
          {activeTab === 'Home' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    title: 'GRID STABILITY MODELS',
                    desc: 'Newton-Raphson power flow, N-1 contingency studies, and transient frequency response.',
                    icon: TrendingUp,
                    action: () => setActiveTab('Grid Models'),
                  },
                  {
                    title: 'MARKET SIMULATION MODELS',
                    desc: 'Merit order dispatch, locational marginal pricing (LMP), and hydro-thermal generation optimization.',
                    icon: DollarSign,
                    action: () => setActiveTab('Market Simulations'),
                  },
                  {
                    title: 'DATA UPLOAD & VALIDATION',
                    desc: 'SCADA telemetry ingestion, multi-format model parser, and automated topology error checking.',
                    icon: UploadCloud,
                    action: () => setActiveTab('Data Upload'),
                  },
                  {
                    title: 'REPORTS & VISUALIZATION',
                    desc: 'Single-line diagrams, voltage profile heatmaps, transmission congestion, and PDF audit exports.',
                    icon: BarChart3,
                    action: () => setActiveTab('Visualization'),
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      onClick={card.action}
                      className="group cursor-pointer rounded-xl border border-[#3b152b] bg-[#1d0c18] p-8 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[#881337] hover:shadow-lg hover:shadow-[#881337]/10"
                    >
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#281021] border border-[#4e1d3a] shadow-inner text-[#fda4af] group-hover:scale-105 group-hover:bg-[#881337]/30 transition-transform">
                        <Icon className="h-7 w-7 stroke-[1.75]" />
                      </div>
                      <h3 className="text-base font-bold tracking-wider text-stone-100 group-hover:text-white">
                        {card.title}
                      </h3>
                      <p className="mt-2 text-xs text-stone-400 leading-relaxed">{card.desc}</p>
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
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{divergedNotice}</span>
                </div>
              )}

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-stone-100">Static Power Flow & Contingency</h2>
                  <p className="text-xs text-stone-400">
                    Active Grid Model: <span className="text-[#fda4af] font-mono font-bold">{results?.model_name || 'Nigeria 330kV'}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 bg-[#1b0c16] px-3 py-1.5 rounded-lg border border-[#3b152b] text-xs">
                    <Sliders className="h-3.5 w-3.5 text-stone-400" />
                    <span className="text-stone-400 hidden sm:inline">Load:</span>
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
                      className="w-16 sm:w-20 accent-[#be123c] cursor-pointer"
                    />
                    <span className="font-mono font-bold text-[#fda4af]">{(loadMultiplier * 100).toFixed(0)}%</span>
                  </div>

                  <button
                    onClick={() => runSimulation()}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg bg-[#881337] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#9f1239] active:scale-95 disabled:opacity-50 shadow-sm shadow-[#881337]/30"
                  >
                    {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    <span>Solve</span>
                  </button>

                  <button
                    onClick={handleResetBaseline}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg border border-[#4a1c36] bg-[#220d1c] px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-[#331329] transition disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-[#fda4af]" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* Substation Bus Voltages Table */}
              <div className="rounded-xl border border-[#361327] bg-[#1a0c15] overflow-hidden shadow-sm">
                <div className="border-b border-[#361327] bg-[#160a12] px-4 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-stone-200">Substation Bus Voltage Profiles</h3>
                  <span className="text-stone-400 hidden sm:inline">Statutory Band: 0.95 – 1.05 p.u.</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[550px]">
                    <thead className="bg-[#14080e] text-stone-400 border-b border-[#361327]">
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
                    <tbody className="divide-y divide-[#361327] text-stone-300">
                      {results?.buses?.map((bus) => {
                        const isUnder = bus.v_pu < 0.95;
                        const isOver = bus.v_pu > 1.05;
                        return (
                          <tr key={bus.id} className="hover:bg-[#240f1d]/50">
                            <td className="p-3 font-mono font-bold text-stone-500">#{bus.id}</td>
                            <td className="p-3 font-semibold text-stone-100">{bus.name}</td>
                            <td className="p-3 text-stone-400">{bus.zone}</td>
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
              <div className="rounded-xl border border-[#361327] bg-[#1a0c15] p-4 sm:p-5">
                <h3 className="text-sm font-bold text-stone-200 mb-1">N-1 Line Contingency & Breaker Controls</h3>
                <p className="text-xs text-stone-400 mb-4">Click "Trip" to open a breaker and observe power redistribution across adjacent corridors.</p>

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
                            : 'border-[#381629] bg-[#150911]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-stone-200 truncate">{line.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            !isTripped ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {!isTripped ? 'Online' : 'Tripped'}
                          </span>
                        </div>

                        <div className="space-y-1 font-mono text-[11px] text-stone-400 mb-3">
                          <div className="flex justify-between">
                            <span>Flow:</span>
                            <span className="text-stone-200 font-bold">{line.flow_mw} MW</span>
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
                              ? 'bg-rose-900/30 border border-rose-700/50 text-rose-300 hover:bg-rose-800 hover:text-white'
                              : 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300 hover:bg-emerald-800 hover:text-white'
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
                  <h2 className="text-lg md:text-xl font-bold text-stone-100">Wholesale Electricity Market & Economic Dispatch</h2>
                  <p className="text-xs text-stone-400">Merit-order generation scheduling and Locational Marginal Pricing (LMP).</p>
                </div>

                <button
                  onClick={runMarketSimulation}
                  disabled={marketLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-[#881337] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#9f1239] active:scale-95 disabled:opacity-50 w-fit shadow-md shadow-[#881337]/30"
                >
                  {marketLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{marketLoading ? 'Solving...' : 'Run Economic Dispatch'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-[#381629] bg-[#1a0c15] flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-stone-300">Gas Fuel Price Index</span>
                    <span className="text-xs font-mono font-bold text-[#fda4af]">{(gasPriceFactor * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="2.0"
                    step="0.1"
                    value={gasPriceFactor}
                    onChange={(e) => setGasPriceFactor(parseFloat(e.target.value))}
                    className="w-full accent-[#be123c] cursor-pointer"
                  />
                  <span className="text-[10px] text-stone-400 mt-1.5">Simulate natural gas pipeline tariff fluctuations</span>
                </div>

                <div className="p-3.5 rounded-xl border border-[#381629] bg-[#1a0c15] flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-stone-300">Hydro Inflow Season</span>
                    <span className="text-xs font-mono font-bold text-[#f43f5e]">{hydroAvailability >= 0.9 ? 'Wet (Peak)' : 'Dry (Lean)'}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.1"
                    value={hydroAvailability}
                    onChange={(e) => setHydroAvailability(parseFloat(e.target.value))}
                    className="w-full accent-[#be123c] cursor-pointer"
                  />
                  <span className="text-[10px] text-stone-400 mt-1.5">Kainji, Jebba & Shiroro reservoir water head levels</span>
                </div>

                <div className="p-3.5 rounded-xl border border-[#381629] bg-[#1a0c15] flex flex-col justify-between sm:col-span-2 lg:col-span-1">
                  <span className="text-xs font-semibold text-stone-300 mb-1">System Clearing Price</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono font-bold text-[#fda4af]">
                      ₦{marketResults?.market_clearing_price_ngn?.toLocaleString() || '--'}
                    </span>
                    <span className="text-xs text-stone-400">/ MWh</span>
                  </div>
                  <span className="text-[10px] text-stone-400 mt-1">Marginal unit setting wholesale spot settlement</span>
                </div>
              </div>

              {/* Merit Order Table */}
              <div className="rounded-xl border border-[#361327] bg-[#1a0c15] overflow-hidden shadow-sm">
                <div className="border-b border-[#361327] bg-[#160a12] px-5 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-stone-200">Merit Order Generation Dispatch Stack</h3>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[#fda4af]">Hydro: {marketResults?.hydro_share_percent || 0}%</span>
                    <span className="text-amber-400">Thermal: {marketResults?.thermal_share_percent || 0}%</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[650px]">
                    <thead className="bg-[#14080e] text-stone-400 border-b border-[#361327]">
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
                    <tbody className="divide-y divide-[#361327] text-stone-300">
                      {marketResults?.merit_order?.map((gen, idx) => (
                        <tr key={gen.name} className="hover:bg-[#240f1d]/50">
                          <td className="p-3 font-mono font-bold text-stone-500">#{idx + 1}</td>
                          <td className="p-3 font-semibold text-stone-100">{gen.name}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              gen.type === 'Hydro'
                                ? 'bg-[#3b152b] text-[#fda4af] border border-[#5c1c3f]'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}>
                              {gen.type}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-[#fda4af]">₦{gen.marginal_cost.toLocaleString()}</td>
                          <td className="p-3 font-mono font-bold text-stone-100">{gen.dispatched_mw} MW</td>
                          <td className="p-3 font-mono text-stone-400">{gen.max_mw} MW</td>
                          <td className="p-3 font-mono">{gen.capacity_utilization}%</td>
                          <td className="p-3 font-mono text-stone-200">₦{gen.hourly_cost_ngn.toLocaleString()}</td>
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
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>Upload Notice: {uploadError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-stone-100">Grid Model Ingestion & Case Library</h2>
                  <p className="text-xs md:text-sm text-stone-400">Ingest, manage, and persist network topologies (.m, .json, .xlsx, .raw).</p>
                </div>
              </div>

              {/* Multi-Format Upload Dropzone */}
              <div className="rounded-xl border border-[#361327] bg-[#1a0c15] p-6 space-y-6">
                <div className="border-2 border-dashed border-[#441832] hover:border-[#881337] rounded-xl p-8 text-center transition flex flex-col items-center justify-center bg-[#150810]/70">
                  <UploadCloud className="h-10 w-10 sm:h-12 sm:w-12 text-[#fda4af]/70 mb-3" />
                  <p className="text-xs sm:text-sm font-semibold text-stone-200">
                    Select or drop grid case files
                  </p>
                  <p className="text-[11px] text-stone-400 mt-1">
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
                    className={`mt-4 cursor-pointer rounded-lg bg-[#881337] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#9f1239] ${
                      uploadLoading ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    {uploadLoading ? 'Parsing Case...' : 'Browse Model File'}
                  </label>
                </div>
              </div>

              {/* Model Repository Table */}
              <div className="rounded-xl border border-[#361327] bg-[#1a0c15] overflow-hidden shadow-sm">
                <div className="border-b border-[#361327] bg-[#160a12] px-5 py-3.5 flex justify-between items-center text-xs">
                  <div>
                    <h3 className="font-bold text-stone-200">Model Repository</h3>
                    <p className="text-[11px] text-stone-400">All registered network topologies available for simulation.</p>
                  </div>
                  <span className="font-mono text-[#fda4af] text-xs">{modelList.length} Model{modelList.length !== 1 ? 's' : ''} Loaded</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[650px]">
                    <thead className="bg-[#14080e] text-stone-400 border-b border-[#361327] font-mono">
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
                    <tbody className="divide-y divide-[#361327] text-stone-300">
                      {modelList.map((model) => (
                        <tr key={model.id} className={`hover:bg-[#240f1d]/50 transition ${model.is_active ? 'bg-[#3b152b]/30' : ''}`}>
                          <td className="p-3">
                            <span className="flex items-center">
                              {model.is_active ? (
                                <span className="h-2.5 w-2.5 rounded-full bg-[#f43f5e] shadow-sm shadow-[#f43f5e]" title="Active Model"></span>
                              ) : (
                                <span className="h-2.5 w-2.5 rounded-full bg-stone-700" title="Inactive"></span>
                              )}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-stone-100">
                            <div className="flex items-center gap-2">
                              <FileCode className="h-4 w-4 text-[#fda4af] shrink-0" />
                              <span className="truncate max-w-[180px]">{model.name}</span>
                              {model.is_default && (
                                <span className="rounded bg-[#2a1020] px-1.5 py-0.5 text-[9px] font-bold text-stone-400 border border-[#441832]">
                                  Default
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-mono text-stone-400 text-[11px]">{model.format || 'MATPOWER'}</td>
                          <td className="p-3 font-mono">{model.buses}</td>
                          <td className="p-3 font-mono">{model.branches}</td>
                          <td className="p-3 font-mono text-[#fda4af]">{model.total_installed_mw} MW</td>
                          <td className="p-3 font-mono text-amber-400">{model.total_demand_mw} MW</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {!model.is_active ? (
                                <button
                                  onClick={() => handleActivateModel(model)}
                                  className="rounded border border-[#4e1d3a] bg-[#220d1c] px-2.5 py-1 text-[11px] font-semibold text-stone-200 hover:bg-[#881337] hover:border-[#9f1239] hover:text-white transition"
                                >
                                  Activate
                                </button>
                              ) : (
                                <span className="rounded bg-[#3b152b] px-2 py-0.5 text-[10px] font-bold text-[#fda4af] border border-[#5c1c3f]">
                                  Current
                                </span>
                              )}

                              {!model.is_default && (
                                <button
                                  onClick={() => handleDeleteModel(model.id)}
                                  className="p-1 rounded text-stone-500 hover:text-rose-400 hover:bg-rose-950/40 transition"
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

          {/* TAB 5: VISUALIZATION TOOLS */}
          {activeTab === 'Visualization' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {divergedNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{divergedNotice}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-stone-100">Interactive Single-Line Diagram</h2>
                  <p className="text-xs text-stone-400">
                    {diagramView === 'schematic'
                      ? 'IEEE standard busbar schematic with orthogonal routing and circuit breaker cubicles.'
                      : 'Geographic spatial layout of 330kV transmission substations.'}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex items-center rounded-lg border border-[#3b152b] bg-[#1a0c15] p-1 text-xs">
                    <button
                      onClick={() => setDiagramView('schematic')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition ${
                        diagramView === 'schematic'
                          ? 'bg-[#881337] text-white font-semibold shadow-sm shadow-[#881337]/30'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>Busbar (IEEE)</span>
                    </button>
                    <button
                      onClick={() => setDiagramView('geographic')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition ${
                        diagramView === 'geographic'
                          ? 'bg-[#881337] text-white font-semibold shadow-sm shadow-[#881337]/30'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span>Geographic</span>
                    </button>
                  </div>

                  <button
                    onClick={handleResetBaseline}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg border border-[#4a1c36] bg-[#220d1c] px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-[#331329] w-fit"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-[#fda4af]" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* SVG Vector Canvas */}
                <div className="lg:col-span-2 rounded-xl border border-[#361327] bg-[#1a0c15] p-3 md:p-5 relative overflow-hidden flex flex-col items-center justify-center">
                  <svg viewBox="30 20 700 440" className="w-full h-[400px] sm:h-[480px] select-none">
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

                      const isTripped = trippedLines.includes(line.id);
                      const strokeColor = isTripped
                        ? '#f43f5e'
                        : line.loading_percent > 85
                        ? '#fbbf24'
                        : '#34d399';

                      if (diagramView === 'schematic') {
                        const key1 = `${line.from_bus}-${line.to_bus}`;
                        const key2 = `${line.to_bus}-${line.from_bus}`;
                        const route = ORTHOGONAL_CORRIDORS[key1] || ORTHOGONAL_CORRIDORS[key2];

                        let pathD = '';
                        let breakerPos = { x: 350, y: 250 };
                        let labelPos = { x: 350, y: 235 };

                        if (route) {
                          pathD = route.path;
                          breakerPos = route.breaker;
                          labelPos = route.label;
                        } else {
                          const bFrom = SCHEMATIC_BUSBARS[line.from_bus] || { x: 100, y: 100 };
                          const bTo = SCHEMATIC_BUSBARS[line.to_bus] || { x: 200, y: 200 };
                          const midY = (bFrom.y + bTo.y) / 2;
                          pathD = `M ${bFrom.x} ${bFrom.y} L ${bFrom.x} ${midY} L ${bTo.x} ${midY} L ${bTo.x} ${bTo.y}`;
                          breakerPos = { x: (bFrom.x + bTo.x) / 2, y: midY };
                          labelPos = { x: breakerPos.x, y: midY - 14 };
                        }

                        return (
                          <g key={line.id} className="cursor-pointer group" onClick={() => toggleLine(line.id)}>
                            <path
                              d={pathD}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth={2.5}
                              strokeDasharray={isTripped ? '6 6' : 'none'}
                              className="transition-colors group-hover:stroke-white"
                            />

                            <g
                              transform={`translate(${breakerPos.x}, ${breakerPos.y})`}
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
                                strokeWidth="2"
                              />
                            </g>

                            {!isTripped && (
                              <g transform={`translate(${labelPos.x}, ${labelPos.y})`}>
                                <rect
                                  x="-26"
                                  y="-8"
                                  width="52"
                                  height="15"
                                  rx="3"
                                  fill="#160a12"
                                  stroke="#441832"
                                  strokeWidth="1"
                                  className="shadow-md"
                                />
                                <text
                                  x="0"
                                  y="3.5"
                                  fill="#f8fafc"
                                  fontSize="8.5"
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                  className="select-none pointer-events-none"
                                >
                                  {line.flow_mw} MW
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      }

                      const cFrom = getGeoCoordinates(fromBus);
                      const cTo = getGeoCoordinates(toBus);
                      const midX = (cFrom.x + cTo.x) / 2;
                      const midY = (cFrom.y + cTo.y) / 2;

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
                          <g transform={`translate(${midX}, ${midY})`}>
                            <rect
                              x="-5.5"
                              y="-5.5"
                              width="11"
                              height="11"
                              rx="1.5"
                              fill={isTripped ? '#4c0519' : '#064e3b'}
                              stroke={isTripped ? '#f43f5e' : '#10b981'}
                              strokeWidth="1.5"
                              className="transition-transform group-hover:scale-125"
                            />
                          </g>
                          {!isTripped && (
                            <g transform={`translate(${midX}, ${midY - 14})`}>
                              <rect
                                x="-24"
                                y="-7"
                                width="48"
                                height="14"
                                rx="3"
                                fill="#160a12"
                                stroke="#441832"
                                strokeWidth="1"
                              />
                              <text
                                x="0"
                                y="3.5"
                                fill="#fda4af"
                                fontSize="8"
                                fontFamily="monospace"
                                textAnchor="middle"
                                className="select-none pointer-events-none"
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
                      const nodeColor = isUnder ? '#f43f5e' : isOver ? '#fbbf24' : '#be123c';

                      if (diagramView === 'schematic') {
                        const sch = SCHEMATIC_BUSBARS[bus.id] || {
                          x: 100 + (bus.id % 4) * 150,
                          y: 100 + Math.floor(bus.id / 4) * 120,
                          width: 60,
                        };
                        const barW = sch.width;

                        return (
                          <g
                            key={bus.id}
                            transform={`translate(${sch.x}, ${sch.y})`}
                            onClick={() => setSelectedBus(bus)}
                            className="cursor-pointer group"
                          >
                            <rect
                              x={-barW / 2}
                              y="-3.5"
                              width={barW}
                              height="7"
                              rx="2"
                              fill={isSelected ? '#fda4af' : nodeColor}
                              stroke="#160a12"
                              strokeWidth="1.5"
                              filter={isSelected ? 'url(#node-glow)' : undefined}
                              className="transition-all group-hover:brightness-125"
                            />

                            {sch.isGen && (
                              <g transform="translate(0, -32)">
                                <line x1="0" y1="28" x2="0" y2="12" stroke="#9f1239" strokeWidth="2" />
                                <circle
                                  r="12"
                                  fill="#160a12"
                                  stroke={isSelected ? '#fda4af' : '#fda4af'}
                                  strokeWidth="2"
                                  className="transition-transform group-hover:scale-110"
                                />
                                <path
                                  d="M -6 0 Q -3 -5 0 0 Q 3 5 6 0"
                                  fill="none"
                                  stroke="#fda4af"
                                  strokeWidth="2"
                                />
                                <text
                                  x="0"
                                  y="-17"
                                  fill="#fda4af"
                                  fontSize="9"
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                >
                                  {sch.genName || bus.name.split(' ')[0]}
                                </text>
                              </g>
                            )}

                            {sch.isLoad && (
                              <g transform="translate(0, 18)">
                                <line x1="0" y1="-14" x2="0" y2="4" stroke="#9f1239" strokeWidth="2" />
                                <path d="M 0 13 L -5 4 L 5 4 Z" fill="#fbbf24" stroke="#fbbf24" />
                                <text
                                  x="0"
                                  y="23"
                                  fill="#fbbf24"
                                  fontSize="8.5"
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                >
                                  {bus.p_mw > 0 ? `${bus.p_mw}MW` : 'LOAD'}
                                </text>
                              </g>
                            )}

                            <text
                              x="0"
                              y={sch.isLoad ? -12 : 20}
                              fill="#f8fafc"
                              fontSize="9.5"
                              fontFamily="monospace"
                              fontWeight="bold"
                              textAnchor="middle"
                              className="select-none"
                            >
                              {bus.name.split(' ')[0]}
                            </text>
                            <text
                              x="0"
                              y={sch.isLoad ? -23 : 30}
                              fill={isUnder ? '#f43f5e' : isOver ? '#fbbf24' : '#fda4af'}
                              fontSize="8"
                              fontFamily="monospace"
                              textAnchor="middle"
                              className="select-none"
                            >
                              {bus.v_pu.toFixed(2)} pu
                            </text>
                          </g>
                        );
                      }

                      const coords = getGeoCoordinates(bus);
                      return (
                        <g
                          key={bus.id}
                          transform={`translate(${coords.x}, ${coords.y})`}
                          onClick={() => setSelectedBus(bus)}
                          className="cursor-pointer group"
                        >
                          <circle
                            r={isSelected ? 11 : 7}
                            fill={isSelected ? '#fda4af' : nodeColor}
                            stroke="#160a12"
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
                <div className="rounded-xl border border-[#361327] bg-[#1a0c15] p-4 sm:p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-stone-200 mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-[#fda4af]" /> Substation Inspector
                    </h3>
                    {selectedBus ? (
                      <div className="space-y-3 text-xs">
                        <div className="p-3 rounded-lg bg-[#14080e] border border-[#381629]">
                          <span className="text-stone-400 block text-[10px] uppercase">Substation</span>
                          <span className="font-bold text-stone-100 text-sm">{selectedBus.name}</span>
                          <span className="block text-[11px] text-stone-400 mt-0.5">{selectedBus.zone} Zone</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 font-mono">
                          <div className="p-2.5 rounded bg-[#14080e] border border-[#381629]">
                            <span className="text-stone-400 block text-[10px]">Voltage (|V|)</span>
                            <span className={`font-bold ${selectedBus.v_pu < 0.95 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {selectedBus.v_pu} pu
                            </span>
                          </div>
                          <div className="p-2.5 rounded bg-[#14080e] border border-[#381629]">
                            <span className="text-stone-400 block text-[10px]">Phase Angle</span>
                            <span className="font-bold text-stone-200">{selectedBus.va_deg}°</span>
                          </div>
                          <div className="p-2.5 rounded bg-[#14080e] border border-[#381629]">
                            <span className="text-stone-400 block text-[10px]">Active</span>
                            <span className="font-bold text-[#fda4af]">{selectedBus.p_mw} MW</span>
                          </div>
                          <div className="p-2.5 rounded bg-[#14080e] border border-[#381629]">
                            <span className="text-stone-400 block text-[10px]">Reactive</span>
                            <span className="font-bold text-amber-400">{selectedBus.q_mvar} MVAR</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-40 sm:h-48 flex items-center justify-center text-center text-xs text-stone-400 border border-dashed border-[#3d182f] rounded-lg p-4">
                        Click on any busbar or substation node in the diagram to inspect live telemetry.
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#361327] text-[10px] text-stone-400 flex justify-between">
                    <span>Click breaker squares to trip (N-1)</span>
                    <span className="text-[#fda4af]">
                      {diagramView === 'schematic' ? '● IEEE Busbar View' : '● Geographic View'}
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
                  <h2 className="text-lg md:text-xl font-bold text-stone-100">National Grid Contingency Audit Report</h2>
                  <p className="text-xs text-stone-400">Grid Code compliance audit (0.95 ≤ |V| ≤ 1.05 p.u., loading ≤ 85%).</p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`${API_BASE_URL}/api/reports/export-csv`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-[#4a1c36] bg-[#220d1c] px-3.5 py-2 text-xs font-semibold text-stone-200 transition hover:bg-[#34142b]"
                  >
                    <FileText className="h-3.5 w-3.5 text-[#fda4af]" />
                    <span>Download CSV</span>
                  </a>

                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-lg bg-[#881337] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#9f1239] shadow-sm shadow-[#881337]/30"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Print Audit Document</span>
                  </button>
                </div>
              </div>

              {/* Summary Audit Scorecard */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-4 rounded-xl border border-[#361327] bg-[#1a0c15]">
                  <span className="text-stone-400 block mb-1">Total System Infeed</span>
                  <span className="text-xl font-mono font-bold text-stone-100">
                    {results?.total_gen_mw ? `${results.total_gen_mw.toLocaleString()} MW` : '--'}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-[#361327] bg-[#1a0c15]">
                  <span className="text-stone-400 block mb-1">Total System Losses</span>
                  <span className="text-xl font-mono font-bold text-rose-400">
                    {results?.total_losses_mw ? `${results.total_losses_mw} MW` : '--'}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-[#361327] bg-[#1a0c15]">
                  <span className="text-stone-400 block mb-1">Voltage Violations</span>
                  <span className="text-xl font-mono font-bold text-amber-400">
                    {results?.buses ? results.buses.filter((b) => b.v_pu < 0.95 || b.v_pu > 1.05).length : 0} Nodes
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-[#361327] bg-[#1a0c15]">
                  <span className="text-stone-400 block mb-1">Critical Lines (&gt;80%)</span>
                  <span className="text-xl font-mono font-bold text-[#fda4af]">
                    {results?.lines ? results.lines.filter((l) => l.loading_percent > 80).length : 0} Corridors
                  </span>
                </div>
              </div>

              {/* Itemized Violation Ledger */}
              <div className="rounded-xl border border-[#361327] bg-[#1a0c15] overflow-hidden shadow-sm">
                <div className="border-b border-[#361327] bg-[#160a12] px-5 py-3 flex justify-between items-center text-xs">
                  <h3 className="font-bold text-stone-200">Grid Code Violation & Contingency Ledger</h3>
                </div>

                <div className="divide-y divide-[#361327] text-xs">
                  {results?.buses
                    ?.filter((b) => b.v_pu < 0.95)
                    .map((bus) => (
                      <div key={bus.id} className="p-3.5 flex items-center justify-between bg-rose-950/20 hover:bg-rose-950/30">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                          <div>
                            <span className="font-bold text-stone-200">{bus.name} ({bus.zone} Zone)</span>
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
                            <span className="font-bold text-stone-200">{line.name}</span>
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
                      <div key={line.id} className="p-3.5 flex items-center justify-between bg-[#150911]/60">
                        <div className="flex items-center gap-3">
                          <RotateCcw className="h-4 w-4 text-stone-400 shrink-0" />
                          <div>
                            <span className="font-bold text-stone-300">{line.name}</span>
                            <span className="block text-[11px] text-stone-400">Breaker opened: N-1 outage applied to corridor</span>
                          </div>
                        </div>
                        <span className="font-mono text-stone-300 font-bold px-2 py-1 rounded bg-[#270f20] border border-[#441832] text-[11px]">
                          N-1 OUTAGE
                        </span>
                      </div>
                    ))}

                  {results?.buses?.every((b) => b.v_pu >= 0.95 && b.v_pu <= 1.05) &&
                    results?.lines?.every((l) => l.loading_percent <= 80 && l.in_service) && (
                      <div className="p-6 text-center text-stone-400 flex flex-col items-center justify-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
                        <span className="font-semibold text-stone-200">Full Grid Code Compliance</span>
                        <span className="text-[11px] text-stone-400 mt-0.5">All substation voltages and line loadings fall within operational boundaries.</span>
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
                  <h2 className="text-lg md:text-xl font-bold text-stone-100">National Grid Task Force & Administration</h2>
                  <p className="text-xs text-stone-400">Statutory NERC Grid Code criteria and system security margins.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#361327] bg-[#1a0c15] p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-[#361327] pb-3">
                    <ShieldCheck className="h-5 w-5 text-[#fda4af]" />
                    <h3 className="text-sm font-bold text-stone-200">NERC Grid Code Criteria</h3>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between border-b border-[#2d1021] pb-2">
                      <span className="text-stone-400">Nominal Grid Frequency</span>
                      <span className="font-mono font-bold text-stone-100">50.00 Hz (±0.5%)</span>
                    </div>

                    <div className="flex justify-between border-b border-[#2d1021] pb-2">
                      <span className="text-stone-400">Statutory Voltage Limits</span>
                      <span className="font-mono font-bold text-stone-100">0.95 – 1.05 p.u.</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-stone-400">Line Thermal Alarm Threshold</span>
                      <span className="font-mono font-bold text-amber-400">85.0% Loading</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#361327] bg-[#1a0c15] p-5 space-y-3">
                  <h3 className="text-sm font-bold text-stone-200 border-b border-[#361327] pb-2">System Authority</h3>
                  <p className="text-xs text-stone-400 leading-relaxed">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#441832] bg-[#180a13] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#361327]">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-100">
                {isSignUp ? 'Register Operator' : 'Operator Login'}
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-stone-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAuth} className="mt-4 space-y-3">
              {authMsg && (
                <div className="p-2 rounded bg-[#3b152b] border border-[#5c1c3f] text-[11px] text-[#fda4af]">
                  {authMsg}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-stone-400 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full rounded-lg bg-[#14080e] border border-[#3b152b] px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-[#be123c]"
                  placeholder="operator@ncc.gov.ng"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-stone-400 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full rounded-lg bg-[#14080e] border border-[#3b152b] px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-[#be123c]"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-[#881337] py-2 text-xs font-bold text-white hover:bg-[#9f1239] transition shadow-md shadow-[#881337]/30"
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
                  className="text-[11px] text-stone-400 hover:text-[#fda4af] transition"
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