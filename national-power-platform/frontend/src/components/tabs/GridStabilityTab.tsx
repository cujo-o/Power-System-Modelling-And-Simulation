'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  GitBranch,
  Sliders,
  Power,
  Activity,
  ChevronLeft,
  MoreHorizontal,
  Droplets,
  Flame,
  Sun,
} from 'lucide-react';
import { TooltipBadge } from '@/components/ui/TooltipBadge';
import { ApiResult } from '@/lib/apiClient';
import {
  BusData,
  LineData,
  GridModelMeta,
  CascadeResult,
  ExtendedPowerFlowVariables,
  WideAreaScenario,
} from '@/types/grid';
import { ModelSelector } from './stability/ModelSelector';
import { ElementPropertyModal, EditingTarget } from './stability/ElementPropertyModal';
import { LoadSharingPanel } from './stability/LoadSharingPanel';
import { CascadePanel } from './stability/CascadePanel';
import { RegionalPlanningPanel } from './stability/RegionalPlanningPanel';

interface GridStabilityTabProps {
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
  callWithHydration?: <T = Record<string, unknown>>(
    path: string,
    options?: RequestInit
  ) => Promise<ApiResult<T>>;
  isAdmin?: boolean;
  onRefreshModels?: () => Promise<void> | void;
  modelsLoading?: boolean;
}

type WorkspaceTab = 'deck' | 'load_sharing' | 'cascade' | 'planning';
type DeckCategory = 'all' | 'buses' | 'lines' | 'generators' | 'loads' | 'disruptions';

const WIDE_AREA_SCENARIOS: {
  id: WideAreaScenario['activeEvent'];
  title: string;
  desc: string;
}[] = [
  {
    id: 'NONE',
    title: 'Normal Grid Operations',
    desc: 'No active wide-area natural or cyber-physical disruption.',
  },
  {
    id: 'HYDRO_FLOOD_SURGE',
    title: 'River Niger Flooding Event',
    desc: 'High tailwater elevation derates net head at Kainji, Jebba & Shiroro hydro stations.',
  },
  {
    id: 'GAS_PIPELINE_RUPTURE',
    title: 'Gas Pipeline Pressure Loss',
    desc: 'ELPS/AKK gas supply pressure drop derates thermal gas-fired generating units.',
  },
  {
    id: 'CYBER_SCADA_ATTACK',
    title: 'SCADA Setpoint Manipulation',
    desc: 'Coordinated voltage setpoint depression across bulk transmission substations.',
  },
  {
    id: 'DISTRIBUTED_CLOUD_TRANSIENT',
    title: 'Distributed Solar Cloud Sweep',
    desc: 'Rapid irradiance drop across distributed PV installations.',
  },
];

