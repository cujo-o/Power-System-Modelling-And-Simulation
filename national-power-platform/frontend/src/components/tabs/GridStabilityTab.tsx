'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BusData,
  LineData,
  GridModelMeta,
  NewBusElement,
  NewLineElement,
  CascadeResult,
} from '@/types/grid';
import { ExtendedPowerFlowVariables } from '@/context/GridContext';
import {
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Search,
  Plus,
  GitBranch,
  Sliders,
  ShieldAlert,
  ArrowRight,
  Check,
  Zap,
  Power,
  Activity,
  Trash2,
  Lock,
  UploadCloud,
  CheckCircle2,
  Info,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';

interface Props {
  modelName: string;
  divergedNotice: string | null;
  pfVariables: ExtendedPowerFlowVariables;
  setPfVariables: React.Dispatch<React.SetStateAction<ExtendedPowerFlowVariables>>;
  runSimulation: () => void;
  onReset: () => void;
  loading: boolean;
  buses: BusData[];
  lines: LineData[];
  trippedLines: number[];
  toggleLine: (id: number) => void;
  toggleBusService?: (id: number) => void;
  models: GridModelMeta[];
  onActivateModel: (id: string) => Promise<void> | void;
  onNavigateTab: (tab: string) => void;
  onCascadeTrigger: (initialTripped: number[], threshold: number) => Promise<CascadeResult>;
  onApplyCascadeTrips: (trippedList: number[]) => void;
  apiBaseUrl?: string;
  isAdmin?: boolean;
  onDeleteModel?: (id: string) => Promise<void> | void;
  onRefreshModels?: () => Promise<void> | void;
  modelsLoading?: boolean;
}

const TooltipBadge: React.FC<{ content: string }> = ({ content }) => (
  <span className="relative group inline-flex items-center ml-1 align-baseline">
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 hover:bg-[#500b50] hover:text-white cursor-help transition">
      ?
    </span>
    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-56 rounded-lg bg-slate-900 p-2 text-[11px] font-normal normal-case leading-snug text-white shadow-xl z-50 text-center">
      {content}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
    </span>
  </span>
);

export const GridStabilityTab: React.FC<Props> = ({
  modelName,
  divergedNotice,
  pfVariables,
  setPfVariables,
  runSimulation,
  onReset,
  loading,
  buses = [],
  lines = [],
  trippedLines = [],
  toggleLine,
  toggleBusService,
  models = [],
  onActivateModel,
  onNavigateTab,
  onCascadeTrigger,
  onApplyCascadeTrips,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com',
  isAdmin = true,
  onDeleteModel,
  onRefreshModels,
  modelsLoading = false,
}) => {
  const activeModel = models.find((m) => m.is_active);

  const [activeTab, setActiveTab] = useState<'deck' | 'models' | 'load_sharing' | 'cascade' | 'planning'>('deck');
  const [deckView, setDeckView] = useState<'buses' | 'lines'>('buses');
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Filter & Search
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [busSearchQuery, setBusSearchQuery] = useState('');

  // Cascade Slider & Results
  const [cascadeThreshold, setCascadeThreshold] = useState<number>(100);
  const [initialTripLine, setInitialTripLine] = useState<number>(0);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);

  // Dynamic Load Sharing
  const [loadSharingMode, setLoadSharingMode] = useState<'branches' | 'generators'>('branches');
  const [loadStepMw, setLoadStepMw] = useState<number>(300);
  const [dampingD, setDampingD] = useState<number>(1.2);
  const [loadSharingLoading, setLoadSharingLoading] = useState(false);
  const [loadSharingResult, setLoadSharingResult] = useState<any>(null);

  // Planning Sandbox State
  const [newSubstationName, setNewSubstationName] = useState('');
  const [newSubstationKv, setNewSubstationKv] = useState(330);
  const [newSubstationZone, setNewSubstationZone] = useState('North-Central');
  const [newSubstationDemand, setNewSubstationDemand] = useState(40);
  const [connectToBusId, setConnectToBusId] = useState<number>(buses[0]?.id || 1);
  const [tieLineLength, setTieLineLength] = useState(45);
  const [tieConductor, setTieConductor] = useState('Bison 330kV');
  const [selectedDecommissionBus, setSelectedDecommissionBus] = useState<number>(buses[0]?.id || 1);

  // Real-time Debounce for Operational Sliders
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLiveParamChange = (field: keyof ExtendedPowerFlowVariables, value: any) => {
    setPfVariables((prev) => {
      const updated = { ...prev, [field]: value };
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        runSimulation();
      }, 300);
      return updated;
    });
  };

  useEffect(() => {
    if (lines.length > 0 && (!initialTripLine || !lines.some((l) => l.id === initialTripLine))) {
      setInitialTripLine(lines[0].id);
    }
  }, [lines, initialTripLine]);

  useEffect(() => {
    if (buses.length > 0 && !buses.some((b) => b.id === connectToBusId)) {
      setConnectToBusId(buses[0].id);
      setSelectedDecommissionBus(buses[0].id);
    }
  }, [buses, connectToBusId]);

  // Load Sharing Solver
  const runLoadSharingCalculation = async () => {
    setLoadSharingLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/simulations/load-sharing/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          load_step_mw: loadStepMw,
          system_damping_d: dampingD,
          droop_overrides: {},
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLoadSharingResult(data);
      }
    } catch (err) {
      console.warn('Load sharing solver error:', err);
    } finally {
      setLoadSharingLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'load_sharing') {
      runLoadSharingCalculation();
    }
  }, [activeTab, modelName]);

  const filteredBuses = useMemo(() => {
    if (!busSearchQuery.trim()) return buses;
    const q = busSearchQuery.toLowerCase();
    return buses.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        String(b.id).includes(q) ||
        (b.zone || '').toLowerCase().includes(q)
    );
  }, [buses, busSearchQuery]);

  const filteredModels = useMemo(() => {
    if (!modelSearchQuery.trim()) return models;
    const q = modelSearchQuery.toLowerCase();
    return models.filter((m) => m.name.toLowerCase().includes(q) || m.voltage_level.toLowerCase().includes(q));
  }, [models, modelSearchQuery]);

  const handleActivate = async (id: string) => {
    setActivatingId(id);
    try {
      await onActivateModel(id);
      setActiveTab('deck');
    } finally {
      setActivatingId(null);
    }
  };

  // Add Proposed Substation AND its Interconnection Tie in one step
  const handleAddProposedSubstation = () => {
    if (!newSubstationName.trim()) return;

    const newBusItem: NewBusElement = {
      name: newSubstationName.trim(),
      vn_kv: newSubstationKv,
      zone: newSubstationZone,
      p_mw: newSubstationDemand,
      q_mvar: newSubstationDemand * 0.35,
    };

    const targetExisting = buses.find((b) => b.id === connectToBusId);
    const newLineItem: NewLineElement = {
      name: `${targetExisting?.name || 'Bus'}-${newSubstationName.trim()}`,
      from_bus: connectToBusId,
      to_bus: buses.length + (pfVariables.newBuses.length + 1),
      length_km: tieLineLength,
      conductor_type: tieConductor,
      vn_kv: newSubstationKv,
    };

    setPfVariables((prev) => ({
      ...prev,
      newBuses: [...prev.newBuses, newBusItem],
      newLines: [...prev.newLines, newLineItem],
    }));

    setNewSubstationName('');
    setTimeout(runSimulation, 80);
  };

  const currentDisplayName = activeModel?.name || modelName || 'Active Grid Model';
  const totalModifications =
    pfVariables.newBuses.length +
    pfVariables.newLines.length +
    (pfVariables.disabledBuses?.length || 0);

  return (
    <div className="space-y-4 max-w-7xl mx-auto py-1 text-slate-800">
      {/* Top Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Grid Stability &amp; Simulation Studio</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-100 text-[#500b50] font-bold">
              {currentDisplayName}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time AC parameters, N-1 contingency analysis, dynamic load division, and sandbox expansion.
          </p>
        </div>

        {/* Compact EMS Tab Strip */}
        <div className="flex flex-wrap items-center rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold shadow-xs gap-1">
          <button
            onClick={() => setActiveTab('deck')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'deck' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Operational Deck</span>
          </button>

          <button
            onClick={() => setActiveTab('models')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'models' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>Models ({models.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('load_sharing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'load_sharing' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            <span>Load Sharing</span>
          </button>

          <button
            onClick={() => setActiveTab('cascade')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'cascade' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Power className="h-3.5 w-3.5 text-rose-500" />
            <span>Cascading Failure</span>
          </button>

          <button
            onClick={() => setActiveTab('planning')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition relative ${
              activeTab === 'planning' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitBranch className="h-3.5 w-3.5 text-blue-500" />
            <span>Regional Planning</span>
            {totalModifications > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                {totalModifications}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. OPERATIONAL DECK                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'deck' && (
        <div className="space-y-4">
          {/* Divergence / Status Banner */}
          {divergedNotice && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{divergedNotice}</span>
              </div>
              {activeModel && (
                <button
                  onClick={() => onActivateModel(activeModel.id)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 flex items-center gap-1"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                  <span>Re-Hydrate Solver</span>
                </button>
              )}
            </div>
          )}

          {/* Real-Time Parameter Sliders Strip */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[#500b50]" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Live Operational Variable Sliders
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold font-mono">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Auto-Re-Solving Live</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Demand Scale */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center">
                    Demand Scale
                    <TooltipBadge content="System-wide load scaling factor. Proportioned across all bulk consumption nodes in real-time." />
                  </span>
                  <span className="font-mono text-[#500b50]">{Math.round((pfVariables.loadMultiplier || 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="220"
                  step="5"
                  value={Math.round((pfVariables.loadMultiplier || 1.0) * 100)}
                  onChange={(e) => handleLiveParamChange('loadMultiplier', parseFloat(e.target.value) / 100)}
                  className="w-full accent-[#500b50] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>40%</span>
                  <span>100% (Base)</span>
                  <span>220%</span>
                </div>
              </div>

              {/* Power Factor */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center">
                    Power Factor (cos φ)
                    <TooltipBadge content="Operating active-to-apparent power ratio. Determines inductive reactive MVAR consumption." />
                  </span>
                  <span className="font-mono text-[#500b50]">{(pfVariables.targetPowerFactor || 0.9).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.0"
                  step="0.01"
                  value={pfVariables.targetPowerFactor || 0.9}
                  onChange={(e) => handleLiveParamChange('targetPowerFactor', parseFloat(e.target.value))}
                  className="w-full accent-[#500b50] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>0.75 Inductive</span>
                  <span>1.0 Unity</span>
                </div>
              </div>

              {/* Slack Voltage */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center">
                    Slack Voltage ($V_0$)
                    <TooltipBadge content="Voltage setpoint magnitude at the grid reference / swing generator in per-unit." />
                  </span>
                  <span className="font-mono text-[#500b50]">{(pfVariables.slackVoltagePu || 1.05).toFixed(3)} pu</span>
                </div>
                <input
                  type="range"
                  min="0.95"
                  max="1.15"
                  step="0.005"
                  value={pfVariables.slackVoltagePu || 1.05}
                  onChange={(e) => handleLiveParamChange('slackVoltagePu', parseFloat(e.target.value))}
                  className="w-full accent-[#500b50] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>0.95 pu</span>
                  <span>1.05 pu</span>
                  <span>1.15 pu</span>
                </div>
              </div>

              {/* Shunt Compensation */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center">
                    Shunt MVAR ($\Delta Q$)
                    <TooltipBadge content="Grid reactive support. Positive values inject capacitive MVAR to lift low voltages; negative absorbs MVAR." />
                  </span>
                  <span className="font-mono text-[#500b50]">{pfVariables.shuntMvarCompensation || 0} MVAR</span>
                </div>
                <input
                  type="range"
                  min="-300"
                  max="600"
                  step="25"
                  value={pfVariables.shuntMvarCompensation || 0}
                  onChange={(e) => handleLiveParamChange('shuntMvarCompensation', parseFloat(e.target.value))}
                  className="w-full accent-[#500b50] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>-300 React</span>
                  <span>0</span>
                  <span>+600 Cap</span>
                </div>
              </div>

              {/* Thermal Derating */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center">
                    Thermal Rating
                    <TooltipBadge content="Corridor continuous current capacity multiplier to account for ambient temperature and line sag." />
                  </span>
                  <span className="font-mono text-[#500b50]">{(pfVariables.thermalDeratingFactor || 1.0).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.2"
                  step="0.05"
                  value={pfVariables.thermalDeratingFactor || 1.0}
                  onChange={(e) => handleLiveParamChange('thermalDeratingFactor', parseFloat(e.target.value))}
                  className="w-full accent-[#500b50] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>0.6x (Hot)</span>
                  <span>1.0x (Std)</span>
                  <span>1.2x</span>
                </div>
              </div>
            </div>
          </div>

          {/* Telemetry Switcher & Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex rounded-lg border border-slate-200 p-0.5 bg-white font-bold">
                <button
                  onClick={() => setDeckView('buses')}
                  className={`px-3 py-1 rounded transition ${
                    deckView === 'buses' ? 'bg-[#500b50] text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Substation Voltages ({buses.length})
                </button>
                <button
                  onClick={() => setDeckView('lines')}
                  className={`px-3 py-1 rounded transition flex items-center gap-1.5 ${
                    deckView === 'lines' ? 'bg-[#500b50] text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Power className="h-3 w-3 text-rose-500" />
                  <span>$N-1$ Breakers ({lines.length})</span>
                  {trippedLines.length > 0 && (
                    <span className="bg-rose-600 text-white rounded-full px-1.5 py-0.2 text-[10px]">
                      {trippedLines.length}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter by name or zone..."
                  value={busSearchQuery}
                  onChange={(e) => setBusSearchQuery(e.target.value)}
                  className="border border-slate-300 rounded px-2.5 py-1 text-xs w-48 bg-white focus:outline-none focus:border-[#500b50]"
                />
                <button
                  onClick={onReset}
                  className="flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Baseline</span>
                </button>
              </div>
            </div>

            {deckView === 'buses' ? (
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-left text-xs min-w-[620px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">ID</th>
                      <th className="py-2 px-3">Substation</th>
                      <th className="py-2 px-3">Zone</th>
                      <th className="py-2 px-3">Voltage (|V|)</th>
                      <th className="py-2 px-3">Active (MW)</th>
                      <th className="py-2 px-3">Reactive (MVAR)</th>
                      <th className="py-2 px-3 text-right">Service Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {filteredBuses.map((bus) => {
                      const v = bus.v_pu ?? 1.0;
                      const isUnder = v < 0.95;
                      const isOver = v > 1.05;
                      const isDisabled = pfVariables.disabledBuses?.includes(bus.id);

                      return (
                        <tr key={bus.id} className={`hover:bg-slate-50 ${isDisabled ? 'bg-slate-100 opacity-60' : ''}`}>
                          <td className="py-2 px-3 text-slate-400 font-bold">#{bus.id}</td>
                          <td className="py-2 px-3 font-sans font-bold text-slate-900">{bus.name}</td>
                          <td className="py-2 px-3 font-sans text-slate-500">{bus.zone || 'Grid Zone'}</td>
                          <td className="py-2 px-3 font-bold">
                            <span className={isUnder ? 'text-rose-700' : isOver ? 'text-amber-700' : 'text-emerald-700'}>
                              {v.toFixed(3)} pu
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold">{(bus.p_mw ?? 0).toFixed(1)}</td>
                          <td className="py-2 px-3 text-slate-600">{(bus.q_mvar ?? 0).toFixed(1)}</td>
                          <td className="py-2 px-3 text-right font-sans">
                            {isDisabled ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                                Isolated (Sandbox)
                              </span>
                            ) : isUnder ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                Under-voltage
                              </span>
                            ) : isOver ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                Over-voltage
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
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
            ) : (
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-left text-xs min-w-[620px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Circuit ID</th>
                      <th className="py-2 px-3">Corridor</th>
                      <th className="py-2 px-3">Interconnection</th>
                      <th className="py-2 px-3">Flow (MW)</th>
                      <th className="py-2 px-3">Loading (%)</th>
                      <th className="py-2 px-3 text-right">Breaker Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {lines.map((l) => {
                      const isTripped = trippedLines.includes(l.id);
                      const ld = l.loading_percent ?? 0;

                      return (
                        <tr key={l.id} className={`hover:bg-slate-50 ${isTripped ? 'bg-rose-50/60' : ''}`}>
                          <td className="py-2 px-3 text-slate-400 font-bold">#{l.id}</td>
                          <td className="py-2 px-3 font-sans font-bold text-slate-900">{l.name}</td>
                          <td className="py-2 px-3 text-slate-500">#{l.from_bus} $\to$ #{l.to_bus}</td>
                          <td className="py-2 px-3 font-bold">{isTripped ? '0.0 MW' : `${(l.flow_mw ?? 0).toFixed(1)} MW`}</td>
                          <td className="py-2 px-3">
                            {isTripped ? (
                              <span className="text-slate-400 font-bold">OPEN</span>
                            ) : (
                              <span className={ld > 100 ? 'text-rose-700 font-bold' : ld > 85 ? 'text-amber-700 font-bold' : 'text-slate-800'}>
                                {ld.toFixed(1)}%
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-sans">
                            <button
                              onClick={() => toggleLine(l.id)}
                              className={`px-2.5 py-1 rounded text-xs font-bold transition shadow-2xs ${
                                isTripped
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-rose-600 text-white hover:bg-rose-700'
                              }`}
                            >
                              {isTripped ? 'Reclose Breaker' : 'Trip ($N-1$)'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CHOOSE & MANAGE MODELS                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search registered model..."
                value={modelSearchQuery}
                onChange={(e) => setModelSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg w-full text-xs"
              />
            </div>
            {onRefreshModels && (
              <button
                onClick={() => onRefreshModels()}
                disabled={modelsLoading}
                className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-semibold"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${modelsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh Registry</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredModels.map((m) => {
              const isActive = m.is_active || m.name === currentDisplayName;

              return (
                <div
                  key={m.id}
                  className={`p-4 rounded-xl border bg-white shadow-2xs flex flex-col justify-between transition ${
                    isActive ? 'border-emerald-600 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-[#500b50] border border-purple-200">
                        {m.voltage_level}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          <span>Active in Memory</span>
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">{m.name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-1">
                      {m.buses} Substations • {m.branches} Corridors • {m.total_installed_mw.toLocaleString()} MW
                    </p>
                  </div>

                  <button
                    onClick={() => handleActivate(m.id)}
                    disabled={activatingId !== null}
                    className={`mt-4 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      isActive ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-[#500b50] text-white hover:bg-[#680f68]'
                    }`}
                  >
                    {activatingId === m.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5 text-amber-300" />
                    )}
                    <span>{isActive ? 'Active Case' : 'Activate & Solve Case'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DYNAMIC LOAD SHARING                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'load_sharing' && (
        <div className="space-y-4">
          {/* Sub-toggle: Parallel Corridors vs Generator Governor Droop */}
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-bold w-fit shadow-2xs">
            <button
              onClick={() => setLoadSharingMode('branches')}
              className={`px-3 py-1.5 rounded transition ${
                loadSharingMode === 'branches' ? 'bg-[#500b50] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Parallel Branch Impedance Division ($P_1/P_2 = X_2/X_1$)
            </button>
              <button
                onClick={() => setLoadSharingMode('generators')}
                className={`px-3 py-1.5 rounded transition ${
                  loadSharingMode === 'generators' ? 'bg-[#500b50] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Generator Droop Dispatch Pickup (P–f)
              </button>
          </div>

          {loadSharingMode === 'branches' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 text-xs text-blue-900 flex items-start gap-2.5">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">What is Parallel Branch Load Sharing?</p>
                  <p className="mt-0.5 text-blue-800 leading-relaxed">
                    When two or more transmission lines or transformers connect the same two substations, power naturally splits <strong>inversely proportional to line reactance</strong> ($P \propto 1/X$). If one line has lower impedance, it pulls more current and overloads before the parallel line reaches full rating.
                  </p>
                </div>
              </div>

              {loadSharingResult?.parallel_corridors && loadSharingResult.parallel_corridors.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {loadSharingResult.parallel_corridors.map((corr: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <span className="font-bold text-xs text-slate-900 flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-[#500b50]" />
                          <span>{corr.corridor}</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {corr.circuits_count} Parallel Circuits
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {corr.circuits.map((circ: any) => (
                          <div key={circ.line_id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5 text-xs font-mono">
                            <div className="flex justify-between font-sans font-bold">
                              <span>{circ.name}</span>
                              <span className="text-[#500b50] font-mono">{circ.theoretical_share_percent}% Share</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-[#500b50] h-full rounded-full"
                                style={{ width: `${circ.theoretical_share_percent}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[11px] text-slate-500">
                              <span>Reactance: {circ.reactance_ohm} Ω</span>
                              <span>Ratio: $1/X$</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
                  No multiple parallel circuit corridors detected in this active model.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center">
                    Frequency Disturbance Demand Step
                    <TooltipBadge content="Sudden load surge applied to synchronous generators to test decentralized droop pickup." />
                  </span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="50"
                      max="1200"
                      step="25"
                      value={loadStepMw}
                      onChange={(e) => setLoadStepMw(parseFloat(e.target.value))}
                      className="accent-[#500b50] cursor-pointer w-48"
                    />
                    <span className="font-mono font-bold text-xs text-[#500b50]">+{loadStepMw} MW</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Settling Freq</span>
                    <span className="font-bold text-slate-900">{loadSharingResult?.settling_frequency_hz || 50.0} Hz</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Stiffness</span>
                    <span className="font-bold text-slate-900">{loadSharingResult?.system_stiffness_mw_per_hz || 0} MW/Hz</span>
                  </div>
                </div>
              </div>

              {/* Generator Allocation Table */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs min-w-[650px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Station</th>
                      <th className="py-2.5 px-3">Rated Capacity</th>
                      <th className="py-2.5 px-3">Droop ($R$)</th>
                      <th className="py-2.5 px-3">Participation</th>
                      <th className="py-2.5 px-3">Assigned $\Delta P$</th>
                      <th className="py-2.5 px-3 text-right">Headroom</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {(loadSharingResult?.allocations || []).map((gen: any) => (
                      <tr key={gen.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-sans font-bold text-slate-900">{gen.name}</td>
                        <td className="py-2 px-3">{gen.rated_mw} MW</td>
                        <td className="py-2 px-3">{gen.droop_percent}%</td>
                        <td className="py-2 px-3 font-bold text-[#500b50]">{gen.participation_factor_percent}%</td>
                        <td className="py-2 px-3 font-bold text-emerald-700">+{gen.allocated_delta_mw} MW</td>
                        <td className="py-2 px-3 text-right">+{gen.remaining_headroom_mw} MW</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CASCADING FAILURE                                                      */}
      {/* ========================================================================= */}
      {activeTab === 'cascade' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  Initiating Contingency Branch
                  <TooltipBadge content="Select the primary transmission line that trips first to observe redistribution overloads." />
                </label>
                <select
                  value={initialTripLine}
                  onChange={(e) => setInitialTripLine(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-semibold"
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      #{l.id}: {l.name} ({(l.loading_percent ?? 0).toFixed(0)}% load)
                    </option>
                  ))}
                </select>
              </div>

              {/* Slider for Relay Threshold */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="flex items-center">
                    Overcurrent Trip Threshold
                    <TooltipBadge content="Percentage of rated continuous line current before protective relays trigger and open the circuit breaker." />
                  </span>
                  <span className="font-mono text-rose-700">{cascadeThreshold}% of Rating</span>
                </div>
                <input
                  type="range"
                  min="85"
                  max="140"
                  step="5"
                  value={cascadeThreshold}
                  onChange={(e) => setCascadeThreshold(Number(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>85% Alert</span>
                  <span>100% Continuous</span>
                  <span>140% Instantaneous</span>
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={async () => {
                    setCascadeLoading(true);
                    try {
                      const res = await onCascadeTrigger([initialTripLine], cascadeThreshold);
                      setCascadeResult(res);
                    } finally {
                      setCascadeLoading(false);
                    }
                  }}
                  disabled={cascadeLoading || lines.length === 0}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white py-2 text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {cascadeLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                  <span>Run Sequence</span>
                </button>
              </div>
            </div>
          </div>

          {/* Forensic Result Breakdown */}
          {cascadeResult && (
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                  <span className="font-black text-sm text-slate-900 uppercase">
                    {(cascadeResult.status || '').replace(/_/g, ' ')}
                  </span>
                </div>
                <button
                  onClick={() => onApplyCascadeTrips(cascadeResult.all_tripped_lines || [])}
                  className="px-3 py-1 rounded bg-[#500b50] text-white font-bold text-xs"
                >
                  View Islanding on CAD
                </button>
              </div>

              <p className="text-slate-600 leading-relaxed">
                The initiating trip on Circuit #{initialTripLine} redirected power across adjacent corridors. Within{' '}
                <strong>{cascadeResult.total_steps} sequence stages</strong>, a total of{' '}
                <strong className="text-rose-700 font-mono">{cascadeResult.all_tripped_lines?.length || 0} transmission lines</strong> breached the{' '}
                {cascadeThreshold}% thermal threshold and were tripped by overcurrent protection.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono pt-1">
                <div className="bg-white p-2.5 rounded-lg border border-rose-200">
                  <span className="text-[10px] text-slate-400 block font-sans">Cascade Stages</span>
                  <span className="text-base font-bold text-slate-900">{cascadeResult.total_steps}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-rose-200">
                  <span className="text-[10px] text-slate-400 block font-sans">Total Tripped Branches</span>
                  <span className="text-base font-bold text-rose-700">{cascadeResult.all_tripped_lines?.length || 0}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-rose-200">
                  <span className="text-[10px] text-slate-400 block font-sans">Recommended Mitigation</span>
                  <span className="text-xs font-bold text-slate-800 font-sans">Shed load along parallel ties</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. REGIONAL PLANNING (Integrated Interconnection & Node Deletion Sandbox) */}
      {/* ========================================================================= */}
      {activeTab === 'planning' && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span>
                <strong>Local In-Memory Sandbox:</strong> Modifications here only affect temporary simulation memory. The original grid model file in Supabase is never altered.
              </span>
            </div>
            {totalModifications > 0 && (
              <button
                onClick={onReset}
                className="px-2.5 py-1 rounded bg-white border border-blue-300 text-blue-800 font-bold hover:bg-blue-100 shrink-0 ml-2"
              >
                Clear Sandbox Changes
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Propose Substation WITH Integrated Interconnection */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <Plus className="h-4 w-4 text-[#500b50]" />
                <span>Propose Substation &amp; Interconnection Tie</span>
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Substation Name
                    <TooltipBadge content="Name of the new regional bulk transmission node." />
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. KUBWA 330"
                    value={newSubstationName}
                    onChange={(e) => setNewSubstationName(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Connect From Existing Node
                    <TooltipBadge content="Select the existing substation this new facility connects into via an overhead transmission line." />
                  </label>
                  <select
                    value={connectToBusId}
                    onChange={(e) => setConnectToBusId(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
                  >
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.id}: {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Voltage
                    <TooltipBadge content="Operating nominal bus voltage class." />
                  </label>
                  <select
                    value={newSubstationKv}
                    onChange={(e) => setNewSubstationKv(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white"
                  >
                    <option value={330}>330 kV Bulk</option>
                    <option value={132}>132 kV Sub-T</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Tie Length (km)
                    <TooltipBadge content="Overhead transmission line distance to the connection node." />
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={tieLineLength}
                    onChange={(e) => setTieLineLength(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Load (MW)
                    <TooltipBadge content="Planned active demand withdrawal at this node." />
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newSubstationDemand}
                    onChange={(e) => setNewSubstationDemand(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleAddProposedSubstation}
                className="w-full py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs transition"
              >
                + Incorporate Substation &amp; Auto-Re-Solve
              </button>
            </div>

            {/* Sandbox Decommissioning / Deletion Tool */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <Trash2 className="h-4 w-4 text-rose-600" />
                <span>Temporary Node Decommissioning Sandbox</span>
              </h3>

              <p className="text-xs text-slate-500 leading-relaxed">
                Select any substation to isolate or decommission from active memory to evaluate contingency survival.
              </p>

              <div className="space-y-2 text-xs">
                <label className="block text-[11px] font-bold text-slate-600 flex items-center">
                  Select Substation to Isolate
                  <TooltipBadge content="Isolating a substation opens all incident line circuit breakers to test network resilience." />
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedDecommissionBus}
                    onChange={(e) => setSelectedDecommissionBus(Number(e.target.value))}
                    className="flex-1 border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
                  >
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.id}: {b.name} ({b.zone || 'Grid'})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => toggleBusService && toggleBusService(selectedDecommissionBus)}
                    className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0"
                  >
                    {pfVariables.disabledBuses?.includes(selectedDecommissionBus) ? 'Restore Node' : 'Isolate Node'}
                  </button>
                </div>
              </div>

              {pfVariables.disabledBuses && pfVariables.disabledBuses.length > 0 && (
                <div className="pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Currently Isolated Nodes ({pfVariables.disabledBuses.length})
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {pfVariables.disabledBuses.map((bId) => {
                      const busName = buses.find((b) => b.id === bId)?.name || `#${bId}`;
                      return (
                        <span
                          key={bId}
                          className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-mono font-bold flex items-center gap-1"
                        >
                          <span>{busName}</span>
                          <button
                            onClick={() => toggleBusService && toggleBusService(bId)}
                            className="text-rose-500 hover:text-rose-900"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};