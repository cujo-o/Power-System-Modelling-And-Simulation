"use client";

import React, { useState } from "react";
import {
  BusData,
  LineData,
  GridModelMeta,
  PowerFlowVariables,
  NewBusElement,
  NewLineElement,
  NewGenElement,
  CascadeResult,
} from "@/types/grid";
import {
  AlertTriangle,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Plus,
  Trash2,
  GitBranch,
  Sliders,
  ShieldAlert,
  Flame,
  ArrowRight,
  FolderOpen,
  Check,
  Zap,
  Power,
  ShieldCheck,
} from "lucide-react";

interface Props {
  modelName: string;
  divergedNotice: string | null;
  pfVariables: PowerFlowVariables;
  setPfVariables: React.Dispatch<React.SetStateAction<PowerFlowVariables>>;
  runSimulation: () => void;
  onReset: () => void;
  loading: boolean;
  buses: BusData[];
  lines: LineData[];
  trippedLines: number[];
  toggleLine: (id: number) => void;
  models: GridModelMeta[];
  onActivateModel: (id: string) => Promise<void> | void;
  onNavigateTab: (tab: string) => void;
  onCascadeTrigger: (
    initialTripped: number[],
    threshold: number,
  ) => Promise<CascadeResult>;
  onApplyCascadeTrips: (trippedList: number[]) => void;
}

const formatRegionalZone = (zone: any, busName: string): string => {
  if (!zone || zone === "1.0" || zone === "1" || zone === 1) {
    const n = busName.toLowerCase();
    if (
      n.includes("egbin") ||
      n.includes("ikeja") ||
      n.includes("sakete") ||
      n.includes("aja") ||
      n.includes("osogbo") ||
      n.includes("ayede") ||
      n.includes("omotosho")
    )
      return "South-West";
    if (
      n.includes("kainji") ||
      n.includes("jebba") ||
      n.includes("shiroro") ||
      n.includes("katampe") ||
      n.includes("lokoja") ||
      n.includes("geregu") ||
      n.includes("ajaokuta") ||
      n.includes("zungeru") ||
      n.includes("gwagw")
    )
      return "North-Central";
    if (
      n.includes("benin") ||
      n.includes("sapele") ||
      n.includes("delta") ||
      n.includes("aladja") ||
      n.includes("ihovbor") ||
      n.includes("azura") ||
      n.includes("okpai") ||
      n.includes("asaba")
    )
      return "Mid-West";
    if (
      n.includes("afam") ||
      n.includes("alaoji") ||
      n.includes("adiagbo") ||
      n.includes("calabar") ||
      n.includes("ikot") ||
      n.includes("omoku") ||
      n.includes("owerri") ||
      n.includes("egbema") ||
      n.includes("nhaven") ||
      n.includes("ugwuaji") ||
      n.includes("onitsha")
    )
      return "South-East / SS";
    if (
      n.includes("kaduna") ||
      n.includes("kano") ||
      n.includes("kebbi") ||
      n.includes("mando") ||
      n.includes("funtua") ||
      n.includes("gusau")
    )
      return "North-West";
    if (
      n.includes("jos") ||
      n.includes("bauchi") ||
      n.includes("gombe") ||
      n.includes("yola") ||
      n.includes("maiduguri") ||
      n.includes("damaturu") ||
      n.includes("jalingo")
    )
      return "North-East";
    return "Main Grid";
  }
  return String(zone);
};

