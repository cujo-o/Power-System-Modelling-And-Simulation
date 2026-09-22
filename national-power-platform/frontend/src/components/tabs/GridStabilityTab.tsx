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
  Activity,
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
  const [activeSubTab, setActiveSubTab] = useState<'solver' | 'cascade' | 'planning' | 'catalog'>('solver');

  // Cascade State
  const [cascadeThreshold, setCascadeThreshold] = useState(100.0);
  const [initialTripLine, setInitialTripLine] = useState<number>(lines[0]?.id || 0);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);

  // Planning Form State
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

  // Catalog Filters
  const [domainFilter, setDomainFilter] = useState<'ALL' | 'Static' | 'Dynamic'>('ALL');
  const [voltageFilter, setVoltageFilter] = useState<'ALL' | '330kV' | '132kV'>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredModels = models.filter((m) => {
    const matchesDomain =
      domainFilter === 'ALL' ||
      (domainFilter === 'Static' && m.domain.includes('Static')) ||
      (domainFilter === 'Dynamic' && m.domain.includes('Dynamic'));
    const matchesVoltage = voltageFilter === 'ALL' || m.voltage_level.includes(voltageFilter);
    const matchesPlatform = platformFilter === 'ALL' || m.platform.toLowerCase().includes(platformFilter.toLowerCase());
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDomain && matchesVoltage && matchesPlatform && matchesSearch;
  });

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
      {/* Top Header & Sub-Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#500b50]">Grid Stability, Cascading & Planning Hub</h2>
          <p className="text-xs text-slate-500">
            Active: <strong className="text-slate-800">{modelName}</strong> ({buses.length} Substations, {lines.length} Lines)
          </p>
        </div>

        <div className="flex rounded border border-slate-300 bg-white p-0.5 text-xs shadow-xs flex-wrap">
          <button
            onClick={() => setActiveSubTab('solver')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${
              activeSubTab === 'solver'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Power Flow Deck</span>
          </button>
          <button
            onClick={() => setActiveSubTab('cascade')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${
              activeSubTab === 'cascade'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-rose-500" />
            <span>Cascading Outages</span>
          </button>
          <button
            onClick={() => setActiveSubTab('planning')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition relative ${
              activeSubTab === 'planning'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>Regional Planning</span>
            {totalExtensionsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500 text-white text-[9px] font-bold">
                {totalExtensionsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('catalog')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${
              activeSubTab === 'catalog'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>Model Catalog</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: LIVE POWER FLOW & OPERATIONAL VARIABLES DECK */}
      {activeSubTab === 'solver' && (
        <div className="space-y-5">
          {divergedNotice && (
            <div className="flex items-center gap-2 rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{divergedNotice}</span>
            </div>
          )}

          {/* SYSTEM VARIABLE DECK */}
          <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-[#500b50]" />
                <span>Operational Variables Deck (NESI Parameters)</span>
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                Active: <strong className="text-slate-800">{modelName}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Demand Scale
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.05"
                    min="0.4"
                    max="2.0"
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

              <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Power Factor ($\cos \phi$)
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
                <span className="text-[10px] text-slate-400 mt-1 block">Adjusts MVAR Q demand</span>
              </div>

              <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Slack Voltage ($V_0$)
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
                <span className="text-[10px] text-slate-400 mt-1 block">Egbin terminal target</span>
              </div>

              <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Shunt MVAR ($\Delta Q$)
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

              <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Line Derating
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
                <span className="text-[10px] text-slate-400 mt-1 block">Ambient temperature factor</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-xs">
                {totalExtensionsCount > 0 ? (
                  <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Planning Mode: {totalExtensionsCount} element(s) incorporated</span>
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">No prospective expansions applied.</span>
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
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
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
                    return (
                      <tr key={bus.id} className="hover:bg-[#fcfaff]">
                        <td className="p-2.5 font-mono text-slate-400 font-bold">#{bus.id}</td>
                        <td className="p-2.5 font-bold text-slate-900">{bus.name}</td>
                        <td className="p-2.5 text-slate-500">{bus.zone}</td>
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
                              Low (Under-voltage)
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

      {/* SUB-TAB 2: CASCADING OUTAGES & BLACKOUT ISLANDING STUDIO */}
      {activeSubTab === 'cascade' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-rose-200 bg-[#fffbfa] text-xs">
            <h3 className="font-bold text-rose-900 text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              <span>Automated Cascading Failure & Islanding Defense Studio</span>
            </h3>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Simulates sequential overcurrent distance relay tripping. When an initial corridor trips, power flow redistributes. If adjacent branches exceed the thermal threshold, they trip in sequential stages until the grid reaches a new equilibrium or separates into disconnected synchronous islands.
            </p>
          </div>

          {/* Cascade Trigger Controls */}
          <div className="p-5 rounded-lg border border-slate-200 bg-white shadow-xs space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  1. Initial Initiating Outage / Disturbance
                </label>
                <select
                  value={initialTripLine}
                  onChange={(e) => setInitialTripLine(Number(e.target.value))}
                  className="w-full border rounded px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      #{l.id}: {l.name} ({l.loading_percent}% load)
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">Corridor where fault occurs</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  2. Protective Overcurrent Threshold
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
                <span className="text-[10px] text-slate-400 mt-1 block">Lines exceeding this percentage trip</span>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleRunCascade}
                  disabled={cascadeLoading || lines.length === 0}
                  className="w-full flex items-center justify-center gap-2 rounded bg-rose-700 text-white py-2 text-xs font-bold hover:bg-rose-800 transition shadow-xs disabled:opacity-50"
                >
                  {cascadeLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                  <span>Run Automated Cascade Loop</span>
                </button>
              </div>
            </div>
          </div>

          {/* Cascade Results */}
          {cascadeResult && (
            <div className="space-y-4">
              {/* Cascade Status Banner */}
              <div className={`p-4 rounded-lg border text-xs flex items-center justify-between ${
                cascadeResult.status === 'STABILIZED_POST_CONTINGENCY'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : cascadeResult.status === 'PARTIAL_SYSTEM_COLLAPSE'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}>
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-6 w-6 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm">
                      {cascadeResult.status.replace(/_/g, ' ')}
                    </h4>
                    <p className="text-[11px] mt-0.5">
                      Completed {cascadeResult.total_steps} cascading stage(s). Total lines tripped: {cascadeResult.all_tripped_lines.length}.
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

              {/* Cascade Stage-by-Stage Timeline */}
              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="bg-[#500b50] text-white px-4 py-2.5 text-xs font-bold">
                  Cascading Failure Sequence Ledger
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {cascadeResult.timeline.map((step) => (
                    <div key={step.step} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">
                            Stage {step.step}:
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            step.event_type === 'INITIAL_TRIP'
                              ? 'bg-purple-100 text-purple-900'
                              : 'bg-rose-100 text-rose-900'
                          }`}>
                            {step.event_type}
                          </span>
                        </div>
                        <p className="text-slate-700 mt-1 font-medium">{step.description}</p>
                      </div>

                      <div className="flex items-center gap-4 text-slate-500 font-mono text-[11px]">
                        <span>Max Load: <strong className="text-rose-600">{step.max_loading_percent}%</strong></span>
                        <span>Losses: <strong>{step.total_losses_mw} MW</strong></span>
                        <span>Freq: <strong>{step.frequency_hz} Hz</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Topological Islands Detected */}
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
                <h4 className="font-bold text-slate-900 text-sm mb-1">
                  Synchronous Electrical Islands Detected ({cascadeResult.islands.length})
                </h4>
                <p className="text-xs text-slate-500 mb-3">
                  Graph decomposition of isolated electrical networks formed during the cascade.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {cascadeResult.islands.map((isle) => (
                    <div
                      key={isle.island_id}
                      className={`p-3.5 rounded border flex flex-col justify-between ${
                        isle.status === 'SYNCHRONOUS_ONLINE'
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : isle.status === 'DEFICIT_COLLAPSE'
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-rose-200 bg-rose-50/40'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-slate-900">
                          Island #{isle.island_id} ({isle.bus_count} Buses)
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isle.status === 'SYNCHRONOUS_ONLINE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {isle.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 font-mono text-[11px] mb-2">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Generation</span>
                          <span className="font-bold text-emerald-700">{isle.generation_mw} MW</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Demand</span>
                          <span className="font-bold text-slate-800">{isle.demand_mw} MW</span>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 truncate">
                        Nodes: {isle.sample_buses.join(', ')}...
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: REGIONAL PLANNING STUDIO */}
      {activeSubTab === 'planning' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-purple-200 bg-[#fbf9fc] text-xs">
            <h3 className="font-bold text-[#500b50] text-sm flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>National Grid Expansion & Interconnection Planning</span>
            </h3>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Design and evaluate prospective transmission corridors, new regional substations, or large-scale generation additions without editing raw data files.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. Add Substation */}
            <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs space-y-3 text-xs">
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
                    className="w-full border rounded px-2 py-1.5 text-xs"
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
                    className="w-full border rounded px-2 py-1.5 text-xs"
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

            {/* 2. Add Line */}
            <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5 border-b pb-2">
                <Plus className="h-4 w-4 text-[#500b50]" />
                <span>2. Connect Proposed Line</span>
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
                    className="w-full border rounded px-2 py-1.5 text-xs"
                  >
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.id} {b.name}
                      </option>
                    ))}
                    {pfVariables.newBuses.map((nb, i) => (
                      <option key={nb.name} value={1000 + i}>
                        [New] {nb.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">To Bus</label>
                  <select
                    value={newLineTo}
                    onChange={(e) => setNewLineTo(Number(e.target.value))}
                    className="w-full border rounded px-2 py-1.5 text-xs"
                  >
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.id} {b.name}
                      </option>
                    ))}
                    {pfVariables.newBuses.map((nb, i) => (
                      <option key={nb.name} value={1000 + i}>
                        [New] {nb.name}
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
                    className="w-full border rounded px-2 py-1.5 text-xs"
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
            <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs space-y-3 text-xs">
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
                  className="w-full border rounded px-2 py-1.5 text-xs"
                >
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      #{b.id} {b.name}
                    </option>
                  ))}
                  {pfVariables.newBuses.map((nb, i) => (
                    <option key={nb.name} value={1000 + i}>
                      [New] {nb.name}
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

          {/* Ledger */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b pb-3 mb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Active Prospective Elements Ledger</h4>
                <p className="text-xs text-slate-500">Elements incorporated into the prospective expansion scenario.</p>
              </div>

              {totalExtensionsCount > 0 && (
                <button
                  onClick={() => {
                    setPfVariables((v) => ({ ...v, newBuses: [], newLines: [], newGenerators: [] }));
                  }}
                  className="px-3 py-1 text-xs text-rose-700 border border-rose-300 rounded hover:bg-rose-50 font-semibold"
                >
                  Clear Planning Elements
                </button>
              )}
            </div>

            {totalExtensionsCount === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No planning elements added yet. Use the cards above to propose substations, transmission lines, or generation infeeds.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 border rounded bg-slate-50">
                  <span className="font-bold text-slate-800 block mb-2">Substations ({pfVariables.newBuses.length})</span>
                  {pfVariables.newBuses.map((b, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b last:border-0">
                      <span>{b.name} ({b.vn_kv}kV - {b.zone})</span>
                      <button
                        onClick={() =>
                          setPfVariables((v) => ({
                            ...v,
                            newBuses: v.newBuses.filter((_, idx) => idx !== i),
                          }))
                        }
                        className="text-rose-600 hover:text-rose-800"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="p-3 border rounded bg-slate-50">
                  <span className="font-bold text-slate-800 block mb-2">Corridors ({pfVariables.newLines.length})</span>
                  {pfVariables.newLines.map((l, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b last:border-0">
                      <span className="truncate max-w-[170px]">{l.name} ({l.length_km}km)</span>
                      <button
                        onClick={() =>
                          setPfVariables((v) => ({
                            ...v,
                            newLines: v.newLines.filter((_, idx) => idx !== i),
                          }))
                        }
                        className="text-rose-600 hover:text-rose-800"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="p-3 border rounded bg-slate-50">
                  <span className="font-bold text-slate-800 block mb-2">Generation Infeeds ({pfVariables.newGenerators.length})</span>
                  {pfVariables.newGenerators.map((g, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b last:border-0">
                      <span>{g.name} ({g.p_mw}MW)</span>
                      <button
                        onClick={() =>
                          setPfVariables((v) => ({
                            ...v,
                            newGenerators: v.newGenerators.filter((_, idx) => idx !== i),
                          }))
                        }
                        className="text-rose-600 hover:text-rose-800"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalExtensionsCount > 0 && (
              <div className="mt-4 pt-3 border-t flex justify-end">
                <button
                  onClick={() => {
                    setActiveSubTab('solver');
                    runSimulation();
                  }}
                  className="flex items-center gap-1.5 rounded bg-emerald-700 text-white px-5 py-2 text-xs font-bold hover:bg-emerald-800 shadow-xs"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Simulate Expansion Plan Impact</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: MODEL CATALOG */}
      {activeSubTab === 'catalog' && (
        <div className="space-y-5">
          <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search model by name (e.g. 330kV, Nig 10, NISO, 132kV)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded px-3 py-1.5 focus:outline-none focus:border-[#500b50]"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <select
                  value={domainFilter}
                  onChange={(e: any) => setDomainFilter(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700"
                >
                  <option value="ALL">All Domains (Static & Dynamic)</option>
                  <option value="Static">Static Power Flow Models</option>
                  <option value="Dynamic">Transient / Dynamic Models</option>
                </select>

                <select
                  value={voltageFilter}
                  onChange={(e: any) => setVoltageFilter(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700"
                >
                  <option value="ALL">All Voltage Levels</option>
                  <option value="330kV">330 kV Bulk Backbone</option>
                  <option value="132kV">132 kV Sub-Transmission</option>
                </select>

                <select
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700"
                >
                  <option value="ALL">All Tool Formats</option>
                  <option value="MATPOWER">MATPOWER (.m)</option>
                  <option value="PSAT">PSAT</option>
                  <option value="DIgSILENT">DIgSILENT PowerFactory</option>
                  <option value="ETAP">ETAP (.xlsx)</option>
                  <option value="PowerWorld">PowerWorld (.aux)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredModels.map((m) => (
              <div
                key={m.id}
                className={`p-5 rounded-lg border bg-white shadow-xs transition flex flex-col justify-between ${
                  m.is_active ? 'border-[#500b50] ring-1 ring-[#500b50]' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-[#500b50]">
                        {m.voltage_level}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {m.platform}
                      </span>
                    </div>
                    {m.is_active && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Active Simulation
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900">{m.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    {m.buses} Substations | {m.branches} Transmission Lines | {m.total_installed_mw.toLocaleString()} MW Installed | {m.total_demand_mw.toLocaleString()} MW Demand
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      onActivateModel(m.id);
                      setActiveSubTab('solver');
                    }}
                    className="flex-1 rounded bg-[#500b50] text-white py-1.5 text-xs font-bold hover:bg-[#680f68] transition text-center shadow-xs"
                  >
                    Activate Model Case
                  </button>

                  <button
                    onClick={() => {
                      onActivateModel(m.id);
                      onNavigateTab('Dynamics');
                    }}
                    className="rounded border border-slate-300 bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-bold hover:bg-slate-100 transition shadow-xs flex items-center gap-1"
                  >
                    <Activity className="h-3.5 w-3.5 text-[#500b50]" />
                    <span>Dynamics</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};