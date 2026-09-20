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
import {
  SimResult,
  DynamicSimResult,
  MarketResult,
  GridModelMeta,
  UserAccount,
  BusData,
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
} from "lucide-react";

export default function PowerPlatformDashboard() {
  const [activeTab, setActiveTab] = useState("Home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  //const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com';

  // Grid Simulation State
  const [loadMultiplier, setLoadMultiplier] = useState(1.0);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [results, setResults] = useState<SimResult | null>(null);
  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);
  const [divergedNotice, setDivergedNotice] = useState<string | null>(null);

  // Models, Dynamics & Market State
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
    { id: "Home", label: "Dashboard", icon: Home },
    { id: "Grid Models", label: "Grid Stability Models", icon: Grid },
    { id: "Dynamics", label: "Time-Domain & PSS", icon: Activity },
    { id: "Market Simulations", label: "Market Simulations", icon: DollarSign },
    { id: "Data Upload", label: "Upload & Ingestion", icon: UploadCloud },
    { id: "Visualization", label: "Single-Line Diagram", icon: Layers },
    { id: "Reports", label: "Reports & Publications", icon: FileText },
    { id: "Admin Panel", label: "Admin & Approvals", icon: ShieldCheck },
    { id: "About Us", label: "About Us (ML4PS)", icon: Info },
  ];

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
      setDivergedNotice(
        !simRes.converged ? simRes.message || "Diverged" : null,
      );
    } catch {
      // Backend offline notice handled gracefully
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
      setDivergedNotice(
        !simRes.converged ? simRes.message || "Diverged" : null,
      );
    } finally {
      setLoading(false);
    }
  };

  const runDyn = async () => {
    setDynLoading(true);
    try {
      const data = await api.runDynamics(
        dynDisturbance,
        enableGovernor,
        enablePSS,
      );
      setDynResult(data);
    } finally {
      setDynLoading(false);
    }
  };

  const runMkt = async () => {
    setMarketLoading(true);
    try {
      const data = await api.runMarket(
        loadMultiplier,
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
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploadLoading(true);
    setUploadNotice(null);
    try {
      const res = await api.uploadModel(formData);
      setUploadNotice(
        `Model '${res.filename}' parsed successfully (${res.format} / ${res.voltage_level}).`,
      );
      refreshData();
    } catch (err: any) {
      setUploadNotice(`Upload Error: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#f7f5f9] font-sans text-slate-800 antialiased overflow-hidden">
      <Header
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        userEmail="operator@futminna.edu.ng"
        onLoginClick={() => {}}
        onLogoutClick={() => {}}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          navItems={navItems}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onReset={handleReset}
          loading={loading}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col justify-between">
          <div>
            {activeTab === "Home" && <HomeTab onNavigate={setActiveTab} />}

            {activeTab === "Grid Models" && (
              <GridStabilityTab
                modelName={results?.model_name || "Nig 10-Bus Benchmark"}
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
              />
            )}

            {activeTab === "Dynamics" && (
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
                onDelete={async (id) => {
                  await api.deleteModel(id);
                  refreshData();
                }}
              />
            )}

            {activeTab === "Visualization" && (
              <SingleLineDiagram
                buses={results?.buses || []}
                lines={results?.lines || []}
                trippedLines={trippedLines}
                toggleLine={handleToggleLine}
                selectedBus={selectedBus}
                setSelectedBus={setSelectedBus}
                onReset={handleReset}
              />
            )}

            {activeTab === "Reports" && <ReportsTab results={results} />}

            {activeTab === "Admin Panel" && (
              <AdminTab
                users={users}
                onApprove={async (id) => {
                  await api.approveUser(id);
                  const updated = await api.getUsers();
                  setUsers(updated);
                }}
                onReject={async (id) => {
                  await api.rejectUser(id);
                  const updated = await api.getUsers();
                  setUsers(updated);
                }}
              />
            )}

            {activeTab === "About Us" && <AboutTab />}
          </div>

          <footer className="mt-8 pt-3 border-t border-slate-200 text-center text-[11px] text-slate-500">
            Copyright 2026 National Power System Modelling & Simulation Platform
            | Machine Learning 4 Power Systems (ML4PS) | FUT Minna
          </footer>
        </main>
      </div>
    </div>
  );
}