export const GridStabilityTab: React.FC<GridStabilityTabProps> = ({
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
  callWithHydration,
  isAdmin = false,
  onRefreshModels,
  modelsLoading = false,
}) => {
  const router = useRouter();
  const activeModel = models.find((m) => m.is_active);

  const [viewMode, setViewModeState] = useState<'select_model' | 'workspace'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ml4ps_view_mode');
      if (saved === 'workspace' || saved === 'select_model') return saved;
    }
    return 'select_model';
  });

  const setViewMode = (mode: 'select_model' | 'workspace') => {
    setViewModeState(mode);
    if (typeof window !== 'undefined') localStorage.setItem('ml4ps_view_mode', mode);
  };

  const [workspaceTab, setWorkspaceTabState] = useState<WorkspaceTab>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ml4ps_workspace_subtab') as WorkspaceTab | null;
      if (saved && ['deck', 'load_sharing', 'cascade', 'planning'].includes(saved)) return saved;
    }
    return 'deck';
  });

  const setWorkspaceTab = (tab: WorkspaceTab) => {
    setWorkspaceTabState(tab);
    if (typeof window !== 'undefined') localStorage.setItem('ml4ps_workspace_subtab', tab);
  };

  const [deckCategory, setDeckCategory] = useState<DeckCategory>('all');
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null);
  const [elementSearchQuery, setElementSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_SERVICE' | 'ISOLATED' | 'VIOLATION'>(
    'ALL'
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLiveParamChange = <K extends keyof ExtendedPowerFlowVariables>(
    field: K,
    value: ExtendedPowerFlowVariables[K]
  ) => {
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    setPfVariables((prev) => ({ ...prev, [field]: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSimulation(), 350);
  };

  const generatorBuses = useMemo(() => {
    const list = buses.filter((b) => {
      const n = (b.name || '').toLowerCase();
      return (
        Boolean(b.is_gen) ||
        (b.p_mw ?? 0) < -1 ||
        n.includes('gs') ||
        n.includes('ps') ||
        n.includes('slack') ||
        n.includes('ipp') ||
        pfVariables.generatorOverrides?.[b.id] !== undefined
      );
    });
    return list.length > 0 ? list : buses.slice(0, Math.min(5, buses.length));
  }, [buses, pfVariables.generatorOverrides]);

  const loadBuses = useMemo(() => {
    const list = buses.filter(
      (b) => Boolean(b.is_load) || (b.p_mw ?? 0) > 0 || pfVariables.loadOverrides?.[b.id] !== undefined
    );
    return list.length > 0 ? list : buses;
  }, [buses, pfVariables.loadOverrides]);

  const trippedSet = useMemo(() => new Set(trippedLines), [trippedLines]);

  const matchesSearchAndStatus = (
    name: string,
    id: number,
    zone: string,
    isIsolated: boolean,
    isViolation: boolean
  ) => {
    if (statusFilter === 'IN_SERVICE' && isIsolated) return false;
    if (statusFilter === 'ISOLATED' && !isIsolated) return false;
    if (statusFilter === 'VIOLATION' && !isViolation) return false;
    if (!elementSearchQuery.trim()) return true;
    const q = elementSearchQuery.toLowerCase();
    return (
      name.toLowerCase().includes(q) ||
      String(id).includes(q) ||
      zone.toLowerCase().includes(q)
    );
  };

  const handleSelectModel = async (id: string) => {
    setActivatingId(id);
    try {
      await onActivateModel(id);
      setViewMode('workspace');
      setWorkspaceTab('deck');
    } finally {
      setActivatingId(null);
    }
  };

  const toggleGenInService = (busId: number) => {
    setPfVariables((prev) => {
      const list = prev.disabledGenerators || [];
      const next = list.includes(busId) ? list.filter((x) => x !== busId) : [...list, busId];
      return { ...prev, disabledGenerators: next };
    });
    setTimeout(() => runSimulation(), 60);
  };

  const toggleLoadInService = (busId: number) => {
    setPfVariables((prev) => {
      const list = prev.disabledLoads || [];
      const next = list.includes(busId) ? list.filter((x) => x !== busId) : [...list, busId];
      return { ...prev, disabledLoads: next };
    });
    setTimeout(() => runSimulation(), 60);
  };

  const currentDisplayName = activeModel?.name || modelName || 'Active Grid Model';
  const totalSubstationsCount = buses.length > 0 ? buses.length : activeModel?.buses || 0;
  const totalBranchesCount = lines.length > 0 ? lines.length : activeModel?.branches || 0;

  const totalSandboxModifications =
    pfVariables.newBuses.length +
    pfVariables.newLines.length +
    pfVariables.newGenerators.length +
    (pfVariables.disabledBuses?.length || 0) +
    Object.keys(pfVariables.busOverrides || {}).length +
    Object.keys(pfVariables.lineOverrides || {}).length +
    Object.keys(pfVariables.generatorOverrides || {}).length +
    Object.keys(pfVariables.loadOverrides || {}).length;

  // VIEW 1: Model Selection Screen
  if (viewMode === 'select_model') {
    return (
      <ModelSelector
        models={models}
        activeModelName={currentDisplayName}
        modelsLoading={modelsLoading}
        activatingId={activatingId}
        isAdmin={isAdmin}
        onSelectModel={handleSelectModel}
        onRefreshModels={onRefreshModels}
        onGoToUpload={() => onNavigateTab('Upload & Ingestion')}
      />
    );
  }

  // VIEW 2: Operational Workspace
  const currentScenario: WideAreaScenario = pfVariables.wideAreaScenario || {
    activeEvent: 'NONE',
    severityPercent: 30,
    autoRecoveryEnabled: true,
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto py-1 text-slate-800">
      {/* Workspace Header & Subtab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('select_model')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Switch Model</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-sm text-slate-900 tracking-tight">
              {currentDisplayName}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
              {totalSubstationsCount} Substations • {totalBranchesCount} Branches
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold shadow-xs gap-1">
          <button
            onClick={() => setWorkspaceTab('deck')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
              workspaceTab === 'deck'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Operational Deck</span>
          </button>

          <button
            onClick={() => setWorkspaceTab('load_sharing')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
              workspaceTab === 'load_sharing'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span>Load Sharing (P–f)</span>
          </button>

          <button
            onClick={() => setWorkspaceTab('cascade')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
              workspaceTab === 'cascade'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Power className="h-3.5 w-3.5 text-rose-500" />
            <span>Cascading Failure</span>
          </button>

          <button
            onClick={() => setWorkspaceTab('planning')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
              workspaceTab === 'planning'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitBranch className="h-3.5 w-3.5 text-blue-500" />
            <span>Regional Planning</span>
            {totalSandboxModifications > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                {totalSandboxModifications}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Solver Diagnostics Banner */}
      {divergedNotice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{divergedNotice}</span>
          </div>
          <button
            onClick={() => (activeModel ? onActivateModel(activeModel.id) : runSimulation())}
            disabled={loading}
            className="px-2.5 py-1 rounded bg-[#500b50] hover:bg-[#680f68] disabled:opacity-60 text-white font-bold text-xs shrink-0 flex items-center gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Solving...' : 'Solve'}</span>
          </button>
        </div>
      )}

      {/* SUBTAB 1: OPERATIONAL DECK */}
      {workspaceTab === 'deck' && (
        <div className="space-y-4">
          {/* Global Solver Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Demand Scale
                  <TooltipBadge content="System-wide load and dispatch scaling factor." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">
                  {Math.round((pfVariables.loadMultiplier || 1.0) * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="5"
                  min="40"
                  max="250"
                  value={Math.round((pfVariables.loadMultiplier || 1.0) * 100)}
                  onChange={(e) =>
                    handleLiveParamChange('loadMultiplier', parseFloat(e.target.value) / 100)
                  }
                  className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
                />
                <span className="text-slate-400 text-xs font-mono font-bold">%</span>
              </div>
              <div className="flex gap-1 pt-1">
                {[80, 100, 120, 150].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handleLiveParamChange('loadMultiplier', pct / 100)}
                    className="flex-1 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Power Factor (cos φ)
                  <TooltipBadge content="System load active-to-apparent power ratio." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">
                  {(pfVariables.targetPowerFactor || 0.9).toFixed(2)}
                </span>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.75"
                max="1.0"
                value={pfVariables.targetPowerFactor || 0.9}
                onChange={(e) =>
                  handleLiveParamChange('targetPowerFactor', parseFloat(e.target.value))
                }
                className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 font-mono block">Range: 0.75 – 1.00</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Slack Voltage (V₀)
                  <TooltipBadge content="Reference swing bus voltage magnitude setpoint in per-unit." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">
                  {(pfVariables.slackVoltagePu || 1.05).toFixed(3)}
                </span>
              </div>
              <input
                type="number"
                step="0.005"
                min="0.95"
                max="1.15"
                value={pfVariables.slackVoltagePu || 1.05}
                onChange={(e) =>
                  handleLiveParamChange('slackVoltagePu', parseFloat(e.target.value))
                }
                className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 font-mono block">Nominal: 1.000 pu</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Shunt MVAR (ΔQ)
                  <TooltipBadge content="Reactive shunt support distributed across peak load buses (+Capacitor / -Reactor)." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">
                  {pfVariables.shuntMvarCompensation || 0}
                </span>
              </div>
              <input
                type="number"
                step="25"
                value={pfVariables.shuntMvarCompensation || 0}
                onChange={(e) =>
                  handleLiveParamChange('shuntMvarCompensation', parseFloat(e.target.value))
                }
                className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 font-mono block">+Capacitor / -Reactor</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Thermal Derating
                  <TooltipBadge content="Multiplier scaling continuous line ampacity ratings (e.g. 0.85 for high ambient heat)." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">
                  {(pfVariables.thermalDeratingFactor || 1.0).toFixed(2)}x
                </span>
              </div>
              <input
                type="number"
                step="0.05"
                min="0.5"
                max="1.5"
                value={pfVariables.thermalDeratingFactor || 1.0}
                onChange={(e) =>
                  handleLiveParamChange('thermalDeratingFactor', parseFloat(e.target.value))
                }
                className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 font-mono block">Ampacity Factor</span>
            </div>
          </div>

          {/* Element Tables Container */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap rounded-lg border border-slate-200 p-0.5 bg-white font-bold gap-0.5">
                {(
                  [
                    { id: 'all', label: `All Elements (${buses.length + lines.length})` },
                    { id: 'buses', label: `Substations (${buses.length})` },
                    { id: 'lines', label: `Lines & Breakers (${lines.length})` },
                    { id: 'generators', label: `Generators (${generatorBuses.length})` },
                    { id: 'loads', label: `Loads & Infra (${loadBuses.length})` },
                    { id: 'disruptions', label: 'Wide-Area Disruptions' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setDeckCategory(cat.id)}
                    className={`px-2.5 py-1.5 rounded transition ${
                      deckCategory === cat.id
                        ? cat.id === 'disruptions'
                          ? 'bg-rose-700 text-white'
                          : 'bg-[#500b50] text-white'
                        : cat.id === 'disruptions'
                        ? 'text-rose-700 hover:bg-rose-50'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value as 'ALL' | 'IN_SERVICE' | 'ISOLATED' | 'VIOLATION'
                    )
                  }
                  className="border border-slate-300 rounded px-2 py-1 text-xs bg-white font-semibold"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="IN_SERVICE">In Service Only</option>
                  <option value="ISOLATED">Isolated / Tripped Only</option>
                  <option value="VIOLATION">Limit Violations Only</option>
                </select>

                <input
                  type="text"
                  placeholder="Filter name, ID, or zone..."
                  value={elementSearchQuery}
                  onChange={(e) => setElementSearchQuery(e.target.value)}
                  className="border border-slate-300 rounded px-2.5 py-1 text-xs w-44 bg-white"
                />

                <button
                  onClick={() => onReset()}
                  disabled={loading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Baseline</span>
                </button>
              </div>
            </div>

            {/* Wide-Area Disruptions Panel */}
            {deckCategory === 'disruptions' && (
              <div className="p-5 space-y-4 bg-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Wide-Area Disruptive Events &amp; Infrastructure Interdependencies
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Simulate regional hydro flooding, gas supply pressure drops, SCADA voltage depression, or solar cloud transients.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                      <span className="font-bold text-slate-700">Severity:</span>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        step="5"
                        value={currentScenario.severityPercent}
                        onChange={(e) =>
                          handleLiveParamChange('wideAreaScenario', {
                            ...currentScenario,
                            severityPercent: Number(e.target.value),
                          })
                        }
                        className="w-24 accent-[#500b50]"
                      />
                      <span className="font-mono font-bold text-[#500b50] w-8">
                        {currentScenario.severityPercent}%
                      </span>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentScenario.autoRecoveryEnabled}
                        onChange={(e) =>
                          handleLiveParamChange('wideAreaScenario', {
                            ...currentScenario,
                            autoRecoveryEnabled: e.target.checked,
                          })
                        }
                        className="accent-emerald-600"
                      />
                      <span>Emergency Var Recovery</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                  {WIDE_AREA_SCENARIOS.map((scen) => {
                    const isSelected = currentScenario.activeEvent === scen.id;
                    return (
                      <button
                        key={scen.id}
                        onClick={() =>
                          handleLiveParamChange('wideAreaScenario', {
                            ...currentScenario,
                            activeEvent: scen.id,
                          })
                        }
                        className={`text-left p-3.5 rounded-xl border transition flex flex-col justify-between ${
                          isSelected
                            ? 'border-[#500b50] bg-purple-50/70 ring-2 ring-[#500b50]/20'
                            : 'border-slate-200 bg-slate-50/60 hover:bg-white'
                        }`}
                      >
                        <div>
                          <span className="font-bold text-slate-900 block">{scen.title}</span>
                          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                            {scen.desc}
                          </p>
                        </div>
                        <span
                          className={`mt-3 inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit ${
                            isSelected
                              ? 'bg-[#500b50] text-white'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isSelected ? 'Active' : 'Activate'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Substations / Buses Table */}
            {(deckCategory === 'all' || deckCategory === 'buses') && (
              <div className="overflow-x-auto max-h-[340px] border-b border-slate-200">
                <div className="px-3 py-2 bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Substations &amp; Busbars ({buses.length})
                </div>
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">ID</th>
                      <th className="py-2 px-3">Substation</th>
                      <th className="py-2 px-3">Zone / kV</th>
                      <th className="py-2 px-3">Voltage (|V|)</th>
                      <th className="py-2 px-3">Net P (MW)</th>
                      <th className="py-2 px-3">Net Q (MVAR)</th>
                      <th className="py-2 px-3">Switch</th>
                      <th className="py-2 px-3 text-right">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {buses
                      .filter((bus) => {
                        const v = bus.v_pu ?? 1.0;
                        const isViol = v < 0.95 || v > 1.05;
                        const isDis = Boolean(pfVariables.disabledBuses?.includes(bus.id));
                        return matchesSearchAndStatus(
                          bus.name,
                          bus.id,
                          bus.zone || '',
                          isDis,
                          isViol
                        );
                      })
                      .map((bus) => {
                        const v = bus.v_pu ?? 1.0;
                        const isUnder = v < 0.95;
                        const isOver = v > 1.05;
                        const isDisabled = Boolean(pfVariables.disabledBuses?.includes(bus.id));
                        return (
                          <tr
                            key={`bus-row-${bus.id}`}
                            className={`hover:bg-slate-50 ${
                              isDisabled ? 'bg-slate-100 opacity-60' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-slate-400 font-bold">#{bus.id}</td>
                            <td className="py-2 px-3 font-sans font-bold text-slate-900">
                              {bus.name}
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-500">
                              {bus.zone || 'Transmission'} • {bus.vn_kv || 330} kV
                            </td>
                            <td className="py-2 px-3 font-bold">
                              <span
                                className={
                                  isUnder
                                    ? 'text-rose-700'
                                    : isOver
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                                }
                              >
                                {v.toFixed(3)} pu
                              </span>
                            </td>
                            <td className="py-2 px-3 font-semibold">{(bus.p_mw ?? 0).toFixed(1)}</td>
                            <td className="py-2 px-3 text-slate-600">
                              {(bus.q_mvar ?? 0).toFixed(1)}
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <button
                                onClick={() => toggleBusService?.(bus.id)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                                  isDisabled
                                    ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                }`}
                              >
                                {isDisabled ? 'Isolated (Off)' : 'In Service'}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-right font-sans">
                              <button
                                onClick={() => setEditingTarget({ kind: 'bus', bus })}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition inline-flex items-center justify-center"
                                title="Edit Substation Properties"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Generating Units Table */}
            {(deckCategory === 'all' || deckCategory === 'generators') && (
              <div className="overflow-x-auto max-h-[340px] border-b border-slate-200">
                <div className="px-3 py-2 bg-purple-50/70 text-[11px] font-bold uppercase tracking-wider text-[#500b50]">
                  Generating Units — Prime-Mover &amp; Dynamic Controls ({generatorBuses.length})
                </div>
                <table className="w-full text-left text-xs min-w-[740px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Bus</th>
                      <th className="py-2 px-3">Station</th>
                      <th className="py-2 px-3">Prime Mover &amp; Input</th>
                      <th className="py-2 px-3">Output (MW)</th>
                      <th className="py-2 px-3">Dynamics (H / R)</th>
                      <th className="py-2 px-3">Switch</th>
                      <th className="py-2 px-3 text-right">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {generatorBuses
                      .filter((bus) => {
                        const isDis = Boolean(pfVariables.disabledGenerators?.includes(bus.id));
                        return matchesSearchAndStatus(
                          bus.name,
                          bus.id,
                          bus.zone || '',
                          isDis,
                          false
                        );
                      })
                      .map((bus) => {
                        const ovr = pfVariables.generatorOverrides?.[bus.id];
                        const isHydro =
                          ovr?.primeMover === 'Hydro' ||
                          (!ovr && /kainji|jebba|shiroro|zungeru|hydro/i.test(bus.name || ''));
                        const isDis = Boolean(pfVariables.disabledGenerators?.includes(bus.id));
                        const genMw = isDis ? 0 : Math.abs(bus.p_mw || ovr?.activeMw || 120);

                        return (
                          <tr
                            key={`gen-row-${bus.id}`}
                            className={`hover:bg-slate-50 ${
                              isDis ? 'bg-slate-100 opacity-60' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-slate-400 font-bold">#{bus.id}</td>
                            <td className="py-2 px-3 font-sans font-bold text-slate-900">
                              {ovr?.name || bus.name}
                            </td>
                            <td className="py-2 px-3 font-sans text-xs">
                              {isHydro ? (
                                <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                                  <Droplets className="h-3.5 w-3.5" />
                                  <span>
                                    Hydro • {ovr?.waterIntakeM3s ?? 280} m³/s (H=
                                    {ovr?.netHeadM ?? 92}m)
                                  </span>
                                </span>
                              ) : ovr?.primeMover === 'Solar / Distributed' ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                                  <Sun className="h-3.5 w-3.5" />
                                  <span>Solar • {ovr?.irradianceWm2 ?? 900} W/m²</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-orange-700 font-semibold">
                                  <Flame className="h-3.5 w-3.5" />
                                  <span>Gas • {ovr?.gasPressureBar ?? 45} bar</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-bold text-emerald-700">
                              {genMw.toFixed(1)} MW
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              H={ovr?.inertiaH ?? (isHydro ? 5.2 : 4.0)}s • R=
                              {ovr?.droopPercent ?? 4.0}%
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <button
                                onClick={() => toggleGenInService(bus.id)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                                  isDis
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isDis ? 'Offline' : 'Online'}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-right font-sans">
                              <button
                                onClick={() => setEditingTarget({ kind: 'generator', bus })}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition inline-flex items-center justify-center"
                                title="Edit Generator Parameters"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Transmission Lines Table */}
            {(deckCategory === 'all' || deckCategory === 'lines') && (
              <div className="overflow-x-auto max-h-[340px] border-b border-slate-200">
                <div className="px-3 py-2 bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Transmission Lines &amp; N-1 Breakers ({lines.length})
                </div>
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">ID</th>
                      <th className="py-2 px-3">Corridor</th>
                      <th className="py-2 px-3">Terminals</th>
                      <th className="py-2 px-3">Flow (MW)</th>
                      <th className="py-2 px-3">Loading (%)</th>
                      <th className="py-2 px-3">Breaker</th>
                      <th className="py-2 px-3 text-right">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {lines
                      .filter((l) => {
                        const isTripped = trippedSet.has(l.id);
                        const isViol = (l.loading_percent ?? 0) > 100;
                        return matchesSearchAndStatus(
                          l.name,
                          l.id,
                          `${l.from_bus}-${l.to_bus}`,
                          isTripped,
                          isViol
                        );
                      })
                      .map((l) => {
                        const isTripped = trippedSet.has(l.id);
                        const ld = l.loading_percent ?? 0;
                        return (
                          <tr
                            key={`line-row-${l.id}`}
                            className={`hover:bg-slate-50 ${isTripped ? 'bg-rose-50/60' : ''}`}
                          >
                            <td className="py-2 px-3 text-slate-400 font-bold">#{l.id}</td>
                            <td className="py-2 px-3 font-sans font-bold text-slate-900">
                              {l.name}
                            </td>
                            <td className="py-2 px-3 text-slate-500">
                              #{l.from_bus} → #{l.to_bus}
                            </td>
                            <td className="py-2 px-3 font-bold">
                              {isTripped ? '0.0 MW' : `${(l.flow_mw ?? 0).toFixed(1)} MW`}
                            </td>
                            <td className="py-2 px-3">
                              {isTripped ? (
                                <span className="text-slate-400 font-bold">OPEN</span>
                              ) : (
                                <span
                                  className={
                                    ld > 100
                                      ? 'text-rose-700 font-bold'
                                      : ld > 85
                                      ? 'text-amber-700 font-bold'
                                      : 'text-slate-800'
                                  }
                                >
                                  {ld.toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <button
                                onClick={() => toggleLine(l.id)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                                  isTripped
                                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                }`}
                              >
                                {isTripped ? 'Open (Reclose)' : 'Closed (Trip N-1)'}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-right font-sans">
                              <button
                                onClick={() => setEditingTarget({ kind: 'line', line: l })}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition inline-flex items-center justify-center"
                                title="Edit Line Impedance & Rating"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Loads & Critical Infrastructure Table */}
            {(deckCategory === 'all' || deckCategory === 'loads') && (
              <div className="overflow-x-auto max-h-[340px]">
                <div className="px-3 py-2 bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Loads &amp; Critical Infrastructure ({loadBuses.length})
                </div>
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Bus</th>
                      <th className="py-2 px-3">Load Center</th>
                      <th className="py-2 px-3">Sector</th>
                      <th className="py-2 px-3">Demand P (MW)</th>
                      <th className="py-2 px-3">Reactive Q (MVAR)</th>
                      <th className="py-2 px-3">Feeder</th>
                      <th className="py-2 px-3 text-right">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {loadBuses
                      .filter((bus) => {
                        const isDis = Boolean(pfVariables.disabledLoads?.includes(bus.id));
                        return matchesSearchAndStatus(
                          bus.name,
                          bus.id,
                          bus.zone || '',
                          isDis,
                          false
                        );
                      })
                      .map((bus) => {
                        const ovr = pfVariables.loadOverrides?.[bus.id];
                        const isDis = Boolean(pfVariables.disabledLoads?.includes(bus.id));
                        return (
                          <tr
                            key={`load-row-${bus.id}`}
                            className={`hover:bg-slate-50 ${
                              isDis ? 'bg-slate-100 opacity-60' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-slate-400 font-bold">#{bus.id}</td>
                            <td className="py-2 px-3 font-sans font-bold text-slate-900">
                              {ovr?.name || bus.name}
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                                {ovr?.criticalInfrastructure || 'Standard Bulk Load'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800">
                              {isDis ? '0.0' : Math.max(0, bus.p_mw ?? 0).toFixed(1)} MW
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {isDis ? '0.0' : (bus.q_mvar ?? 0).toFixed(1)} MVAR
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <button
                                onClick={() => toggleLoadInService(bus.id)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                                  isDis
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isDis ? 'Shed (Off)' : 'Connected'}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-right font-sans">
                              <button
                                onClick={() => setEditingTarget({ kind: 'load', bus })}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition inline-flex items-center justify-center"
                                title="Edit Load & Priority"
                              >
                                <MoreHorizontal className="h-4 w-4" />
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

      {/* Element Property Modal */}
      <ElementPropertyModal
        target={editingTarget}
        pfVariables={pfVariables}
        onClose={() => setEditingTarget(null)}
        onApply={(updater) => {
          setPfVariables(updater);
          setTimeout(() => runSimulation(), 80);
        }}
      />

      {/* SUBTAB 2: LOAD SHARING */}
      {workspaceTab === 'load_sharing' && (
        <LoadSharingPanel
          modelName={currentDisplayName}
          busCount={buses.length}
          generatorOverrides={pfVariables.generatorOverrides}
          callWithHydration={callWithHydration}
        />
      )}

      {/* SUBTAB 3: CASCADING FAILURE */}
      {workspaceTab === 'cascade' && (
        <CascadePanel
          lines={lines}
          onCascadeTrigger={onCascadeTrigger}
          onViewCascadeOnSld={(tripArray) => {
            onApplyCascadeTrips(tripArray);
            onNavigateTab('Single-Line Diagram');
            router.push('/sld');
          }}
        />
      )}

      {/* SUBTAB 4: REGIONAL PLANNING */}
      {workspaceTab === 'planning' && (
        <RegionalPlanningPanel
          buses={buses}
          pfVariables={pfVariables}
          totalSandboxModifications={totalSandboxModifications}
          setPfVariables={setPfVariables}
          runSimulation={runSimulation}
          toggleBusService={toggleBusService}
          onReset={onReset}
        />
      )}
    </div>
  );
};