export const GridStabilityTab: React.FC<Props> = ({
  modelName,
  divergedNotice,
  pfVariables,
  setPfVariables,
  runSimulation,
  onReset,
  loading,
  buses,
  lines,
  trippedLines,
  toggleLine,
  models,
  onActivateModel,
  onNavigateTab,
  onCascadeTrigger,
  onApplyCascadeTrips,
}) => {
  const activeModel = models.find((m) => m.is_active);
  const [workflowStep, setWorkflowStep] = useState<
    "select_model" | "simulation_properties"
  >(activeModel ? "simulation_properties" : "select_model");

  const [simSubTab, setSimSubTab] = useState<"deck" | "cascade" | "planning">(
    "deck",
  );
  const [deckView, setDeckView] = useState<"buses" | "lines">("buses");
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Filters
  const [domainFilter, setDomainFilter] = useState<
    "ALL" | "Static" | "Dynamic"
  >("ALL");
  const [voltageFilter, setVoltageFilter] = useState<"ALL" | "330kV" | "132kV">(
    "ALL",
  );
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Cascade
  const [cascadeThreshold, setCascadeThreshold] = useState(100.0);
  const [initialTripLine, setInitialTripLine] = useState<number>(
    lines[0]?.id || 0,
  );
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(
    null,
  );

  // Planning Inputs
  const [newBusName, setNewBusName] = useState("");
  const [newBusKv, setNewBusKv] = useState(330);
  const [newBusZone, setNewBusZone] = useState("North-Central");
  const [newBusLoadP, setNewBusLoadP] = useState(0);

  const [newLineName, setNewLineName] = useState("");
  const [newLineFrom, setNewLineFrom] = useState<number>(buses[0]?.id || 1);
  const [newLineTo, setNewLineTo] = useState<number>(buses[1]?.id || 2);
  const [newLineLength, setNewLineLength] = useState(65);
  const [newLineConductor, setNewLineConductor] = useState("Bison 330kV");

  const [newGenName, setNewGenName] = useState("");
  const [newGenBus, setNewGenBus] = useState<number>(buses[0]?.id || 1);
  const [newGenP, setNewGenP] = useState(150);
  const [newGenVm, setNewGenVm] = useState(1.03);

  const filteredModels = models.filter((m) => {
    const matchesDomain =
      domainFilter === "ALL" ||
      (domainFilter === "Static" &&
        (m.domain.includes("Static") || m.domain.includes("Steady"))) ||
      (domainFilter === "Dynamic" && m.domain.includes("Dynamic"));
    const matchesVoltage =
      voltageFilter === "ALL" || m.voltage_level.includes(voltageFilter);
    const matchesPlatform =
      platformFilter === "ALL" ||
      m.platform.toLowerCase().includes(platformFilter.toLowerCase());
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.voltage_level.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDomain && matchesVoltage && matchesPlatform && matchesSearch;
  });

  const handleActivateAndOpen = async (id: string) => {
    setActivatingId(id);
    try {
      await onActivateModel(id);
      setWorkflowStep("simulation_properties");
      setSimSubTab("deck");
    } finally {
      setActivatingId(null);
    }
  };

  // Auto-calculation on adding elements
  const handleAddBus = () => {
    if (!newBusName.trim()) return;
    const item: NewBusElement = {
      name: newBusName.trim(),
      vn_kv: newBusKv,
      zone: newBusZone,
      p_mw: newBusLoadP,
      q_mvar: newBusLoadP * 0.35,
    };
    setPfVariables((prev) => ({
      ...prev,
      newBuses: [...prev.newBuses, item],
    }));
    setNewBusName("");
    setNewBusLoadP(0);
    setTimeout(runSimulation, 50);
  };

  const handleAddLine = () => {
    if (!newLineName.trim()) return;
    const item: NewLineElement = {
      name: newLineName.trim(),
      from_bus: newLineFrom,
      to_bus: newLineTo,
      length_km: newLineLength,
      conductor_type: newLineConductor,
      vn_kv: newLineConductor.includes("330") ? 330 : 132,
    };
    setPfVariables((prev) => ({
      ...prev,
      newLines: [...prev.newLines, item],
    }));
    setNewLineName("");
    setTimeout(runSimulation, 50);
  };

  const handleAddGen = () => {
    if (!newGenName.trim()) return;
    const item: NewGenElement = {
      name: newGenName.trim(),
      bus: newGenBus,
      p_mw: newGenP,
      vm_pu: newGenVm,
      p_max_mw: newGenP * 1.5,
    };
    setPfVariables((prev) => ({
      ...prev,
      newGenerators: [...prev.newGenerators, item],
    }));
    setNewGenName("");
    setTimeout(runSimulation, 50);
  };

  // Removal helpers that auto-recalculate flow
  const handleRemoveBus = (index: number) => {
    setPfVariables((prev) => ({
      ...prev,
      newBuses: prev.newBuses.filter((_, i) => i !== index),
    }));
    setTimeout(runSimulation, 50);
  };

  const handleRemoveLine = (index: number) => {
    setPfVariables((prev) => ({
      ...prev,
      newLines: prev.newLines.filter((_, i) => i !== index),
    }));
    setTimeout(runSimulation, 50);
  };

  const handleRemoveGen = (index: number) => {
    setPfVariables((prev) => ({
      ...prev,
      newGenerators: prev.newGenerators.filter((_, i) => i !== index),
    }));
    setTimeout(runSimulation, 50);
  };

  const totalExtensionsCount =
    pfVariables.newBuses.length +
    pfVariables.newLines.length +
    pfVariables.newGenerators.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Breadcrumb Navigator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Grid Stability & Simulation Studio
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Operational variables deck, $N-1$ contingency switching, and
            regional expansion sandtable.
          </p>
        </div>

        {/* Workflow Switcher */}
        <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
          <button
            onClick={() => setWorkflowStep("select_model")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
              workflowStep === "select_model"
                ? "bg-[#500b50] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Search className="h-4 w-4" />
            <span>1. Choose / Activate Model</span>
          </button>

          <span className="text-slate-300 px-2">/</span>

          <button
            onClick={() => {
              if (activeModel || buses.length > 0)
                setWorkflowStep("simulation_properties");
            }}
            disabled={!activeModel && buses.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
              workflowStep === "simulation_properties"
                ? "bg-[#500b50] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>2. Simulation Properties</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: CHOOSE AND ACTIVATE MODEL                                         */}
      {/* ========================================================================= */}
      {workflowStep === "select_model" && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Filter Grid Models
              </span>
              <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                {filteredModels.length} of {models.length} Models
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Search Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. 330kV, 132kV, Kainji..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#500b50] bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Domain
                </label>
                <select
                  value={domainFilter}
                  onChange={(e: any) => setDomainFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 text-sm"
                >
                  <option value="ALL">All Domains (Static & Dynamic)</option>
                  <option value="Static">Static Power Flow</option>
                  <option value="Dynamic">Dynamic & Transient</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Voltage Class
                </label>
                <select
                  value={voltageFilter}
                  onChange={(e: any) => setVoltageFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 text-sm"
                >
                  <option value="ALL">All Voltage Classes</option>
                  <option value="330kV">330 kV Bulk Backbone</option>
                  <option value="132kV">132 kV Sub-Transmission</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Platform
                </label>
                <select
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 text-sm"
                >
                  <option value="ALL">All Tool Formats</option>
                  <option value="MATPOWER">MATPOWER (.m)</option>
                  <option value="PSAT">PSAT</option>
                  <option value="DIgSILENT">DIgSILENT PowerFactory</option>
                  <option value="ETAP">ETAP (.xlsx)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Model Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredModels.map((m) => {
              const isCurrentActive = m.is_active || m.name === modelName;

              return (
                <div
                  key={m.id}
                  className={`p-6 rounded-2xl border bg-white shadow-xs transition flex flex-col justify-between ${
                    isCurrentActive
                      ? "border-emerald-500 ring-2 ring-emerald-500/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-100 text-[#500b50]">
                          {m.voltage_level}
                        </span>
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700">
                          {m.platform}
                        </span>
                      </div>

                      {activatingId === m.id ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Activating Network Model...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 text-amber-300" />
                          <span>Activate & Load Model</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {m.name}
                    </h3>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-mono bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-xs text-slate-400 block font-sans font-medium">
                          Substations
                        </span>
                        <span className="font-bold text-slate-900">
                          {m.buses} Buses
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block font-sans font-medium">
                          Transmission Lines
                        </span>
                        <span className="font-bold text-slate-900">
                          {m.branches} Lines
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block font-sans font-medium">
                          Generation
                        </span>
                        <span className="font-bold text-[#500b50]">
                          {m.total_installed_mw.toLocaleString()} MW
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block font-sans font-medium">
                          Demand
                        </span>
                        <span className="font-bold text-slate-900">
                          {m.total_demand_mw.toLocaleString()} MW
                        </span>
                      </div>
                    </div>
                  </div>

                  {isCurrentActive ? (
                    <button
                      onClick={() => {
                        setWorkflowStep("simulation_properties");
                        setSimSubTab("deck");
                      }}
                      className="mt-5 w-full rounded-xl bg-emerald-700 text-white py-3 text-sm font-bold hover:bg-emerald-800 transition shadow-xs flex items-center justify-center gap-2"
                    >
                      <span>Open Simulation Properties</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivateAndOpen(m.id)}
                      disabled={activatingId !== null}
                      className="mt-5 w-full rounded-xl bg-[#500b50] text-white py-3 text-sm font-bold hover:bg-[#680f68] transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {activatingId === m.id ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Activating Model in Memory...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 text-amber-300" />
                          <span>Activate & Load Model</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: SIMULATION PROPERTIES                                             */}
      {/* ========================================================================= */}
      {workflowStep === "simulation_properties" && (
        <div className="space-y-6">
          {/* Active Model Indicator Header */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-[#500b50] text-white flex items-center justify-center shrink-0">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs uppercase font-bold text-emerald-700 tracking-wider">
                  Active Simulation Network
                </span>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {buses.length > 0 ? modelName : "No Active Model Loaded"}
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  {buses.length} Buses • {lines.length} Lines • Statutory Band:
                  0.95–1.05 pu
                  {trippedLines.length > 0 && (
                    <span className="text-rose-600 font-bold ml-2">
                      ({trippedLines.length} Line(s) Tripped on $N-1$)
                    </span>
                  )}
                </span>
              </div>
            </div>

            <button
              onClick={() => setWorkflowStep("select_model")}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 transition shadow-xs self-start sm:self-center"
            >
              <span>⇄ Switch / Select Model</span>
            </button>
          </div>

          {/* Sub-Tabs Selector */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-xs w-fit">
            <button
              onClick={() => setSimSubTab("deck")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
                simSubTab === "deck"
                  ? "bg-[#500b50] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span>Operational Deck</span>
            </button>

            <button
              onClick={() => setSimSubTab("cascade")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
                simSubTab === "cascade"
                  ? "bg-[#500b50] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Flame className="h-4 w-4 text-rose-500" />
              <span>Cascading Failure</span>
            </button>

            <button
              onClick={() => setSimSubTab("planning")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition relative ${
                simSubTab === "planning"
                  ? "bg-[#500b50] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <GitBranch className="h-4 w-4" />
              <span>Regional Planning</span>
              {totalExtensionsCount > 0 && (
                <span className="ml-1.5 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                  {totalExtensionsCount}
                </span>
              )}
            </button>
          </div>

          {/* 1. OPERATIONAL VARIABLES DECK */}
          {simSubTab === "deck" && (
            <div className="space-y-6">
              {divergedNotice && (
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
                  <span>{divergedNotice}</span>
                </div>
              )}

              {/* 5 High-Visibility Parameter Cards with 240% Demand Capability */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* 1. Demand Scale up to 2.40x (240%) */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-500">
                      Demand Scale
                    </label>
                    <span className="text-xs font-mono font-bold text-purple-900">
                      {(pfVariables.loadMultiplier * 100).toFixed(0)}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0.4"
                    max="2.4"
                    step="0.05"
                    value={pfVariables.loadMultiplier}
                    onChange={(e) =>
                      setPfVariables((v) => ({
                        ...v,
                        loadMultiplier: parseFloat(e.target.value) || 1.0,
                      }))
                    }
                    className="w-full accent-[#500b50] cursor-pointer"
                  />

                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>40%</span>
                    <span>100%</span>
                    <span>180%</span>
                    <span className="text-[#500b50] font-bold">240% Max</span>
                  </div>
                </div>

                {/* 2. Power Factor (cos φ) */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                    Power Factor (cos φ)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.75"
                    max="1.0"
                    value={pfVariables.targetPowerFactor}
                    onChange={(e) =>
                      setPfVariables((v) => ({
                        ...v,
                        targetPowerFactor: parseFloat(e.target.value) || 0.9,
                      }))
                    }
                    className="w-full text-base font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                  <span className="text-xs text-slate-400 mt-2 block">
                    Inductive MVAR ratio
                  </span>
                </div>

                {/* 3. Slack Voltage (V₀) */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                    Slack Voltage (V₀)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.005"
                      min="0.95"
                      max="1.10"
                      value={pfVariables.slackVoltagePu}
                      onChange={(e) =>
                        setPfVariables((v) => ({
                          ...v,
                          slackVoltagePu: parseFloat(e.target.value) || 1.05,
                        }))
                      }
                      className="w-full text-base font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5"
                    />
                    <span className="text-slate-500 text-xs">pu</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-2 block">
                    Egbin terminal setpoint
                  </span>
                </div>

                {/* 4. Shunt MVAR (ΔQ) */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                    Shunt MVAR (ΔQ)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="10"
                      value={pfVariables.shuntMvarCompensation}
                      onChange={(e) =>
                        setPfVariables((v) => ({
                          ...v,
                          shuntMvarCompensation:
                            parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full text-base font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5"
                    />
                    <span className="text-slate-500 text-xs">MVAR</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-2 block">
                    +Cap / -Reactor
                  </span>
                </div>

                {/* 5. Thermal Derating */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                    Thermal Derating
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="1.2"
                      value={pfVariables.thermalDeratingFactor}
                      onChange={(e) =>
                        setPfVariables((v) => ({
                          ...v,
                          thermalDeratingFactor:
                            parseFloat(e.target.value) || 1.0,
                        }))
                      }
                      className="w-full text-base font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5"
                    />
                    <span className="text-slate-500 font-mono text-sm">x</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-2 block">
                    Ambient temperature
                  </span>
                </div>
              </div>

              {/* Action Controls & Sub-View Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-xs gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
                    <button
                      onClick={() => setDeckView("buses")}
                      className={`px-3 py-1.5 rounded-md font-bold transition ${
                        deckView === "buses"
                          ? "bg-[#500b50] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Substation Voltages ({buses.length} Nodes)
                    </button>
                    <button
                      onClick={() => setDeckView("lines")}
                      className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 ${
                        deckView === "lines"
                          ? "bg-[#500b50] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Power className="h-3.5 w-3.5 text-rose-500" />
                      <span>$N-1$ Trip Breakers ({lines.length} Lines)</span>
                      {trippedLines.length > 0 && (
                        <span className="bg-rose-600 text-white rounded-full px-1.5 py-0.2 text-[10px] font-bold">
                          {trippedLines.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={runSimulation}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-xl bg-[#500b50] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span>Solve AC Flow</span>
                  </button>

                  <button
                    onClick={onReset}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition shadow-xs"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* VIEW A: SUBSTATION BUS VOLTAGE TABLE */}
              {deckView === "buses" && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
                    <span>
                      Substation Bus Voltage Profiles ({buses.length} Nodes)
                    </span>
                    <span className="font-normal text-xs text-white/80">
                      Statutory NERC Band: 0.95 – 1.05 p.u.
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-[420px]">
                    <table className="w-full text-left text-sm min-w-[600px]">
                      <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold sticky top-0">
                        <tr>
                          <th className="py-3 px-4">ID</th>
                          <th className="py-3 px-4">Substation Name</th>
                          <th className="py-3 px-4">Regional Zone</th>
                          <th className="py-3 px-4">Voltage (|V|)</th>
                          <th className="py-3 px-4">Angle (°)</th>
                          <th className="py-3 px-4">Active (MW)</th>
                          <th className="py-3 px-4">Reactive (MVAR)</th>
                          <th className="py-3 px-4">Compliance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {buses.map((bus) => {
                          const isUnder = bus.v_pu < 0.95;
                          const isOver = bus.v_pu > 1.05;
                          const zoneLabel = formatRegionalZone(
                            bus.zone,
                            bus.name,
                          );

                          return (
                            <tr key={bus.id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-4 font-mono text-slate-400 font-bold">
                                #{bus.id}
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-900">
                                {bus.name}
                              </td>
                              <td className="py-3 px-4 text-slate-600 font-medium">
                                {zoneLabel}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold">
                                <span
                                  className={
                                    isUnder
                                      ? "text-rose-600"
                                      : isOver
                                        ? "text-amber-600"
                                        : "text-emerald-700"
                                  }
                                >
                                  {bus.v_pu.toFixed(3)} pu
                                </span>
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {bus.va_deg.toFixed(2)}°
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {bus.p_mw}
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {bus.q_mvar}
                              </td>
                              <td className="py-3 px-4">
                                {isUnder ? (
                                  <span className="inline-flex items-center rounded-md bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                                    Under-voltage
                                  </span>
                                ) : isOver ? (
                                  <span className="inline-flex items-center rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                                    Over-voltage
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                                    Compliant
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
              )}

              {/* VIEW B: TRANSMISSION CORRIDORS & N-1 CONTINGENCY TRIP BREAKERS */}
              {deckView === "lines" && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
                    <span>
                      Transmission Lines & $N-1$ Contingency Breaker Deck (
                      {lines.length} Corridors)
                    </span>
                    <span className="font-normal text-xs text-white/80">
                      Click &quot;Trip Breaker&quot; to test instant $N-1$ power
                      redistribution
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-[420px]">
                    <table className="w-full text-left text-sm min-w-[700px]">
                      <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold sticky top-0">
                        <tr>
                          <th className="py-3 px-4">Line ID</th>
                          <th className="py-3 px-4">Transmission Corridor</th>
                          <th className="py-3 px-4">From $\to$ To</th>
                          <th className="py-3 px-4">Flow (MW)</th>
                          <th className="py-3 px-4">Thermal Loading</th>
                          <th className="py-3 px-4">Breaker Status</th>
                          <th className="py-3 px-4 text-right">
                            Switching Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {lines.map((l) => {
                          const isTripped = trippedLines.includes(l.id);
                          const isOverload = l.loading_percent > 100;

                          return (
                            <tr
                              key={l.id}
                              className={`hover:bg-slate-50/80 ${isTripped ? "bg-rose-50/50" : ""}`}
                            >
                              <td className="py-3 px-4 font-mono text-slate-400 font-bold">
                                #{l.id}
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-900">
                                {l.name}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-600 text-xs">
                                Bus #{l.from_bus} $\to$ #{l.to_bus}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold">
                                {isTripped
                                  ? "0.0 MW"
                                  : // LineData may not include p_mw in the TS type; tolerate several possible field names
                                    (() => {
                                      const flow =
                                        (l as any).p_mw ??
                                        (l as any).flow_mw ??
                                        (l as any).p_from_mw ??
                                        (l as any).p_to_mw ??
                                        0;
                                      return `${Number(flow).toFixed(1)} MW`;
                                    })()}
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {isTripped ? (
                                  <span className="text-slate-400">
                                    Isolated
                                  </span>
                                ) : (
                                  <span
                                    className={
                                      isOverload
                                        ? "text-rose-600 font-bold"
                                        : "text-slate-800"
                                    }
                                  >
                                    {l.loading_percent.toFixed(1)}%
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {isTripped ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
                                    Breaker Open (Tripped)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                                    Breaker Closed (In Service)
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  onClick={() => toggleLine(l.id)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs ${
                                    isTripped
                                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                      : "bg-rose-600 text-white hover:bg-rose-700"
                                  }`}
                                >
                                  {isTripped
                                    ? "Reclose Breaker"
                                    : "Trip Breaker ($N-1$)"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. CASCADING OUTAGES */}
          {simSubTab === "cascade" && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Initiating Outage
                    </label>
                    <select
                      value={initialTripLine}
                      onChange={(e) =>
                        setInitialTripLine(Number(e.target.value))
                      }
                      className="w-full border rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                    >
                      {lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          #{l.id}: {l.name} ({l.loading_percent}% load)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Overcurrent Threshold
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="90"
                        max="140"
                        step="5"
                        value={cascadeThreshold}
                        onChange={(e) =>
                          setCascadeThreshold(Number(e.target.value))
                        }
                        className="w-full accent-rose-600 cursor-pointer"
                      />
                      <span className="font-mono font-bold text-rose-700 text-base">
                        {cascadeThreshold}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={async () => {
                        setCascadeLoading(true);
                        try {
                          const res = await onCascadeTrigger(
                            [initialTripLine],
                            cascadeThreshold,
                          );
                          setCascadeResult(res);
                        } finally {
                          setCascadeLoading(false);
                        }
                      }}
                      disabled={cascadeLoading || lines.length === 0}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-700 text-white py-2.5 text-sm font-bold hover:bg-rose-800 transition shadow-xs disabled:opacity-50"
                    >
                      {cascadeLoading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Flame className="h-4 w-4" />
                      )}
                      <span>Run Cascade Loop</span>
                    </button>
                  </div>
                </div>
              </div>

              {cascadeResult && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-6 w-6 text-rose-600" />
                      <div>
                        <h4 className="font-bold text-slate-900">
                          {cascadeResult.status.replace(/_/g, " ")}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {cascadeResult.total_steps} stage(s) completed •{" "}
                          {cascadeResult.all_tripped_lines.length} corridors
                          disconnected.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        onApplyCascadeTrips(cascadeResult.all_tripped_lines)
                      }
                      className="px-4 py-2 rounded-lg bg-[#500b50] text-white font-bold text-xs shadow-xs"
                    >
                      View on Diagram
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. REGIONAL PLANNING WITH REAL-TIME EDITABLE EXPANSION LEDGER */}
          {simSubTab === "planning" && (
            <div className="space-y-6">
              {/* Proposal Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Propose Substation */}
                <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-sm border-b pb-2 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-[#500b50]" />
                    <span>1. Propose Substation</span>
                  </h4>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Substation Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. WUKARI 330"
                      value={newBusName}
                      onChange={(e) => setNewBusName(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Voltage
                      </label>
                      <select
                        value={newBusKv}
                        onChange={(e) => setNewBusKv(Number(e.target.value))}
                        className="w-full border rounded-lg px-2.5 py-2 text-sm bg-white"
                      >
                        <option value={330}>330 kV Bulk</option>
                        <option value={132}>132 kV Sub-T</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Zone
                      </label>
                      <select
                        value={newBusZone}
                        onChange={(e) => setNewBusZone(e.target.value)}
                        className="w-full border rounded-lg px-2.5 py-2 text-sm bg-white"
                      >
                        <option value="North-Central">North-Central</option>
                        <option value="North-West">North-West</option>
                        <option value="North-East">North-East</option>
                        <option value="South-West">South-West</option>
                        <option value="Mid-West">Mid-West</option>
                        <option value="South-South">South-South</option>
                        <option value="South-East">South-East</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Active Demand (MW)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newBusLoadP}
                      onChange={(e) => setNewBusLoadP(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <button
                    onClick={handleAddBus}
                    className="w-full py-2.5 rounded-lg bg-[#500b50] text-white font-bold text-xs hover:bg-[#680f68] transition"
                  >
                    + Add Substation Node & Re-Solve
                  </button>
                </div>

                {/* 2. Connect Corridor */}
                <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-sm border-b pb-2 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-[#500b50]" />
                    <span>2. Connect Line Corridor</span>
                  </h4>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Corridor Identifier
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MAKURDI - WUKARI"
                      value={newLineName}
                      onChange={(e) => setNewLineName(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        From Bus
                      </label>
                      <select
                        value={newLineFrom}
                        onChange={(e) => setNewLineFrom(Number(e.target.value))}
                        className="w-full border rounded-lg px-2.5 py-2 text-sm bg-white"
                      >
                        {buses.map((b) => (
                          <option key={b.id} value={b.id}>
                            #{b.id} {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        To Bus
                      </label>
                      <select
                        value={newLineTo}
                        onChange={(e) => setNewLineTo(Number(e.target.value))}
                        className="w-full border rounded-lg px-2.5 py-2 text-sm bg-white"
                      >
                        {buses.map((b) => (
                          <option key={b.id} value={b.id}>
                            #{b.id} {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Length (km)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={newLineLength}
                        onChange={(e) =>
                          setNewLineLength(Number(e.target.value))
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Conductor
                      </label>
                      <select
                        value={newLineConductor}
                        onChange={(e) => setNewLineConductor(e.target.value)}
                        className="w-full border rounded-lg px-2.5 py-2 text-sm bg-white"
                      >
                        <option value="Bison 330kV">Bison 330kV</option>
                        <option value="Bear 330kV">Bear 330kV</option>
                        <option value="Panther 132kV">Panther 132kV</option>
                        <option value="Wolf 132kV">Wolf 132kV</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleAddLine}
                    className="w-full py-2.5 rounded-lg bg-[#500b50] text-white font-bold text-xs hover:bg-[#680f68] transition"
                  >
                    + Connect Line & Re-Solve
                  </button>
                </div>

                {/* 3. Propose Power Plant */}
                <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-sm border-b pb-2 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-[#500b50]" />
                    <span>3. Propose Power Plant</span>
                  </h4>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Plant Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Kano Solar IPP"
                      value={newGenName}
                      onChange={(e) => setNewGenName(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Interconnection Bus
                    </label>
                    <select
                      value={newGenBus}
                      onChange={(e) => setNewGenBus(Number(e.target.value))}
                      className="w-full border rounded-lg px-2.5 py-2 text-sm bg-white"
                    >
                      {buses.map((b) => (
                        <option key={b.id} value={b.id}>
                          #{b.id} {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Output (MW)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={newGenP}
                        onChange={(e) => setNewGenP(Number(e.target.value))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Target (pu)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.95"
                        max="1.10"
                        value={newGenVm}
                        onChange={(e) => setNewGenVm(Number(e.target.value))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleAddGen}
                    className="w-full py-2.5 rounded-lg bg-[#500b50] text-white font-bold text-xs hover:bg-[#680f68] transition"
                  >
                    + Incorporate Plant & Re-Solve
                  </button>
                </div>
              </div>

              {/* LIVE EDITABLE EXPANSION LEDGER */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    <span>
                      Prospective Expansion Ledger ({totalExtensionsCount}{" "}
                      Active Additions)
                    </span>
                  </div>
                  {totalExtensionsCount > 0 && (
                    <button
                      onClick={() => {
                        setPfVariables((v) => ({
                          ...v,
                          newBuses: [],
                          newLines: [],
                          newGenerators: [],
                        }));
                        setTimeout(runSimulation, 50);
                      }}
                      className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-md text-xs font-bold transition"
                    >
                      Clear All Expansions
                    </button>
                  )}
                </div>

                {totalExtensionsCount === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No prospective network elements added yet. Use the cards
                    above to design expansion scenarios.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[700px]">
                      <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                        <tr>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">Element Name</th>
                          <th className="py-3 px-4">Voltage / Rating</th>
                          <th className="py-3 px-4">Capacity / Distance</th>
                          <th className="py-3 px-4">Interconnection</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {/* New Substations */}
                        {pfVariables.newBuses.map((bus, idx) => (
                          <tr key={`bus-${idx}`} className="hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-800">
                                Substation
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {bus.name}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {bus.vn_kv} kV
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {bus.p_mw} MW Load
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {bus.zone}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleRemoveBus(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title="Delete element"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}

                        {/* New Corridors */}
                        {pfVariables.newLines.map((line, idx) => (
                          <tr key={`line-${idx}`} className="hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-100 text-purple-800">
                                Line Corridor
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {line.name}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {line.conductor_type}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {line.length_km} km
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-600">
                              Bus #{line.from_bus} $\to$ #{line.to_bus}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleRemoveLine(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title="Delete element"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}

                        {/* New Generators */}
                        {pfVariables.newGenerators.map((gen, idx) => (
                          <tr key={`gen-${idx}`} className="hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                                Power Plant
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {gen.name}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {gen.vm_pu} pu target
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-[#500b50]">
                              {gen.p_mw} MW Infeed
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600">
                              Bus #{gen.bus}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleRemoveGen(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title="Delete element"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
