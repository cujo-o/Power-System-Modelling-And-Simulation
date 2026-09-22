'use client';

import React, { useState } from 'react';
import {
  BusData,
  LineData,
  GridModelMeta,
  PowerFlowVariables,
  NewBusElement,
  NewLineElement,
  NewGenElement,
  CascadeResult,
} from '@/types/grid';
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
  Sparkles,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Layers,
  ArrowRight,
  FolderOpen,
  Check,
  Zap,
} from 'lucide-react';

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
  onActivateModel: (id: string) => void;
  onNavigateTab: (tab: string) => void;
  onCascadeTrigger: (initialTripped: number[], threshold: number) => Promise<CascadeResult>;
  onApplyCascadeTrips: (trippedList: number[]) => void;
}

// Formats raw numerical area codes (e.g. 1.0) into statutory Nigerian Regional Zones
const formatRegionalZone = (zone: any, busName: string): string => {
  if (!zone || zone === '1.0' || zone === '1' || zone === 1) {
    const n = busName.toLowerCase();
    if (n.includes('egbin') || n.includes('ikeja') || n.includes('sakete') || n.includes('aja') || n.includes('osogbo') || n.includes('ayede') || n.includes('omotosho')) return 'South-West';
    if (n.includes('kainji') || n.includes('jebba') || n.includes('shiroro') || n.includes('katampe') || n.includes('lokoja') || n.includes('geregu') || n.includes('ajaokuta') || n.includes('zungeru') || n.includes('gwagw')) return 'North-Central';
    if (n.includes('benin') || n.includes('sapele') || n.includes('delta') || n.includes('aladja') || n.includes('ihovbor') || n.includes('azura') || n.includes('okpai') || n.includes('asaba')) return 'Mid-West';
    if (n.includes('afam') || n.includes('alaoji') || n.includes('adiagbo') || n.includes('calabar') || n.includes('ikot') || n.includes('omoku') || n.includes('owerri') || n.includes('egbema') || n.includes('nhaven') || n.includes('ugwuaji') || n.includes('onitsha')) return 'South-East / SS';
    if (n.includes('kaduna') || n.includes('kano') || n.includes('kebbi') || n.includes('mando') || n.includes('funtua') || n.includes('gusau')) return 'North-West';
    if (n.includes('jos') || n.includes('bauchi') || n.includes('gombe') || n.includes('yola') || n.includes('maiduguri') || n.includes('damaturu') || n.includes('jalingo')) return 'North-East';
    return 'Main Transmission Zone';
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
  // Workflow Step: 'select_model' (Step 1) vs 'simulation_properties' (Step 2)
  const activeModel = models.find((m) => m.is_active);
  const [workflowStep, setWorkflowStep] = useState<'select_model' | 'simulation_properties'>(
    activeModel ? 'simulation_properties' : 'select_model'
  );

  // Sub-tabs inside Simulation Properties
  const [simSubTab, setSimSubTab] = useState<'deck' | 'cascade' | 'planning'>('deck');

  // Parameters Filter State (Step 1)
  const [domainFilter, setDomainFilter] = useState<'ALL' | 'Static' | 'Dynamic'>('ALL');
  const [voltageFilter, setVoltageFilter] = useState<'ALL' | '330kV' | '132kV'>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Cascade Simulation State
  const [cascadeThreshold, setCascadeThreshold] = useState(100.0);
  const [initialTripLine, setInitialTripLine] = useState<number>(lines[0]?.id || 0);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);

  // Regional Planning State
  const [newBusName, setNewBusName] = useState('');
  const [newBusKv, setNewBusKv] = useState(330);
  const [newBusZone, setNewBusZone] = useState('North-Central');
  const [newBusLoadP, setNewBusLoadP] = useState(0);

  const [newLineName, setNewLineName] = useState('');
  const [newLineFrom, setNewLineFrom] = useState<number>(buses[0]?.id || 1);
  const [newLineTo, setNewLineTo] = useState<number>(buses[1]?.id || 2);
  const [newLineLength, setNewLineLength] = useState(65);
  const [newLineConductor, setNewLineConductor] = useState('Bison 330kV');

  const [newGenName, setNewGenName] = useState('');
  const [newGenBus, setNewGenBus] = useState<number>(buses[0]?.id || 1);
  const [newGenP, setNewGenP] = useState(150);
  const [newGenVm, setNewGenVm] = useState(1.03);

  // Filter Catalog
  const filteredModels = models.filter((m) => {
    const matchesDomain =
      domainFilter === 'ALL' ||
      (domainFilter === 'Static' && (m.domain.includes('Static') || m.domain.includes('Steady'))) ||
      (domainFilter === 'Dynamic' && m.domain.includes('Dynamic'));
    const matchesVoltage = voltageFilter === 'ALL' || m.voltage_level.includes(voltageFilter);
    const matchesPlatform =
      platformFilter === 'ALL' || m.platform.toLowerCase().includes(platformFilter.toLowerCase());
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.voltage_level.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDomain && matchesVoltage && matchesPlatform && matchesSearch;
  });

  const handleSelectModel = (id: string) => {
    onActivateModel(id);
    setWorkflowStep('simulation_properties');
    setSimSubTab('deck');
  };

  const handleRunCascade = async () => {
    setCascadeLoading(true);
    try {
      const res = await onCascadeTrigger([initialTripLine], cascadeThreshold);
      setCascadeResult(res);
    } finally {
      setCascadeLoading(false);
    }
  };

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
    setNewBusName('');
    setNewBusLoadP(0);
  };

  const handleAddLine = () => {
    if (!newLineName.trim()) return;
    const item: NewLineElement = {
      name: newLineName.trim(),
      from_bus: newLineFrom,
      to_bus: newLineTo,
      length_km: newLineLength,
      conductor_type: newLineConductor,
      vn_kv: newLineConductor.includes('330') ? 330 : 132,
    };
    setPfVariables((prev) => ({
      ...prev,
      newLines: [...prev.newLines, item],
    }));
    setNewLineName('');
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
    setNewGenName('');
  };

  const totalExtensionsCount =
    pfVariables.newBuses.length + pfVariables.newLines.length + pfVariables.newGenerators.length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* WORKFLOW BREADCRUMB INDICATOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#500b50]">
            Power System Modelling & Stability Studio
          </h2>
          <p className="text-xs text-slate-500">
            Select a network model by parameters, then configure operational variables, contingencies, and regional expansion.
          </p>
        </div>

        {/* Two-Step Workflow Navigator */}
        <div className="flex items-center rounded-lg border border-slate-300 bg-white p-1 text-xs shadow-xs">
          <button
            onClick={() => setWorkflowStep('select_model')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${
              workflowStep === 'select_model'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>1. Choose Model</span>
          </button>

          <span className="text-slate-300 px-1">/</span>

          <button
            onClick={() => {
              if (activeModel || buses.length > 0) {
                setWorkflowStep('simulation_properties');
              }
            }}
            disabled={!activeModel && buses.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
              workflowStep === 'simulation_properties'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>2. Simulation Properties</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: CHOOSE MODEL FIRST (FILTERED BY PARAMETERS)                       */}
      {/* ========================================================================= */}
      {workflowStep === 'select_model' && (
        <div className="space-y-5">
          {/* Parameter Filter Bar */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-[#500b50]" />
                <span>Filter Models by Engineering Parameters</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {filteredModels.length} of {models.length} Models Available
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* 1. Search Query */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Search Model Case
                </label>
                <input
                  type="text"
                  placeholder="e.g. 330kV, 132kV, NISO, Kainji..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#500b50] bg-white font-medium"
                />
              </div>

              {/* 2. Simulation Domain */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Simulation Domain
                </label>
                <select
                  value={domainFilter}
                  onChange={(e: any) => setDomainFilter(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-700 text-xs"
                >
                  <option value="ALL">All Domains (Static & Dynamic)</option>
                  <option value="Static">Static Power Flow (Steady-State)</option>
                  <option value="Dynamic">Dynamic & Transient Stability</option>
                </select>
              </div>

              {/* 3. Voltage Class */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Voltage Level
                </label>
                <select
                  value={voltageFilter}
                  onChange={(e: any) => setVoltageFilter(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-700 text-xs"
                >
                  <option value="ALL">All Voltage Classes</option>
                  <option value="330kV">330 kV Bulk Backbone</option>
                  <option value="132kV">132 kV Sub-Transmission</option>
                </select>
              </div>

              {/* 4. Tool Format / Platform */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Tool / Case Format
                </label>
                <select
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-700 text-xs"
                >
                  <option value="ALL">All Platforms (.m, .raw, .xlsx)</option>
                  <option value="MATPOWER">MATPOWER (.m)</option>
                  <option value="PSAT">PSAT</option>
                  <option value="DIgSILENT">DIgSILENT PowerFactory (.raw)</option>
                  <option value="ETAP">ETAP (.xlsx)</option>
                  <option value="PowerWorld">PowerWorld (.aux)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Model Selection Cards Grid */}
          {filteredModels.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-12 text-center flex flex-col items-center justify-center">
              <FolderOpen className="h-12 w-12 text-slate-400 mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No Matching Power Models Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                No registered models match your parameter filter. Clear the filters or upload a new grid model in the ingestion portal.
              </p>
              <button
                onClick={() => onNavigateTab('Data Upload')}
                className="mt-4 px-4 py-2 rounded bg-[#500b50] text-white text-xs font-bold hover:bg-[#680f68] transition shadow-xs"
              >
                Upload Model Case File
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredModels.map((m) => {
                const isCurrentActive = m.is_active || m.name === modelName;

                return (
                  <div
                    key={m.id}
                    className={`p-5 rounded-xl border bg-white shadow-xs transition flex flex-col justify-between ${
                      isCurrentActive
                        ? 'border-[#500b50] ring-2 ring-[#500b50]/30'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-[#500b50] border border-purple-200">
                            {m.voltage_level}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {m.platform}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {m.domain}
                          </span>
                        </div>

                        {isCurrentActive && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            <span>Active Case</span>
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">{m.name}</h3>

                      <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs font-mono bg-slate-50 p-2.5 rounded border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Substations / Nodes</span>
                          <span className="font-bold text-slate-800">{m.buses} Buses</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Corridors / Branches</span>
                          <span className="font-bold text-slate-800">{m.branches} Lines</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Installed Generation</span>
                          <span className="font-bold text-[#500b50]">{m.total_installed_mw.toLocaleString()} MW</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Peak Demand Load</span>
                          <span className="font-bold text-slate-800">{m.total_demand_mw.toLocaleString()} MW</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleSelectModel(m.id)}
                        className="flex-1 rounded bg-[#500b50] text-white py-2 text-xs font-bold hover:bg-[#680f68] transition text-center shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <span>Select & Open Simulation Properties</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: SIMULATION PROPERTIES (REVEALED AFTER MODEL IS CHOSEN)             */}
      {/* ========================================================================= */}
      {workflowStep === 'simulation_properties' && (
        <div className="space-y-6">
          {/* Active Model Indicator Banner */}
          <div className="p-3.5 rounded-xl border border-[#500b50]/20 bg-[#fbf9fc] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-[#500b50] text-white flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-purple-900 tracking-wider">
                    Active Grid Model
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                    Loaded in RAM
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{modelName}</h3>
                <span className="text-[11px] text-slate-500 font-mono">
                  {buses.length} Substations | {lines.length} Transmission Lines | Statutory NERC Band: 0.95–1.05 pu
                </span>
              </div>
            </div>

            {/* Switch Model Button */}
            <button
              onClick={() => setWorkflowStep('select_model')}
              className="flex items-center gap-1.5 rounded border border-[#500b50] bg-white px-3.5 py-1.5 text-xs font-bold text-[#500b50] hover:bg-[#f5eff6] transition shadow-xs self-start sm:self-center shrink-0"
            >
              <span>⇄ Change / Select Model</span>
            </button>
          </div>

          {/* Sub-Tabs within Simulation Properties */}
          <div className="flex rounded border border-slate-300 bg-white p-0.5 text-xs shadow-xs w-fit">
            <button
              onClick={() => setSimSubTab('deck')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded font-bold transition ${
                simSubTab === 'deck'
                  ? 'bg-[#500b50] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Operational Variables Deck</span>
            </button>

            <button
              onClick={() => setSimSubTab('cascade')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded font-bold transition ${
                simSubTab === 'cascade'
                  ? 'bg-[#500b50] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-rose-500" />
              <span>Cascading Failure Analysis</span>
            </button>

            <button
              onClick={() => setSimSubTab('planning')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded font-bold transition relative ${
                simSubTab === 'planning'
                  ? 'bg-[#500b50] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>Regional Planning Studio</span>
              {totalExtensionsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[9px] font-bold">
                  {totalExtensionsCount}
                </span>
              )}
            </button>
          </div>

          {/* 1. OPERATIONAL VARIABLES DECK (POWER FLOW) */}
          {simSubTab === 'deck' && (
            <div className="space-y-5">
              {divergedNotice && (
                <div className="flex items-center gap-2 rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>{divergedNotice}</span>
                </div>
              )}

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-[#500b50]" />
                    <span>Operational Variables Deck (NESI Parameters)</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Configuring: <strong className="text-slate-800">{modelName}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                  {/* Demand Scale */}
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Demand Scale
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.05"
                        min="0.4"
                        max="2.5"
                        value={pfVariables.loadMultiplier}
                        onChange={(e) =>
                          setPfVariables((v) => ({ ...v, loadMultiplier: parseFloat(e.target.value) || 1.0 }))
                        }
                        className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                      />
                      <span className="text-slate-500 font-mono text-[11px]">x</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {(pfVariables.loadMultiplier * 100).toFixed(0)}% Base Load
                    </span>
                  </div>

                  {/* Power Factor (cos φ) */}
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Power Factor (cos φ)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.75"
                      max="1.0"
                      value={pfVariables.targetPowerFactor}
                      onChange={(e) =>
                        setPfVariables((v) => ({ ...v, targetPowerFactor: parseFloat(e.target.value) || 0.9 }))
                      }
                      className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Inductive MVAR ratio</span>
                  </div>

                  {/* Slack Voltage (V₀) */}
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Slack Voltage (V₀)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.005"
                        min="0.95"
                        max="1.10"
                        value={pfVariables.slackVoltagePu}
                        onChange={(e) =>
                          setPfVariables((v) => ({ ...v, slackVoltagePu: parseFloat(e.target.value) || 1.05 }))
                        }
                        className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                      />
                      <span className="text-slate-500 text-[10px]">pu</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Target excitation</span>
                  </div>

                  {/* Shunt MVAR (ΔQ) */}
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Shunt MVAR (ΔQ)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="10"
                        value={pfVariables.shuntMvarCompensation}
                        onChange={(e) =>
                          setPfVariables((v) => ({ ...v, shuntMvarCompensation: parseFloat(e.target.value) || 0 }))
                        }
                        className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                      />
                      <span className="text-slate-500 text-[10px]">MVAR</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">+Cap / -Reactor</span>
                  </div>

                  {/* Thermal Line Derating */}
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Thermal Line Derating
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.05"
                        min="0.5"
                        max="1.2"
                        value={pfVariables.thermalDeratingFactor}
                        onChange={(e) =>
                          setPfVariables((v) => ({ ...v, thermalDeratingFactor: parseFloat(e.target.value) || 1.0 }))
                        }
                        className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                      />
                      <span className="text-slate-500 text-[10px]">x</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Ambient temperature</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2 text-xs">
                    {totalExtensionsCount > 0 ? (
                      <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Planning Mode: {totalExtensionsCount} element(s) active</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">No prospective expansions added.</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={runSimulation}
                      disabled={loading}
                      className="flex items-center gap-1.5 rounded bg-[#500b50] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs disabled:opacity-50"
                    >
                      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      <span>Solve AC Flow</span>
                    </button>

                    <button
                      onClick={onReset}
                      disabled={loading}
                      className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Substation Bus Voltage Profiles Table */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
                  <span>Substation Bus Voltage Profiles ({buses.length} Nodes)</span>
                  <span className="font-normal text-[11px] text-white/80">Statutory NERC Band: 0.95 – 1.05 p.u.</span>
                </div>
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs min-w-[550px]">
                    <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-semibold sticky top-0">
                      <tr>
                        <th className="p-2.5">ID</th>
                        <th className="p-2.5">Substation Name</th>
                        <th className="p-2.5">Regional Zone</th>
                        <th className="p-2.5">Voltage (|V|)</th>
                        <th className="p-2.5">Angle (°)</th>
                        <th className="p-2.5">Active (MW)</th>
                        <th className="p-2.5">Reactive (MVAR)</th>
                        <th className="p-2.5">Compliance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {buses.map((bus) => {
                        const isUnder = bus.v_pu < 0.95;
                        const isOver = bus.v_pu > 1.05;
                        const zoneLabel = formatRegionalZone(bus.zone, bus.name);

                        return (
                          <tr key={bus.id} className="hover:bg-[#fcfaff]">
                            <td className="p-2.5 font-mono text-slate-400 font-bold">#{bus.id}</td>
                            <td className="p-2.5 font-bold text-slate-900">{bus.name}</td>
                            <td className="p-2.5 text-slate-600 font-medium">{zoneLabel}</td>
                            <td className="p-2.5 font-mono font-bold">
                              <span className={isUnder ? 'text-rose-600' : isOver ? 'text-amber-600' : 'text-emerald-700'}>
                                {bus.v_pu.toFixed(3)} pu
                              </span>
                            </td>
                            <td className="p-2.5 font-mono">{bus.va_deg.toFixed(2)}°</td>
                            <td className="p-2.5 font-mono">{bus.p_mw}</td>
                            <td className="p-2.5 font-mono">{bus.q_mvar}</td>
                            <td className="p-2.5">
                              {isUnder ? (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                  Under-voltage
                                </span>
                              ) : isOver ? (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  Over-voltage
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
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
            </div>
          )}

          {/* 2. CASCADING OUTAGES */}
          {simSubTab === 'cascade' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl border border-rose-200 bg-[#fffbfa] text-xs">
                <h3 className="font-bold text-rose-900 text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-rose-600" />
                  <span>Automated Cascading Failure & Islanding Defense Studio</span>
                </h3>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  Simulates sequential overcurrent distance relay tripping. When an initial corridor trips, power flow redistributes across remaining lines. Any line exceeding the threshold trips, continuing until equilibrium or network islanding is reached.
                </p>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      1. Initiating Fault / Outage
                    </label>
                    <select
                      value={initialTripLine}
                      onChange={(e) => setInitialTripLine(Number(e.target.value))}
                      className="w-full border rounded px-3 py-2 text-xs font-semibold text-slate-800 bg-white"
                    >
                      {lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          #{l.id}: {l.name} ({l.loading_percent}% load)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      2. Overcurrent Relay Trip Threshold
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="90"
                        max="140"
                        step="5"
                        value={cascadeThreshold}
                        onChange={(e) => setCascadeThreshold(Number(e.target.value))}
                        className="w-full accent-rose-600 cursor-pointer"
                      />
                      <span className="font-mono font-bold text-rose-700 text-sm">{cascadeThreshold}%</span>
                    </div>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={handleRunCascade}
                      disabled={cascadeLoading || lines.length === 0}
                      className="w-full flex items-center justify-center gap-2 rounded bg-rose-700 text-white py-2 text-xs font-bold hover:bg-rose-800 transition shadow-xs disabled:opacity-50"
                    >
                      {cascadeLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                      <span>Run Cascade Loop</span>
                    </button>
                  </div>
                </div>
              </div>

              {cascadeResult && (
                <div className="space-y-4">
                  <div
                    className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
                      cascadeResult.status === 'STABILIZED_POST_CONTINGENCY'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : cascadeResult.status === 'PARTIAL_SYSTEM_COLLAPSE'
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-rose-50 border-rose-300 text-rose-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-6 w-6 shrink-0" />
                      <div>
                        <h4 className="font-bold text-sm">{cascadeResult.status.replace(/_/g, ' ')}</h4>
                        <p className="text-[11px] mt-0.5">
                          Completed {cascadeResult.total_steps} stage(s). Total lines tripped: {cascadeResult.all_tripped_lines.length}.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => onApplyCascadeTrips(cascadeResult.all_tripped_lines)}
                      className="px-3.5 py-1.5 rounded bg-white border font-bold text-xs shadow-xs hover:bg-slate-50 transition"
                    >
                      Apply State to SLD
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. REGIONAL PLANNING STUDIO */}
          {simSubTab === 'planning' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl border border-purple-200 bg-[#fbf9fc] text-xs">
                <h3 className="font-bold text-[#500b50] text-sm flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  <span>National Grid Expansion & Interconnection Planning</span>
                </h3>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  Plan and evaluate prospective transmission corridors, new regional substations, or large-scale generation additions (e.g., Mambilla Hydro, Kano Solar, or Niger Delta industrial hubs).
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Add Substation */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3 text-xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 border-b pb-2">
                    <Plus className="h-4 w-4 text-[#500b50]" />
                    <span>1. Add Proposed Substation</span>
                  </h4>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Substation Name</label>
                    <input
                      type="text"
                      placeholder="e.g. WUKARI 330 or LEKKI 2"
                      value={newBusName}
                      onChange={(e) => setNewBusName(e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-xs text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Voltage Rating</label>
                      <select
                        value={newBusKv}
                        onChange={(e) => setNewBusKv(Number(e.target.value))}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
                      >
                        <option value={330}>330 kV Bulk</option>
                        <option value={132}>132 kV Sub-T</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Regional Zone</label>
                      <select
                        value={newBusZone}
                        onChange={(e) => setNewBusZone(e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
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
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Local Active Demand (MW)</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={newBusLoadP}
                      onChange={(e) => setNewBusLoadP(Number(e.target.value))}
                      className="w-full border rounded px-3 py-1.5 text-xs"
                      placeholder="0 MW"
                    />
                  </div>

                  <button
                    onClick={handleAddBus}
                    className="w-full py-1.5 rounded bg-[#500b50] text-white font-bold hover:bg-[#680f68] transition"
                  >
                    Add Substation Node
                  </button>
                </div>

                {/* 2. Connect Line */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3 text-xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 border-b pb-2">
                    <Plus className="h-4 w-4 text-[#500b50]" />
                    <span>2. Connect Proposed Corridor</span>
                  </h4>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Corridor Identifier</label>
                    <input
                      type="text"
                      placeholder="e.g. MAKURDI - WUKARI 330kV"
                      value={newLineName}
                      onChange={(e) => setNewLineName(e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-xs text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">From Bus</label>
                      <select
                        value={newLineFrom}
                        onChange={(e) => setNewLineFrom(Number(e.target.value))}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
                      >
                        {buses.map((b) => (
                          <option key={b.id} value={b.id}>
                            #{b.id} {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">To Bus</label>
                      <select
                        value={newLineTo}
                        onChange={(e) => setNewLineTo(Number(e.target.value))}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
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
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Distance (km)</label>
                      <input
                        type="number"
                        min="1"
                        value={newLineLength}
                        onChange={(e) => setNewLineLength(Number(e.target.value))}
                        className="w-full border rounded px-3 py-1.5 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Conductor</label>
                      <select
                        value={newLineConductor}
                        onChange={(e) => setNewLineConductor(e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
                      >
                        <option value="Bison 330kV">Bison 330kV (1.25 kA)</option>
                        <option value="Bear 330kV">Bear 330kV (1.01 kA)</option>
                        <option value="Panther 132kV">Panther 132kV (0.70 kA)</option>
                        <option value="Wolf 132kV">Wolf 132kV (0.55 kA)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleAddLine}
                    className="w-full py-1.5 rounded bg-[#500b50] text-white font-bold hover:bg-[#680f68] transition"
                  >
                    Connect Line
                  </button>
                </div>

                {/* 3. Add Plant */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3 text-xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 border-b pb-2">
                    <Plus className="h-4 w-4 text-[#500b50]" />
                    <span>3. Add Proposed Power Plant</span>
                  </h4>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Plant Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Kano Solar IPP 100MW"
                      value={newGenName}
                      onChange={(e) => setNewGenName(e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Interconnection Bus</label>
                    <select
                      value={newGenBus}
                      onChange={(e) => setNewGenBus(Number(e.target.value))}
                      className="w-full border rounded px-2 py-1.5 text-xs bg-white"
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
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Output (MW)</label>
                      <input
                        type="number"
                        min="1"
                        value={newGenP}
                        onChange={(e) => setNewGenP(Number(e.target.value))}
                        className="w-full border rounded px-3 py-1.5 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Target (pu)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.95"
                        max="1.10"
                        value={newGenVm}
                        onChange={(e) => setNewGenVm(Number(e.target.value))}
                        className="w-full border rounded px-3 py-1.5 text-xs"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleAddGen}
                    className="w-full py-1.5 rounded bg-[#500b50] text-white font-bold hover:bg-[#680f68] transition"
                  >
                    Incorporate Plant
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};