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
import { SimResult, DynamicSimResult, MarketResult, GridModelMeta, UserAccount, BusData } from '@/types/grid';
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
  LogIn,
  UserPlus,
  Lock,
  Mail,
  Building,
  Tag,
  CheckCircle2,
} from 'lucide-react';

export default function PowerPlatformDashboard() {
  const [activeTab, setActiveTab] = useState('Home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Authentication State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regInstitution, setRegInstitution] = useState('');
  const [regDepartment, setRegDepartment] = useState('');
  const [regReason, setRegReason] = useState('');
  const [regReferee, setRegReferee] = useState('');
  const [regTags, setRegTags] = useState('Power Flow, Grid Code');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Simulation & Grid State
  const [loadMultiplier, setLoadMultiplier] = useState(1.0);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [results, setResults] = useState<SimResult | null>(null);
  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);
  const [divergedNotice, setDivergedNotice] = useState<string | null>(null);

  // Dynamics & Market State
  const [models, setModels] = useState<GridModelMeta[]>([]);
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
  const [users, setUsers] = useState<UserAccount[]>([]);

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

  // Load session from localStorage on initial render
  useEffect(() => {
    const saved = localStorage.getItem('ml4ps_user');
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch {
        // Fallback default
      }
    } else {
      // Default initial login for easy evaluation
      const initialAdmin: UserAccount = {
        id: 'usr-1',
        name: 'Opeyemi Ibrahim Abubakar',
        email: 'operator@futminna.edu.ng',
        institution: 'FUT Minna (ML4PS Group)',
        department: 'Electrical & Electronics Engineering',
        role: 'Taskforce Administrator',
        status: 'APPROVED',
        registered_at: '2026-09-01 10:14',
      };
      setCurrentUser(initialAdmin);
      localStorage.setItem('ml4ps_user', JSON.stringify(initialAdmin));
    }
  }, []);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [modelList, userList, simRes] = await Promise.all([
        api.getModels(),
        api.getUsers(),
        api.runPowerFlow(loadMultiplier, trippedLines),
      ]);
      setModels(modelList);
      setUsers(userList);
      setResults(simRes);
      setDivergedNotice(!simRes.converged ? simRes.message || 'Calculation diverged' : null);
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    runDyn();
    runMkt();
  }, []);

  const runSim = async () => {
    setLoading(true);
    try {
      const simRes = await api.runPowerFlow(loadMultiplier, trippedLines);
      setResults(simRes);
      setDivergedNotice(!simRes.converged ? simRes.message || 'Calculation diverged' : null);
    } finally {
      setLoading(false);
    }
  };

  const runDyn = async () => {
    setDynLoading(true);
    try {
      const data = await api.runDynamics(dynDisturbance, enableGovernor, enablePSS);
      setDynResult(data);
    } finally {
      setDynLoading(false);
    }
  };

  const runMkt = async () => {
    setMarketLoading(true);
    try {
      const data = await api.runMarket(loadMultiplier, gasPriceFactor, hydroAvailability, trippedLines);
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
    api.runPowerFlow(loadMultiplier, next).then(setResults);
  };

  const handleActivateModel = async (id: string) => {
    await api.activateModel(id);
    setTrippedLines([]);
    setLoadMultiplier(1.0);
    refreshData();
  };

  const handleReset = async () => {
    await api.resetGrid();
    setTrippedLines([]);
    setLoadMultiplier(1.0);
    refreshData();
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
      setUploadNotice(`Model '${res.filename}' parsed successfully (${res.format} / ${res.voltage_level}).`);
      refreshData();
    } catch (err: any) {
      setUploadNotice(`Upload Error: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  // Auth Handlers
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const res = await api.loginUser(loginEmail, loginPassword);
      setCurrentUser(res.user);
      localStorage.setItem('ml4ps_user', JSON.stringify(res.user));
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
      const res = await api.registerUser({
        name: regName,
        email: regEmail,
        institution: regInstitution,
        department: regDepartment,
        reason: regReason,
        referee: regReferee,
        research_tags: regTags,
      });
      setAuthSuccessMsg(res.message);
      // Refresh user list for admin
      const updatedUsers = await api.getUsers();
      setUsers(updatedUsers);
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('ml4ps_user');
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#f7f5f9] font-sans text-slate-800 antialiased overflow-hidden">
      <Header
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        currentUser={currentUser}
        onLoginClick={() => {
          setAuthMode('login');
          setAuthError(null);
          setAuthSuccessMsg(null);
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
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col justify-between">
          <div>
            {activeTab === 'Home' && <HomeTab onNavigate={setActiveTab} />}

            {activeTab === 'Grid Models' && (
              <GridStabilityTab
                modelName={results?.model_name || 'Nig 10-Bus Benchmark'}
                divergedNotice={divergedNotice}
                loadMultiplier={loadMultiplier}
                setLoadMultiplier={setLoadMultiplier}
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
              />
            )}

            {activeTab === 'Dynamics' && (
              <DynamicsTab
                dynDisturbance={dynDisturbance}
                setDynDisturbance={setDynDisturbance}
                enableGovernor={enableGovernor}
                setEnableGovernor={setEnableGovernor}
                enablePSS={enablePSS}
                setEnablePSS={setEnablePSS}
                runDynamicSimulation={runDyn}
                dynLoading={dynLoading}
                dynResult={dynResult}
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

            {activeTab === 'Data Upload' && (
              <UploadTab
                uploadNotice={uploadNotice}
                uploadLoading={uploadLoading}
                onFileUpload={handleFileUpload}
                models={models}
                onActivate={handleActivateModel}
                onDelete={async (id) => {
                  await api.deleteModel(id);
                  refreshData();
                }}
                currentUser={currentUser}
                onLoginClick={() => {
                  setAuthMode('login');
                  setShowAuthModal(true);
                }}
              />
            )}

            {activeTab === 'Visualization' && (
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

            {activeTab === 'Reports' && <ReportsTab results={results} />}

            {activeTab === 'Admin Panel' && (
              <AdminTab
                users={users}
                onApprove={async (id) => {
                  const res = await api.approveUser(id);
                  const updated = await api.getUsers();
                  setUsers(updated);
                  return res;
                }}
                onReject={async (id) => {
                  await api.rejectUser(id);
                  const updated = await api.getUsers();
                  setUsers(updated);
                }}
              />
            )}

            {activeTab === 'About Us' && <AboutTab />}
          </div>

          <footer className="mt-8 pt-3 border-t border-slate-200 text-center text-[11px] text-slate-500">
            Copyright 2026 National Power System Modelling & Simulation Platform | Machine Learning 4 Power Systems (ML4PS) | FUT Minna
          </footer>
        </main>
      </div>

      {/* AUTHENTICATION & ACCESS REQUEST MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#500b50]">
                  {authMode === 'login' ? 'Operator Sign In' : 'Request Research Access'}
                </h3>
                <p className="text-[10px] text-slate-500">
                  National Power System & Development Taskforce Security Gate
                </p>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Error & Success Messages */}
            {authError && (
              <div className="mt-3 p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 leading-tight">
                {authError}
              </div>
            )}
            {authSuccessMsg && (
              <div className="mt-3 p-3 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 leading-tight flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{authSuccessMsg}</span>
              </div>
            )}

            {/* Mode Switcher */}
            <div className="flex rounded border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold mt-4">
              <button
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
                className={`flex-1 py-1.5 rounded transition ${
                  authMode === 'login' ? 'bg-white text-[#500b50] shadow-xs' : 'text-slate-600'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
                className={`flex-1 py-1.5 rounded transition ${
                  authMode === 'register' ? 'bg-white text-[#500b50] shadow-xs' : 'text-slate-600'
                }`}
              >
                Request Access (Register)
              </button>
            </div>

            {/* 1. SIGN IN FORM */}
            {authMode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="mt-4 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Institutional Email
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="operator@futminna.edu.ng"
                      className="w-full rounded border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Temporary or Assigned Password
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="e.g. ML4PS-XXXX or Master Password"
                      className="w-full rounded border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Use the temporary password issued upon Taskforce Administrator approval.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded bg-[#500b50] py-2 text-xs font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50 mt-2"
                >
                  {authSubmitting ? 'Authenticating...' : 'Sign In to Platform'}
                </button>
              </form>
            )}

            {/* 2. REGISTRATION / ACCESS REQUEST FORM */}
            {authMode === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Full Name & Title
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Engr. Babatunde Musa"
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Institutional Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="b.musa@unilag.edu.ng"
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Institution / Organization
                    </label>
                    <input
                      type="text"
                      required
                      value={regInstitution}
                      onChange={(e) => setRegInstitution(e.target.value)}
                      placeholder="e.g. TCN / UNILAG"
                      className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={regDepartment}
                      onChange={(e) => setRegDepartment(e.target.value)}
                      placeholder="Electrical Engineering"
                      className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Reason for Research Access
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={regReason}
                    onChange={(e) => setRegReason(e.target.value)}
                    placeholder="State research objectives (e.g. transient stability study, under-frequency load shedding)..."
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Academic Referee (Optional)
                    </label>
                    <input
                      type="text"
                      value={regReferee}
                      onChange={(e) => setRegReferee(e.target.value)}
                      placeholder="e.g. Prof. J. Adebayo"
                      className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Research Tags / Focus
                    </label>
                    <input
                      type="text"
                      value={regTags}
                      onChange={(e) => setRegTags(e.target.value)}
                      placeholder="e.g. 330kV, UFLS, LMP"
                      className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded bg-[#500b50] py-2 text-xs font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50 mt-2"
                >
                  {authSubmitting ? 'Submitting Request...' : 'Submit Request for Approval'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}