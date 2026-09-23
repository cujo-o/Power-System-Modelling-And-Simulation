"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { SingleLineDiagram } from "@/components/diagram/SingleLineDiagram";
import { HomeTab } from "@/components/tabs/HomeTab";
import { GridStabilityTab } from "@/components/tabs/GridStabilityTab";
import { DynamicsTab } from "@/components/tabs/DynamicsTab";
import { MarketTab } from "@/components/tabs/MarketTab";
import { UploadTab } from "@/components/tabs/UploadTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";
import { AdminTab } from "@/components/tabs/AdminTab";
import { AboutTab } from "@/components/tabs/AboutTab";
import { api } from "@/services/api";
import { supabase } from "@/lib/supabase";
import {
  SimResult,
  DynamicSimResult,
  MarketResult,
  GridModelMeta,
  UserAccount,
  BusData,
  PowerFlowVariables,
} from "@/types/grid";
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
  CheckCircle2,
  FolderOpen,
} from "lucide-react";

export default function PowerPlatformDashboard() {
  const [activeTab, setActiveTab] = useState("Home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // User State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  // Auth Inputs
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regInstitution, setRegInstitution] = useState("");
  const [regDepartment, setRegDepartment] = useState("");
  const [regReason, setRegReason] = useState("");
  const [regReferee, setRegReferee] = useState("");
  const [regTags, setRegTags] = useState("330kV, Planning");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

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

  // Supabase Models State
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
  const [users, setUsers] = useState<UserAccount[]>([]);

  const handleCascadeTrigger = async (
    initialTripped: number[],
    threshold: number,
  ) => {
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
    setActiveTab("Visualization");
  };

  const navItems = [
    { id: "Home", label: "Dashboard", icon: Home },
    { id: "Grid Models", label: "Grid Stability Models", icon: Grid },
    { id: "Dynamics", label: "Time-Domain & PSS", icon: Activity },
    { id: "Market Simulations", label: "Market Simulations", icon: DollarSign },
    { id: "Data Upload", label: "Upload & Ingestion", icon: UploadCloud },
    { id: "Visualization", label: "Single-Line Diagram", icon: Layers },
    { id: "Reports", label: "Reports & Publications", icon: FileText },
    {
      id: "Admin Panel",
      label: "Organization & Leadership",
      icon: ShieldCheck,
    },
    { id: "About Us", label: "About Us (ML4PS)", icon: Info },
  ];

  // User session
  useEffect(() => {
    const saved = localStorage.getItem("ml4ps_user");
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch {}
    } else {
      const defaultAdmin: UserAccount = {
        id: "usr-1",
        name: "Opeyemi Ibrahim Abubakar",
        email: "operator@futminna.edu.ng",
        institution: "FUT Minna (ML4PS Group)",
        department: "Electrical & Electronics Engineering",
        role: "Taskforce Administrator",
        status: "APPROVED",
        registered_at: "2026-09-01 10:14",
      };
      setCurrentUser(defaultAdmin);
      localStorage.setItem("ml4ps_user", JSON.stringify(defaultAdmin));
    }
  }, []);

  // Sync models with Supabase
  const syncWithSupabase = async () => {
    setLoading(true);
    try {
      const { data: dbModels, error } = await supabase
        .from("grid_models")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (dbModels && dbModels.length > 0) {
        const mappedModels: GridModelMeta[] = dbModels.map(
          (m: any, idx: number) => ({
            id: m.id,
            name: m.name,
            voltage_level: m.voltage_level || "330kV",
            domain: m.domain || "Static & Dynamic",
            platform: m.platform || m.format || "MATPOWER",
            buses: m.buses,
            branches: m.branches,
            total_installed_mw: Number(m.total_installed_mw),
            total_demand_mw: Number(m.total_demand_mw),
            converged: m.converged,
            is_default: false,
            is_active: activeModelId ? m.id === activeModelId : idx === 0,
          }),
        );

        setModels(mappedModels);

        const targetModel = activeModelId
          ? dbModels.find((m: any) => m.id === activeModelId) || dbModels[0]
          : dbModels[0];

        if (targetModel) {
          setActiveModelId(targetModel.id);
          await api.loadPayload({
            id: targetModel.id,
            name: targetModel.name,
            voltage_level: targetModel.voltage_level,
            domain: targetModel.domain,
            platform: targetModel.platform,
            network_payload: targetModel.network_payload,
          });

          const simRes = await api.runPowerFlow(pfVariables, trippedLines);
          setResults(simRes);
          setDivergedNotice(
            !simRes.converged ? simRes.message || "Diverged" : null,
          );
        }
      } else {
        setModels([]);
        setActiveModelId(null);
        setResults(null);
      }

      const userList = await api.getUsers();
      setUsers(userList);
    } catch (err: any) {
      console.warn("Sync notice:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncWithSupabase();
  }, []);

  const runSim = async () => {
    setLoading(true);
    try {
      const simRes = await api.runPowerFlow(pfVariables, trippedLines);
      setResults(simRes);
      setDivergedNotice(
        !simRes.converged ? simRes.message || "Calculation diverged" : null,
      );
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

  const handleActivateModel = async (id: string) => {
    setLoading(true);
    try {
      const { data: dbModel } = await supabase
        .from("grid_models")
        .select("*")
        .eq("id", id)
        .single();

      if (dbModel) {
        setActiveModelId(dbModel.id);
        await api.loadPayload({
          id: dbModel.id,
          name: dbModel.name,
          voltage_level: dbModel.voltage_level,
          domain: dbModel.domain,
          platform: dbModel.platform,
          network_payload: dbModel.network_payload,
        });
        setTrippedLines([]);
        setSelectedBus(null);
        await syncWithSupabase();
        await runSim();
        await runMkt();
      }
    } catch {
      alert("Failed to activate model.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setUploadLoading(true);
    setUploadNotice(null);

    try {
      const res = await api.uploadModel(formData);

      const { error: dbError } = await supabase.from("grid_models").insert({
        id: res.model_id,
        name: res.filename,
        format: res.format,
        voltage_level: res.voltage_level,
        domain: "Static & Dynamic",
        platform: res.format,
        buses: res.metrics.buses,
        branches: res.metrics.branches,
        total_installed_mw: res.metrics.total_installed_mw,
        total_demand_mw: res.metrics.total_demand_mw,
        converged: res.converged,
        network_payload: res.network_payload,
        user_id: currentUser ? String(currentUser.id) : null,
      });

      if (dbError) throw dbError;

      setUploadNotice(
        `Model '${res.filename}' parsed and stored permanently in Supabase.`,
      );
      setActiveModelId(res.model_id);
      await syncWithSupabase();
      await runSim();
      await runMkt();
      await runDyn();
    } catch (err: any) {
      setUploadNotice(`Upload Error: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to permanently delete this model from Supabase?",
      )
    )
      return;
    try {
      await supabase.from("grid_models").delete().eq("id", id);
      await api.deleteModel(id);
      await syncWithSupabase();
    } catch {
      alert("Could not delete model.");
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
      const res = await api.loginUser(loginEmail, loginPassword);
      setCurrentUser(res.user);
      localStorage.setItem("ml4ps_user", JSON.stringify(res.user));
      setShowAuthModal(false);
      setLoginPassword("");
    } catch (err: any) {
      setAuthError(err.message || "Login failed");
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
      const updatedUsers = await api.getUsers();
      setUsers(updatedUsers);
    } catch (err: any) {
      setAuthError(err.message || "Registration failed");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("ml4ps_user");
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
        desktopCollapsed={desktopCollapsed}
        setDesktopCollapsed={setDesktopCollapsed}
        currentUser={currentUser}
        onLoginClick={() => {
          setAuthMode("login");
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
            setAuthMode("login");
            setShowAuthModal(true);
          }}
          desktopCollapsed={desktopCollapsed}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col justify-between">
          <div>
            {activeTab === "Home" && <HomeTab onNavigate={setActiveTab} />}

            {activeTab === "Grid Models" && (
              <GridStabilityTab
                modelName={results?.model_name || "No Active Model"}
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

            {activeTab === "Dynamics" && (
              <DynamicsTab
                dynResult={dynResult}
                dynLoading={dynLoading}
                onRunSimulation={runDyn}
                buses={results?.buses || []}
                onRunMultiMachine={handleRunMultiMachine}
              />
            )}

            {activeTab === "Market Simulations" && (
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

            {activeTab === "Data Upload" && (
              <UploadTab
                uploadNotice={uploadNotice}
                uploadLoading={uploadLoading}
                onFileUpload={handleFileUpload}
                models={models}
                onActivate={handleActivateModel}
                onDelete={handleDeleteModel}
                currentUser={currentUser}
                onLoginClick={() => {
                  setAuthMode("login");
                  setShowAuthModal(true);
                }}
              />
            )}

            {activeTab === "Visualization" && (
              <>
                {!results || results.buses.length === 0 ? (
                  <div className="h-96 rounded-lg border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center p-6 text-center">
                    <FolderOpen className="h-12 w-12 text-slate-400 mb-3" />
                    <h3 className="text-sm font-bold text-slate-800">
                      No Active Grid Topology
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                      Upload a network case file (.m, .json, .xlsx, .raw) to
                      generate and visualize the single-line diagram.
                    </p>
                    <button
                      onClick={() => setActiveTab("Data Upload")}
                      className="mt-4 px-4 py-2 rounded bg-[#500b50] text-white text-xs font-bold hover:bg-[#680f68]"
                    >
                      Go to Upload & Ingestion
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
                    modelName={results?.model_name || ""}
                  />
                )}
              </>
            )}

            {activeTab === "Reports" && (
              <ReportsTab
                results={results}
                modelName={
                  results?.model_name ||
                  models.find((m) => m.id === activeModelId)?.name ||
                  "Active Grid Case"
                }
                currentUser={currentUser}
                pfVariables={pfVariables}
                dynResult={dynResult}
              />
            )}

            {activeTab === "Admin Panel" && <AdminTab />}

            {activeTab === "About Us" && <AboutTab />}
          </div>

          <footer className="mt-8 pt-3 border-t border-slate-200 text-center text-[11px] text-slate-500">
            Copyright 2026 National Power System Modelling & Simulation Platform
            | Machine Learning 4 Power Systems (ML4PS) | FUT Minna
          </footer>
        </main>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#500b50]">
                  {authMode === "login"
                    ? "Operator Sign In"
                    : "Request Research Access"}
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

            <div className="flex rounded border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold mt-4">
              <button
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
                className={`flex-1 py-1.5 rounded transition ${
                  authMode === "login"
                    ? "bg-white text-[#500b50] shadow-xs"
                    : "text-slate-600"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
                className={`flex-1 py-1.5 rounded transition ${
                  authMode === "register"
                    ? "bg-white text-[#500b50] shadow-xs"
                    : "text-slate-600"
                }`}
              >
                Request Access (Register)
              </button>
            </div>

            {authMode === "login" && (
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
                      placeholder="ML4PS-ADMIN or temporary password"
                      className="w-full rounded border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded bg-[#500b50] py-2 text-xs font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50 mt-2"
                >
                  {authSubmitting ? "Authenticating..." : "Sign In to Platform"}
                </button>
              </form>
            )}

            {authMode === "register" && (
              <form
                onSubmit={handleRegisterSubmit}
                className="mt-4 space-y-2.5 max-h-[65vh] overflow-y-auto pr-1"
              >
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Full Name & Title
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Engr. Saliu Adamu"
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Institutional Email
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="user@niso.gov.ng"
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Institution
                    </label>
                    <input
                      type="text"
                      required
                      value={regInstitution}
                      onChange={(e) => setRegInstitution(e.target.value)}
                      placeholder="NISO / University"
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
                    placeholder="Describe research goals (e.g., dynamic voltage stability, contingency analysis)..."
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Referee (Optional)
                    </label>
                    <input
                      type="text"
                      value={regReferee}
                      onChange={(e) => setRegReferee(e.target.value)}
                      placeholder="e.g. Prof. Lead"
                      className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Research Focus Tags
                    </label>
                    <input
                      type="text"
                      value={regTags}
                      onChange={(e) => setRegTags(e.target.value)}
                      placeholder="e.g. 330kV, Planning, UFLS"
                      className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#500b50]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded bg-[#500b50] py-2 text-xs font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50 mt-2"
                >
                  {authSubmitting
                    ? "Submitting Application..."
                    : "Submit Request for Approval"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
