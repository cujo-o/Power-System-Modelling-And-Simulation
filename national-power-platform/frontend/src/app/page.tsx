"use client";

import React, { useState, useEffect } from "react";
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
  Activity,
  Sliders,
  LogIn,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  FileCode,
} from "lucide-react";

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

const FALLBACK_COORDS: Record<number, { x: number; y: number }> = {
  0: { x: 200, y: 90 },
  1: { x: 240, y: 150 },
  2: { x: 400, y: 120 },
  3: { x: 430, y: 200 },
  4: { x: 270, y: 260 },
  5: { x: 170, y: 350 },
  6: { x: 230, y: 410 },
  7: { x: 360, y: 350 },
  8: { x: 460, y: 410 },
};

export default function PowerPlatformDashboard() {
  const [activeTab, setActiveTab] = useState("Home");
  const [loading, setLoading] = useState(false);
  const [loadMultiplier, setLoadMultiplier] = useState(1.0);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [results, setResults] = useState<SimResult | null>(null);
  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);

  // Upload State
  const [uploadResult, setUploadResult] = useState<UploadValidation | null>(
    null,
  );
  const [uploadLoading, setUploadLoading] = useState(false);

  const navItems = [
    { id: "Home", label: "Home", icon: Home },
    { id: "Grid Models", label: "Grid Models", icon: Grid },
    { id: "Market Simulations", label: "Market Simulations", icon: DollarSign },
    { id: "Data Upload", label: "Data Upload/Download", icon: UploadCloud },
    { id: "Visualization", label: "Visualization Tools", icon: BarChart3 },
    { id: "Reports", label: "Reports & Publications", icon: FileText },
    { id: "Admin Panel", label: "Task Force/Admin Panel", icon: ShieldCheck },
  ];

  const runSimulation = async (
    multiplier = loadMultiplier,
    outages = trippedLines,
  ) => {
    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/simulate/power-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          load_multiplier: multiplier,
          tripped_lines: outages,
        }),
      });
      const data = await res.json();
      setResults(data);
      if (selectedBus && data.buses) {
        const updated = data.buses.find(
          (b: BusData) => b.id === selectedBus.id,
        );
        if (updated) setSelectedBus(updated);
      }
    } catch (err) {
      console.error("Simulation request failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSimulation(1.0, []);
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
    formData.append("file", file);

    setUploadLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/upload/matpower", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }

      const data: UploadValidation = await res.json();
      setUploadResult(data);
      setTrippedLines([]);
      setLoadMultiplier(1.0);
      await runSimulation(1.0, []);
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleResetBaseline = async () => {
    try {
      await fetch("http://127.0.0.1:8000/api/grid/reset", { method: "POST" });
      setUploadResult(null);
      setTrippedLines([]);
      setLoadMultiplier(1.0);
      await runSimulation(1.0, []);
    } catch (err) {
      console.error("Reset failed:", err);
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
      {/* Top Header */}
      <header className="flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-950 px-6 shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400">
            <Zap className="h-5 w-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold uppercase tracking-wider text-slate-100 md:text-base">
                National Power System Modelling & Simulation Platform
              </h1>
              <span className="rounded bg-emerald-950 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-800">
                {results?.model_name || "Nigeria 330kV EMS"}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              National Research Fund (NRF) Static & Dynamic Grid Engine
            </p>
          </div>
        </div>

        {/* Global Live Telemetry */}
        <div className="hidden lg:flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2 border-r border-slate-800 pr-6">
            <Activity
              className={`h-4 w-4 ${results && (results.frequency < 49.8 || results.frequency > 50.2) ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}
            />
            <div>
              <span className="text-slate-400">Frequency: </span>
              <span className="font-mono font-bold text-slate-100">
                {results?.frequency
                  ? `${results.frequency.toFixed(2)} Hz`
                  : "50.00 Hz"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 border-r border-slate-800 pr-6">
            <span className="text-slate-400">Total Generation: </span>
            <span className="font-mono font-bold text-slate-100">
              {results?.total_gen_mw
                ? `${results.total_gen_mw.toLocaleString()} MW`
                : "--"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Grid Losses: </span>
            <span className="font-mono font-bold text-slate-100">
              {results?.total_losses_mw
                ? `${results.total_losses_mw} MW`
                : "--"}
            </span>
          </div>
        </div>

        <button className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700">
          <LogIn className="h-3.5 w-3.5" />
          <span>Operator Login</span>
        </button>
      </header>

      {/* Main Framework Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-slate-950 p-4 flex flex-col justify-between">
          <nav className="space-y-1.5">
            {navItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span>Solver Engine</span>
              <span className="font-semibold text-emerald-400">
                Pandapower Ready
              </span>
            </div>
            {uploadResult && (
              <button
                onClick={handleResetBaseline}
                className="w-full flex items-center justify-center gap-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 py-1 text-[11px] font-medium text-slate-200 transition"
              >
                <RotateCcw className="h-3 w-3 text-emerald-400" />
                <span>Reset to 330kV Baseline</span>
              </button>
            )}
          </div>
        </aside>

        {/* Workspace Content */}
        <main className="flex-1 overflow-y-auto bg-slate-900 p-8">
          {/* TAB 1: HOME */}
          {activeTab === "Home" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-slate-100">
                  National Grid Simulation Workspace
                </h2>
                <p className="text-sm text-slate-400">
                  Select a primary module below to perform dynamic studies,
                  economic dispatch, or upload network parameters.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {[
                  {
                    title: "GRID STABILITY MODELS",
                    desc: "Newton-Raphson power flow, N-1 contingency studies, and transient frequency response.",
                    icon: TrendingUp,
                    color:
                      "from-blue-500/20 to-cyan-500/10 border-blue-500/30 text-blue-400",
                    action: () => setActiveTab("Grid Models"),
                  },
                  {
                    title: "MARKET SIMULATION MODELS",
                    desc: "Merit order dispatch, locational marginal pricing (LMP), and hydro-thermal generation optimization.",
                    icon: DollarSign,
                    color:
                      "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400",
                    action: () => setActiveTab("Market Simulations"),
                  },
                  {
                    title: "DATA UPLOAD & VALIDATION",
                    desc: "SCADA telemetry ingestion, IEEE MATPOWER parser, and automated topology error checking.",
                    icon: UploadCloud,
                    color:
                      "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-400",
                    action: () => setActiveTab("Data Upload"),
                  },
                  {
                    title: "REPORTS & VISUALIZATION",
                    desc: "Single-line diagrams, voltage profile heatmaps, transmission congestion, and PDF audit exports.",
                    icon: BarChart3,
                    color:
                      "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400",
                    action: () => setActiveTab("Visualization"),
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
                      <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: GRID MODELS */}
          {activeTab === "Grid Models" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">
                    Static Power Flow & N-1 Contingency Analysis
                  </h2>
                  <p className="text-sm text-slate-400">
                    Active Model:{" "}
                    <span className="text-emerald-400 font-mono font-bold">
                      {results?.model_name || "Nigeria 330kV Baseline"}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                    <Sliders className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs text-slate-400">Load Scale:</span>
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
                      className="w-20 accent-emerald-500 cursor-pointer"
                    />
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      {(loadMultiplier * 100).toFixed(0)}%
                    </span>
                  </div>

                  <button
                    onClick={() => runSimulation()}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    <span>{loading ? "Solving..." : "Re-Run"}</span>
                  </button>
                </div>
              </div>

              {/* Substation Bus Voltages Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
                <div className="border-b border-slate-800 bg-slate-900/60 px-5 py-3 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-200">
                    Substation Bus Voltage Profiles ($|V|$ in p.u.)
                  </h3>
                  <span className="text-xs text-slate-400">
                    Grid Code Limit: 0.95 – 1.05 p.u.
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Bus ID</th>
                        <th className="p-3">Substation</th>
                        <th className="p-3">Zone</th>
                        <th className="p-3">Voltage (|V| p.u.)</th>
                        <th className="p-3">Phase Angle (°)</th>
                        <th className="p-3">Active (MW)</th>
                        <th className="p-3">Reactive (MVAR)</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {results?.buses?.map((bus) => {
                        const isUnder = bus.v_pu < 0.95;
                        const isOver = bus.v_pu > 1.05;
                        return (
                          <tr key={bus.id} className="hover:bg-slate-900/40">
                            <td className="p-3 font-mono font-bold text-slate-500">
                              #{bus.id}
                            </td>
                            <td className="p-3 font-semibold text-slate-100">
                              {bus.name}
                            </td>
                            <td className="p-3 text-slate-400">{bus.zone}</td>
                            <td className="p-3 font-mono font-bold">
                              <span
                                className={
                                  isUnder
                                    ? "text-rose-400"
                                    : isOver
                                      ? "text-amber-400"
                                      : "text-emerald-400"
                                }
                              >
                                {bus.v_pu.toFixed(3)}
                              </span>
                            </td>
                            <td className="p-3 font-mono">
                              {bus.va_deg.toFixed(2)}°
                            </td>
                            <td className="p-3 font-mono">{bus.p_mw}</td>
                            <td className="p-3 font-mono">{bus.q_mvar}</td>
                            <td className="p-3">
                              {isUnder ? (
                                <span className="flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                                  <AlertTriangle className="h-3 w-3" /> Low
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                                  <CheckCircle2 className="h-3 w-3" /> Stable
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

              {/* N-1 Contingency Breaker Controls */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
                <h3 className="text-sm font-bold text-slate-200 mb-1">
                  N-1 Line Contingency & Breaker Controls
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Click "Trip" to open a breaker and see live power flow
                  redistribution across the remaining corridors.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {results?.lines?.map((line) => {
                    const isTripped = trippedLines.includes(line.id);
                    return (
                      <div
                        key={line.id}
                        className={`rounded-lg border p-3 flex flex-col justify-between transition ${
                          isTripped
                            ? "border-rose-900/50 bg-rose-950/20"
                            : line.loading_percent > 85
                              ? "border-amber-500/50 bg-amber-950/20"
                              : "border-slate-800 bg-slate-900"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-200 truncate">
                            {line.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              !isTripped
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : "bg-rose-950 text-rose-400 border border-rose-800"
                            }`}
                          >
                            {!isTripped ? "In Service" : "Tripped (N-1)"}
                          </span>
                        </div>

                        <div className="space-y-1 font-mono text-[11px] text-slate-400 mb-3">
                          <div className="flex justify-between">
                            <span>Flow:</span>
                            <span className="text-slate-200 font-bold">
                              {line.flow_mw} MW
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Loading:</span>
                            <span
                              className={
                                line.loading_percent > 85
                                  ? "text-amber-400 font-bold"
                                  : ""
                              }
                            >
                              {line.loading_percent}%
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => toggleLine(line.id)}
                          className={`w-full py-1.5 rounded text-[11px] font-bold transition ${
                            !isTripped
                              ? "bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600 hover:text-white"
                              : "bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600 hover:text-white"
                          }`}
                        >
                          {!isTripped ? "Trip Breaker (N-1)" : "Reclose Line"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DATA UPLOAD & VALIDATION */}
          {activeTab === "Data Upload" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">
                    Grid Model Ingestion & Validation
                  </h2>
                  <p className="text-sm text-slate-400">
                    Upload MATPOWER (.m) case files to validate network topology
                    and load into the active simulation session.
                  </p>
                </div>
                {uploadResult && (
                  <button
                    onClick={handleResetBaseline}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Reset to 330kV Baseline</span>
                  </button>
                )}
              </div>

              {/* Upload Dropzone */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 space-y-6">
                <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-8 text-center transition flex flex-col items-center justify-center bg-slate-900/40">
                  <UploadCloud className="h-12 w-12 text-slate-400 mb-3" />
                  <p className="text-sm font-semibold text-slate-200">
                    Select or drop a MATPOWER case file (.m)
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Supports MATPOWER cases, IEEE standard models, or TCN grid
                    configurations
                  </p>

                  <input
                    type="file"
                    id="fileUploadInput"
                    accept=".m"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <label
                    htmlFor="fileUploadInput"
                    className={`mt-4 cursor-pointer rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 ${
                      uploadLoading ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    {uploadLoading ? "Parsing Case..." : "Browse .m File"}
                  </label>
                </div>

                {/* Validation Scorecard Display */}
                {uploadResult && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-5 w-5 text-emerald-400" />
                        <span className="font-bold text-slate-100 text-sm">
                          {uploadResult.filename}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                          uploadResult.converged
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : "bg-rose-950 text-rose-300 border border-rose-800"
                        }`}
                      >
                        {uploadResult.converged
                          ? "AC Solved & Verified"
                          : "Diverged / Ill-Conditioned"}
                      </span>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Total Buses</span>
                        <p className="text-lg font-mono font-bold text-slate-100 mt-1">
                          {uploadResult.metrics.buses}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Branches / Lines</span>
                        <p className="text-lg font-mono font-bold text-slate-100 mt-1">
                          {uploadResult.metrics.branches}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Installed Gen</span>
                        <p className="text-lg font-mono font-bold text-cyan-400 mt-1">
                          {uploadResult.metrics.total_installed_mw} MW
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Total Demand</span>
                        <p className="text-lg font-mono font-bold text-amber-400 mt-1">
                          {uploadResult.metrics.total_demand_mw} MW
                        </p>
                      </div>
                    </div>

                    {/* Topology Pre-Checks */}
                    <div className="space-y-1.5 pt-2 text-xs">
                      <div className="flex items-center gap-2">
                        {uploadResult.validation.has_slack_bus ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-400" />
                        )}
                        <span className="text-slate-300">
                          Slack (Swing) Bus:{" "}
                          {uploadResult.validation.has_slack_bus
                            ? "Present"
                            : "Missing reference generator"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!uploadResult.validation.islanding_detected ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                        )}
                        <span className="text-slate-300">
                          Topological Islanding:{" "}
                          {uploadResult.validation.islanding_detected
                            ? `Detected on Bus IDs: ${uploadResult.validation.isolated_bus_ids.join(", ")}`
                            : "Zero disconnected nodes identified"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: VISUALIZATION TOOLS */}
          {activeTab === "Visualization" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">
                    Interactive Single-Line Diagram (SLD)
                  </h2>
                  <p className="text-sm text-slate-400">
                    Vector representation of the active grid topology. Click any
                    substation node to inspect live telemetry.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950 p-4 relative overflow-hidden flex flex-col items-center justify-center">
                  <svg
                    viewBox="100 40 440 420"
                    className="w-full h-[460px] select-none"
                  >
                    <defs>
                      <filter
                        id="node-glow"
                        x="-20%"
                        y="-20%"
                        width="140%"
                        height="140%"
                      >
                        <feGaussianBlur stdDeviation="3" result="glow" />
                        <feMerge>
                          <feMergeNode in="glow" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* Transmission Lines */}
                    {results?.lines.map((line) => {
                      const fromBus = results.buses.find(
                        (b) => b.id === line.from_bus,
                      );
                      const toBus = results.buses.find(
                        (b) => b.id === line.to_bus,
                      );
                      if (!fromBus || !toBus) return null;

                      const cFrom = getCoordinates(fromBus);
                      const cTo = getCoordinates(toBus);
                      const isTripped = trippedLines.includes(line.id);

                      return (
                        <g
                          key={line.id}
                          className="cursor-pointer"
                          onClick={() => toggleLine(line.id)}
                        >
                          <line
                            x1={cFrom.x}
                            y1={cFrom.y}
                            x2={cTo.x}
                            y2={cTo.y}
                            stroke={
                              isTripped
                                ? "#e11d48"
                                : line.loading_percent > 85
                                  ? "#f59e0b"
                                  : "#059669"
                            }
                            strokeWidth={isTripped ? 2 : 3}
                            strokeDasharray={isTripped ? "6 6" : "none"}
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

                    {/* Substation Nodes */}
                    {results?.buses.map((bus) => {
                      const isSelected = selectedBus?.id === bus.id;
                      const isUnder = bus.v_pu < 0.95;
                      const isOver = bus.v_pu > 1.05;
                      const nodeColor = isUnder
                        ? "#f43f5e"
                        : isOver
                          ? "#fbbf24"
                          : "#10b981";
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
                            filter={isSelected ? "url(#node-glow)" : undefined}
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
                            {bus.name.split(" ")[0]}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Substation Inspector */}
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-400" /> Substation
                      Inspector
                    </h3>
                    {selectedBus ? (
                      <div className="space-y-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[10px] uppercase">
                            Substation
                          </span>
                          <span className="font-bold text-slate-100 text-sm">
                            {selectedBus.name}
                          </span>
                          <span className="block text-[11px] text-slate-400 mt-0.5">
                            {selectedBus.zone} Zone
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 font-mono">
                          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">
                              Voltage (|V|)
                            </span>
                            <span
                              className={`font-bold ${selectedBus.v_pu < 0.95 ? "text-rose-400" : "text-emerald-400"}`}
                            >
                              {selectedBus.v_pu} p.u.
                            </span>
                          </div>
                          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">
                              Phase Angle
                            </span>
                            <span className="font-bold text-slate-200">
                              {selectedBus.va_deg}°
                            </span>
                          </div>
                          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">
                              Active Load/Gen
                            </span>
                            <span className="font-bold text-cyan-400">
                              {selectedBus.p_mw} MW
                            </span>
                          </div>
                          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">
                              Reactive Flow
                            </span>
                            <span className="font-bold text-amber-400">
                              {selectedBus.q_mvar} MVAR
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-48 flex items-center justify-center text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg p-4">
                        Click on any node in the Single-Line Diagram to inspect
                        live bus telemetry.
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between">
                    <span>Click corridors to trip breakers (N-1)</span>
                    <span className="text-emerald-400">● Live 330kV Map</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Placeholders */}
          {["Market Simulations", "Reports", "Admin Panel"].includes(
            activeTab,
          ) && (
            <div className="flex h-full items-center justify-center text-slate-500">
              <p>{activeTab} module is under construction.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
