'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { SingleLineDiagram } from '@/components/diagram/SingleLineDiagram';
import { HomeTab } from '@/components/tabs/HomeTab';
import { GridStabilityTab } from '@/components/tabs/GridStabilityTab';
import { DynamicsTab } from '@/components/tabs/DynamicsTab';
import { MarketTab } from '@/components/tabs/MarketTab';
import { UploadTab } from '@/components/tabs/UploadTab';
import { ReportsTab } from '@/components/tabs/ReportsTab';
import { AdminTab } from '@/components/tabs/AdminTab';
import { AboutTab } from '@/components/tabs/AboutTab';
import { api } from '@/services/api';
import { supabase } from '@/lib/supabase';
import {
  SimResult,
  DynamicSimResult,
  MarketResult,
  GridModelMeta,
  UserAccount,
  BusData,
  PowerFlowVariables,
} from '@/types/grid';
import {
  Home,
  Grid,
  Activity,
  DollarSign,
  UploadCloud,
  Layers,
  FileText,
  ShieldCheck,
  Info,
  X,
  Mail,
  Lock,
  Building,
  BookOpen,
  CheckCircle2,
  FolderOpen,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

export default function PowerPlatformDashboard() {
  const [activeTab, setActiveTab] = useState('Home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  // User Authentication State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Auth Inputs
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regInstitution, setRegInstitution] = useState('');
  const [regDepartment, setRegDepartment] = useState('');
  const [regReason, setRegReason] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Engineering Variables Deck & Planning State
  const [pfVariables, setPfVariables] = useState<PowerFlowVariables>({
    loadMultiplier: 1.0,
    targetPowerFactor: 0.9,
    slackVoltagePu: 1.05,
    shuntMvarCompensation: 0.0,
    thermalDeratingFactor: 1.0,
    newBuses: [],
    newLines: [],
    newGenerators: [],
  });

  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [results, setResults] = useState<SimResult | null>(null);
  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);
  const [divergedNotice, setDivergedNotice] = useState<string | null>(null);

  // Grid Models State
  const [models, setModels] = useState<GridModelMeta[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  // Dynamics & Market State
  const [dynDisturbance, setDynDisturbance] = useState(450.0);
  const [enableGovernor, setEnableGovernor] = useState(true);
  const [enablePSS, setEnablePSS] = useState(true);
  const [dynLoading, setDynLoading] = useState(false);
  const [dynResult, setDynResult] = useState<DynamicSimResult | null>(null);

  const [gasPriceFactor, setGasPriceFactor] = useState(1.0);
  const [hydroAvailability, setHydroAvailability] = useState(1.0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketResults, setMarketResults] = useState<MarketResult | null>(null);

  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-platform.onrender.com';

  const navItems = [
    { id: 'Home', label: 'Dashboard', icon: Home },
    { id: 'Grid Models', label: 'Grid Stability Models', icon: Grid },
    { id: 'Dynamics', label: 'Time-Domain & PSS', icon: Activity },
    { id: 'Market Simulations', label: 'Market Simulations', icon: DollarSign },
    { id: 'Data Upload', label: 'Upload & Ingestion', icon: UploadCloud },
    { id: 'Visualization', label: 'Single-Line Diagram', icon: Layers },
    { id: 'Reports', label: 'Reports & Publications', icon: FileText },
    { id: 'Admin Panel', label: 'Organization & Leadership', icon: ShieldCheck },
    { id: 'About Us', label: 'About Us (ML4PS)', icon: Info },
  ];

  // Restore authenticated session from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('ml4ps_user');
      if (savedUser) {
        try {
          setCurrentUser(JSON.parse(savedUser));
        } catch {
          localStorage.removeItem('ml4ps_user');
        }
      }
    }
  }, []);

  // Comprehensive Model Activation & Immediate Power Flow Execution
  const handleActivateModel = async (id: string) => {
    setLoading(true);
    setDivergedNotice(null);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('nesi_active_model_id', id);
      }

      // 1. Fetch network payload from Supabase to hydrate backend RAM
      let loadedViaPayload = false;
      try {
        const { data: modelData } = await supabase
          .from('grid_models')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (modelData && modelData.network_payload) {
          await api.loadPayload({
            id: modelData.id,
            name: modelData.name,
            voltage_level: modelData.voltage_level,
            domain: modelData.domain,
            platform: modelData.platform,
            network_payload: modelData.network_payload,
          });
          loadedViaPayload = true;
        }
      } catch (sbErr) {
        console.warn('Supabase payload hydration skipped:', sbErr);
      }

      if (!loadedViaPayload) {
        await api.activateModel(id);
      }

      setActiveModelId(id);

      // 2. Mark active in UI models list
      setModels((prevModels) =>
        prevModels.map((m) => ({
          ...m,
          is_active: m.id === id,
        }))
      );

      // 3. Run power flow on the hydrated network
      const pfResult = await api.runPowerFlow(pfVariables, []);
      setResults(pfResult);
      setTrippedLines([]);

      if (!pfResult.converged) {
        setDivergedNotice(pfResult.message || 'Power flow calculation diverged.');
      } else {
        setDivergedNotice(null);
      }
    } catch (err: any) {
      console.error('Activation failure:', err);
      setDivergedNotice(err.message || 'Failed to initialize power flow for the selected model.');
    } finally {
      setLoading(false);
    }
  };

  
  // Safe Model Ingestion & Synchronization (Merges Backend and Supabase without wiping)
  const syncModels = async () => {
    setLoading(true);
    try {
      // 1. Fetch from FastAPI Backend
      let backendModels: GridModelMeta[] = [];
      try {
        backendModels = await api.getModels();
      } catch (err) {
        console.warn('Backend model fetch notice:', err);
      }

      // 2. Fetch from Supabase Table
      let dbModels: any[] = [];
      try {
        const { data, error } = await supabase
          .from('grid_models')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          dbModels = data;
        }
      } catch (err) {
        console.warn('Supabase fetch notice:', err);
      }

      // 3. Map Supabase models
      const mappedDbModels: GridModelMeta[] = dbModels.map((m: any) => ({
        id: m.id,
        name: m.name,
        voltage_level: m.voltage_level || '330kV',
        domain: m.domain || 'Static & Dynamic',
        platform: m.platform || m.format || 'MATPOWER',
        buses: m.buses,
        branches: m.branches,
        total_installed_mw: Number(m.total_installed_mw),
        total_demand_mw: Number(m.total_demand_mw),
        converged: m.converged,
        is_default: false,
        is_active: false,
      }));

      // 4. Merge non-destructively
      const mergedMap = new Map<string, GridModelMeta>();
      backendModels.forEach((m) => mergedMap.set(m.id, m));
      mappedDbModels.forEach((m) => mergedMap.set(m.id, m));

      const mergedList = Array.from(mergedMap.values());

      if (mergedList.length > 0) {
        const savedId = typeof window !== 'undefined' ? localStorage.getItem('nesi_active_model_id') : null;
        const targetModel =
          mergedList.find((m) => m.id === savedId) ||
          mergedList.find((m) => m.is_active) ||
          mergedList[0];

        const finalizedList = mergedList.map((m) => ({
          ...m,
          is_active: m.id === targetModel.id,
        }));

        setModels(finalizedList);
        await handleActivateModel(targetModel.id);
      }
    } catch (err) {
      console.error('Model initialization error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncModels();
  }, []);

  const runSim = async () => {
    setLoading(true);
    try {
      const simRes = await api.runPowerFlow(pfVariables, trippedLines);
      setResults(simRes);
      setDivergedNotice(!simRes.converged ? simRes.message || 'Calculation diverged' : null);
    } finally {
      setLoading(false);
    }
  };

  const runDyn = async (params?: {
    disturbance_mw: number;
    inertia_constant_H: number;
    enable_governor: boolean;
    droop_R: number;
    enable_pss: boolean;
    pss_gain_K: number;
    enable_ufls: boolean;
  }) => {
    setDynLoading(true);
    try {
      const data = await api.runDynamics({
        disturbance_mw: params?.disturbance_mw ?? dynDisturbance,
        inertia_constant_H: params?.inertia_constant_H ?? 4.5,
        enable_governor: params?.enable_governor ?? enableGovernor,
        droop_R: params?.droop_R ?? 0.05,
        enable_pss: params?.enable_pss ?? enablePSS,
        pss_gain_K: params?.pss_gain_K ?? 25.0,
        enable_ufls: params?.enable_ufls ?? true,
      });
      setDynResult(data);
    } finally {
      setDynLoading(false);
    }
  };

  const runMkt = async () => {
    setMarketLoading(true);
    try {
      const data = await api.runMarket(
        pfVariables.loadMultiplier,
        gasPriceFactor,
        hydroAvailability,
        trippedLines,
      );
      setMarketResults(data);
    } finally {
      setMarketLoading(false);
    }
  };

  const handleToggleLine = (id: number) => {
    const next = trippedLines.includes(id)
      ? trippedLines.filter((l) => l !== id)
      : [...trippedLines, id];
    setTrippedLines(next);
    api.runPowerFlow(pfVariables, next).then(setResults);
  };

  const handleCascadeTrigger = async (initialTripped: number[], threshold: number) => {
    return await api.runCascade({
      initial_tripped_lines: initialTripped,
      overload_threshold_percent: threshold,
      max_cascade_steps: 8,
      load_multiplier: pfVariables.loadMultiplier,
      slack_voltage_pu: pfVariables.slackVoltagePu,
    });
  };

  const handleApplyCascadeTrips = (trippedList: number[]) => {
    setTrippedLines(trippedList);
    api.runPowerFlow(pfVariables, trippedList).then(setResults);
    setActiveTab('Visualization');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setUploadLoading(true);
    setUploadNotice(null);

    try {
      const res = await api.uploadModel(formData);

      try {
        await supabase.from('grid_models').upsert({
          id: res.model_id,
          name: res.filename,
          format: res.format,
          voltage_level: res.voltage_level,
          domain: 'Static & Dynamic',
          platform: res.format,
          buses: res.metrics.buses,
          branches: res.metrics.branches,
          total_installed_mw: res.metrics.total_installed_mw,
          total_demand_mw: res.metrics.total_demand_mw,
          converged: res.converged,
          network_payload: res.network_payload,
          user_id: currentUser ? String(currentUser.id) : null,
        });
      } catch (sbErr) {
        console.warn('Supabase storage warning:', sbErr);
      }

      setUploadNotice(`Model '${res.filename}' parsed and stored permanently.`);
      await syncModels();
      await handleActivateModel(res.model_id);
    } catch (err: any) {
      setUploadNotice(`Upload Error: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this model?')) return;
    try {
      await supabase.from('grid_models').delete().eq('id', id);
      await api.deleteModel(id);
      await syncModels();
    } catch {
      alert('Could not delete model.');
    }
  };

  const handleReset = async () => {
    setTrippedLines([]);
    setPfVariables({
      loadMultiplier: 1.0,
      targetPowerFactor: 0.9,
      slackVoltagePu: 1.05,
      shuntMvarCompensation: 0.0,
      thermalDeratingFactor: 1.0,
      newBuses: [],
      newLines: [],
      newGenerators: [],
    });
    setSelectedBus(null);
    if (activeModelId) {
      handleActivateModel(activeModelId);
    }
  };

  // Auth Handlers
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Sign-in failed');
      }

      setCurrentUser(data.user);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ml4ps_user', JSON.stringify(data.user));
      }
      setShowAuthModal(false);
      setLoginPassword('');
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessMsg(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          institution: regInstitution,
          department: regDepartment,
          reason: regReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      setAuthSuccessMsg(data.message);
      setTimeout(() => {
        setLoginEmail(regEmail);
        setAuthMode('login');
      }, 3500);
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ml4ps_user');
    }
  };

  const handleRunMultiMachine = async (params: {
    fault_bus_id: number;
    fault_duration_ms: number;
  }) => {
    return await api.runMultiMachine({
      fault_bus_id: params.fault_bus_id,
      fault_duration_ms: params.fault_duration_ms,
      calc_cct: true,
    });
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#f7f5f9] font-sans text-slate-800 antialiased overflow-hidden">
      <Header
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        currentUser={currentUser}
        onLoginClick={() => {
          setAuthMode('login');
          setShowAuthModal(true);
        }}
        onLogoutClick={handleLogout}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          navItems={navItems}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onReset={handleReset}
          loading={loading}
          currentUser={currentUser}
          onLoginClick={() => {
            setAuthMode('login');
            setShowAuthModal(true);
          }}
          desktopCollapsed={desktopCollapsed}
          setDesktopCollapsed={setDesktopCollapsed}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col justify-between">
          <div>
            {activeTab === 'Home' && <HomeTab onNavigate={setActiveTab} />}

            {activeTab === 'Grid Models' && (
              <GridStabilityTab
                modelName={results?.model_name || models.find((m) => m.id === activeModelId)?.name || 'No Active Model'}
                divergedNotice={divergedNotice}
                pfVariables={pfVariables}
                setPfVariables={setPfVariables}
                runSimulation={runSim}
                onReset={handleReset}
                loading={loading}
                buses={results?.buses || []}
                lines={results?.lines || []}
                trippedLines={trippedLines}
                toggleLine={handleToggleLine}
                models={models}
                onActivateModel={handleActivateModel}
                onNavigateTab={setActiveTab}
                onCascadeTrigger={handleCascadeTrigger}
                onApplyCascadeTrips={handleApplyCascadeTrips}
              />
            )}

            {activeTab === 'Dynamics' && (
              <DynamicsTab
                dynResult={dynResult}
                dynLoading={dynLoading}
                onRunSimulation={runDyn}
                buses={results?.buses || []}
                onRunMultiMachine={handleRunMultiMachine}
              />
            )}

            {activeTab === 'Market Simulations' && (
              <MarketTab
                gasPriceFactor={gasPriceFactor}
                setGasPriceFactor={setGasPriceFactor}
                hydroAvailability={hydroAvailability}
                setHydroAvailability={setHydroAvailability}
                runMarketSimulation={runMkt}
                marketLoading={marketLoading}
                marketResults={marketResults}
              />
            )}

            {/* Upload Tab: Activate button removed; activation happens exclusively in Grid Stability Models */}
            {activeTab === 'Data Upload' && (
              <UploadTab
                uploadNotice={uploadNotice}
                uploadLoading={uploadLoading}
                onFileUpload={handleFileUpload}
                models={models}
                onDelete={handleDeleteModel}
                currentUser={currentUser}
                onLoginClick={() => {
                  setAuthMode('login');
                  setShowAuthModal(true);
                }}
              />
            )}

            {activeTab === 'Visualization' && (
              <>
                {!results || results.buses.length === 0 ? (
                  <div className="h-96 rounded-2xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center p-6 text-center shadow-xs">
                    <FolderOpen className="h-12 w-12 text-slate-400 mb-3" />
                    <h3 className="text-sm font-bold text-slate-800">No Active Grid Topology Loaded</h3>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                      Select and solve a model in Grid Stability Models to visualize the single-line diagram.
                    </p>
                    <button
                      onClick={() => setActiveTab('Grid Models')}
                      className="mt-4 px-5 py-2.5 rounded-xl bg-[#500b50] text-white text-xs font-bold hover:bg-[#680f68] transition"
                    >
                      Go to Grid Stability Models
                    </button>
                  </div>
                ) : (
                  <SingleLineDiagram
                    buses={results?.buses || []}
                    lines={results?.lines || []}
                    trippedLines={trippedLines}
                    toggleLine={handleToggleLine}
                    selectedBus={selectedBus}
                    setSelectedBus={setSelectedBus}
                    onReset={handleReset}
                    modelName={results?.model_name || ''}
                  />
                )}
              </>
            )}

            {activeTab === 'Reports' && (
              <ReportsTab
                results={results}
                modelName={results?.model_name || models.find((m) => m.id === activeModelId)?.name || 'Active Grid Case'}
                currentUser={currentUser}
                pfVariables={pfVariables}
                dynResult={dynResult}
              />
            )}

            {/* Admin Tab with Governance Directory & Dynamic User Approval Queue */}
            {activeTab === 'Admin Panel' && <AdminTab apiBaseUrl={apiBaseUrl} />}

            {activeTab === 'About Us' && <AboutTab />}
          </div>

          <footer className="mt-8 pt-3 border-t border-slate-200 text-center text-[11px] text-slate-500">
            Copyright 2026 National Power System Modelling & Simulation Platform | Machine Learning 4 Power Systems (ML4PS) | FUT Minna
          </footer>
        </main>
      </div>

      {/* Dynamic Authentication & Registration Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-[#500b50] text-white flex items-center justify-center">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Taskforce Access Gateway</h3>
                  <p className="text-xs text-slate-500">ML4PS National Security Gate</p>
                </div>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Switcher: Sign In vs Register */}
            <div className="flex rounded-xl border border-slate-200 p-1 bg-slate-50 text-xs">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
                className={`flex-1 py-2 rounded-lg font-bold transition ${
                  authMode === 'login' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In with Credentials
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
                className={`flex-1 py-2 rounded-lg font-bold transition ${
                  authMode === 'register' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Request Access / Register
              </button>
            </div>

            {authError && (
              <div className="p-3.5 rounded-xl border border-rose-300 bg-rose-50 flex items-start gap-2.5 text-xs text-rose-800 leading-relaxed">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccessMsg && (
              <div className="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50 flex items-start gap-2.5 text-xs text-emerald-800 leading-relaxed">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <span>{authSuccessMsg}</span>
              </div>
            )}

            {/* TAB 1: LOGIN FORM */}
            {authMode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Operator Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="operator@futminna.edu.ng"
                      className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Temporary or Permanent Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Use your issued temporary password (e.g. <strong>ML4PS-XXXX</strong>)
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-3 rounded-xl bg-[#500b50] text-white font-bold text-sm hover:bg-[#680f68] transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {authSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Authenticating Session...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Platform</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 2: REGISTRATION FORM */}
            {authMode === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    Full Name & Title
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Engr. Saliu Adamu"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-[#500b50]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    Official Institutional Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="engineer@tcn.org.ng"
                      className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                      Institution / Utility
                    </label>
                    <div className="relative">
                      <Building className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={regInstitution}
                        onChange={(e) => setRegInstitution(e.target.value)}
                        placeholder="FUT Minna, TCN, NISO..."
                        className="w-full border border-slate-300 rounded-xl pl-8 pr-2 py-2 text-xs text-slate-900 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={regDepartment}
                      onChange={(e) => setRegDepartment(e.target.value)}
                      placeholder="Electrical Engineering"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    Research Objective / Project Purpose
                  </label>
                  <div className="relative">
                    <BookOpen className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={regReason}
                      onChange={(e) => setRegReason(e.target.value)}
                      placeholder="e.g. Dynamic transient stability and CCT evaluation"
                      className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 bg-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-3 mt-1 rounded-xl bg-[#500b50] text-white font-bold text-sm hover:bg-[#680f68] transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {authSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Submitting Request...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Request for Approval</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}