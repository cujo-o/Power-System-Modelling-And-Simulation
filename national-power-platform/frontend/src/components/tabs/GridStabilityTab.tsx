'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BusData,
  LineData,
  GridModelMeta,
  NewBusElement,
  NewLineElement,
  NewGenElement,
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
  UploadCloud,
  ChevronLeft,
  Info,
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
  <span className="relative group inline-flex items-center ml-1 align-baseline cursor-help">
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 hover:bg-[#500b50] hover:text-white transition">
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
  onRefreshModels,
  modelsLoading = false,
}) => {
  const activeModel = models.find((m) => m.is_active);

  // Persist viewMode across route navigation
  const [viewMode, setViewModeState] = useState<'select_model' | 'workspace'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ml4ps_view_mode');
      if (saved === 'workspace' || saved === 'select_model') return saved;
    }
    return 'select_model';
  });

  const setViewMode = (mode: 'select_model' | 'workspace') => {
    setViewModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ml4ps_view_mode', mode);
    }
  };

  // Persist workspace subtab across route navigation
  const [workspaceTab, setWorkspaceTabState] = useState<'deck' | 'load_sharing' | 'cascade' | 'planning'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ml4ps_workspace_subtab');
      if (saved) return saved as any;
    }
    return 'deck';
  });

  const setWorkspaceTab = (tab: 'deck' | 'load_sharing' | 'cascade' | 'planning') => {
    setWorkspaceTabState(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ml4ps_workspace_subtab', tab);
    }
  };

  const [deckView, setDeckView] = useState<'buses' | 'lines'>('buses');
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Search & Filter
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<'ALL' | 'Static' | 'Dynamic'>('ALL');
  const [voltageFilter, setVoltageFilter] = useState<'ALL' | '330kV' | '132kV' | '130kV'>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [busSearchQuery, setBusSearchQuery] = useState('');

  // Cascade State
  const [cascadeThreshold, setCascadeThreshold] = useState<number>(100);
  const [initialTripLine, setInitialTripLine] = useState<number>(0);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);

  // Load Sharing State
  const [loadStepMw, setLoadStepMw] = useState<number>(300);
  const [dampingD, setDampingD] = useState<number>(1.2);
  const [loadSharingLoading, setLoadSharingLoading] = useState(false);
  const [loadSharingResult, setLoadSharingResult] = useState<any>(null);

  // Regional Planning State: 1. Substation + Tie
  const [newSubName, setNewSubName] = useState('');
  const [newSubKv, setNewSubKv] = useState(330);
  const [newSubZone, setNewSubZone] = useState('North-Central');
  const [newSubDemand, setNewSubDemand] = useState(45);
  const [connectToExistingBus, setConnectToExistingBus] = useState<number>(1);
  const [tieLengthKm, setTieLengthKm] = useState(55);
  const [tieConductor, setTieConductor] = useState('Bison 330kV');

  // Regional Planning State: 2. Standalone Branch
  const [newLineName, setNewLineName] = useState('');
  const [newLineFrom, setNewLineFrom] = useState<number>(1);
  const [newLineTo, setNewLineTo] = useState<number>(2);
  const [newLineLength, setNewLineLength] = useState(65);
  const [newLineConductor, setNewLineConductor] = useState('Bison 330kV');

  // Regional Planning State: 3. Standalone Plant
  const [newGenName, setNewGenName] = useState('');
  const [newGenBus, setNewGenBus] = useState<number>(1);
  const [newGenP, setNewGenP] = useState(150);
  const [newGenVm, setNewGenVm] = useState(1.03);

  // Regional Planning State: 4. Decommission Sandbox
  const [selectedDecommissionBus, setSelectedDecommissionBus] = useState<number>(1);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleLiveParamChange = (field: keyof ExtendedPowerFlowVariables, value: any) => {
    setPfVariables((prev) => {
      const updated = { ...prev, [field]: value };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        runSimulation();
      }, 350);
      return updated;
    });
  };

  useEffect(() => {
    if (lines.length > 0 && (!initialTripLine || !lines.some((l) => l.id === initialTripLine))) {
      setInitialTripLine(lines[0].id);
    }
  }, [lines, initialTripLine]);

  useEffect(() => {
    if (buses.length > 0) {
      if (!buses.some((b) => b.id === connectToExistingBus)) setConnectToExistingBus(buses[0].id);
      if (!buses.some((b) => b.id === newLineFrom)) setNewLineFrom(buses[0].id);
      if (!buses.some((b) => b.id === newLineTo)) setNewLineTo(buses[1]?.id || buses[0].id);
      if (!buses.some((b) => b.id === newGenBus)) setNewGenBus(buses[0].id);
      if (!buses.some((b) => b.id === selectedDecommissionBus)) setSelectedDecommissionBus(buses[0].id);
    }
  }, [buses, connectToExistingBus, newLineFrom, newLineTo, newGenBus, selectedDecommissionBus]);

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
      console.warn('Load sharing calculation error:', err);
    } finally {
      setLoadSharingLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceTab === 'load_sharing') {
      runLoadSharingCalculation();
    }
  }, [workspaceTab, modelName]);

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchesDomain =
        domainFilter === 'ALL' ||
        (domainFilter === 'Static' && ((m.domain || '').includes('Static') || (m.domain || '').includes('Steady'))) ||
        (domainFilter === 'Dynamic' && (m.domain || '').includes('Dynamic'));

      const level = (m.voltage_level || '').toLowerCase();
      const matchesVoltage =
        voltageFilter === 'ALL' ||
        (voltageFilter === '330kV' && level.includes('330')) ||
        (voltageFilter === '132kV' && (level.includes('132') || level.includes('130'))) ||
        (voltageFilter === '130kV' && (level.includes('130') || level.includes('132')));

      const matchesPlatform =
        platformFilter === 'ALL' || (m.platform || '').toLowerCase().includes(platformFilter.toLowerCase());

      const matchesSearch =
        (m.name || '').toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
        (m.voltage_level || '').toLowerCase().includes(modelSearchQuery.toLowerCase());

      return matchesDomain && matchesVoltage && matchesPlatform && matchesSearch;
    });
  }, [models, domainFilter, voltageFilter, platformFilter, modelSearchQuery]);

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

  const handleAddProposedSubstation = () => {
    if (!newSubName.trim()) return;

    const newBusItem: NewBusElement = {
      name: newSubName.trim(),
      vn_kv: newSubKv,
      zone: newSubZone,
      p_mw: newSubDemand,
      q_mvar: newSubDemand * 0.35,
    };

    const targetBus = buses.find((b) => b.id === connectToExistingBus);
    const assignedNewBusId = buses.length + pfVariables.newBuses.length + 1;

    const newLineItem: NewLineElement = {
      name: `${targetBus?.name || 'Bus'}-${newSubName.trim()}`,
      from_bus: connectToExistingBus,
      to_bus: assignedNewBusId,
      length_km: tieLengthKm,
      conductor_type: tieConductor,
      vn_kv: newSubKv,
    };

    setPfVariables((prev) => ({
      ...prev,
      newBuses: [...prev.newBuses, newBusItem],
      newLines: [...prev.newLines, newLineItem],
    }));

    setNewSubName('');
    setTimeout(runSimulation, 60);
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
    setPfVariables((prev) => ({ ...prev, newLines: [...prev.newLines, item] }));
    setNewLineName('');
    setTimeout(runSimulation, 60);
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
    setPfVariables((prev) => ({ ...prev, newGenerators: [...prev.newGenerators, item] }));
    setNewGenName('');
    setTimeout(runSimulation, 60);
  };

  const currentDisplayName = activeModel?.name || modelName || 'Active Grid Model';
  const totalSandboxModifications =
    pfVariables.newBuses.length +
    pfVariables.newLines.length +
    pfVariables.newGenerators.length +
    (pfVariables.disabledBuses?.length || 0);

  // =========================================================================
  // VIEW 1: INITIAL MODEL SELECTION SCREEN
  // =========================================================================
  if (viewMode === 'select_model') {
    return (
      <div className="space-y-4 max-w-7xl mx-auto py-1 text-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Grid Stability
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select an uploaded transmission network to launch the operational studio.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
              {filteredModels.length} of {models.length} Models Registered
            </span>
            {onRefreshModels && (
              <button
                onClick={() => onRefreshModels()}
                disabled={modelsLoading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:text-slate-900 font-semibold"
                title="Refresh Model List"
              >
                <RefreshCw className={`h-3 w-3 ${modelsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Search Model</label>
              <input
                type="text"
                placeholder="Search case name..."
                value={modelSearchQuery}
                onChange={(e) => setModelSearchQuery(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#500b50]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Domain</label>
              <select
                value={domainFilter}
                onChange={(e: any) => setDomainFilter(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
              >
                <option value="ALL">All Domains</option>
                <option value="Static">Static Power Flow</option>
                <option value="Dynamic">Dynamic &amp; Transient</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Voltage Class</label>
              <select
                value={voltageFilter}
                onChange={(e: any) => setVoltageFilter(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
              >
                <option value="ALL">All Classes</option>
                <option value="330kV">330 kV Bulk Backbone</option>
                <option value="132kV">132 kV Sub-Transmission</option>
                <option value="130kV">130 kV Regional Feeder</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Format</label>
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
              >
                <option value="ALL">All Formats</option>
                <option value="MATPOWER">MATPOWER (.m)</option>
                <option value="PSAT">PSAT / .130</option>
                <option value="DIgSILENT">DIgSILENT PowerFactory</option>
                <option value="ETAP">ETAP</option>
              </select>
            </div>
          </div>
        </div>

        {/* Models Grid */}
        {filteredModels.length === 0 ? (
          <div className="p-10 text-center rounded-xl border border-dashed border-slate-300 bg-white space-y-2">
            <UploadCloud className="h-8 w-8 text-[#500b50] mx-auto" />
            <p className="text-sm font-bold text-slate-800">
              {modelsLoading ? 'Querying model storage...' : 'No Simulation Models Available'}
            </p>
            <p className="text-xs text-slate-500">
              Upload transmission networks in the Ingestion module to begin.
            </p>
            <button
              onClick={() => onNavigateTab('Upload & Ingestion')}
              className="mt-2 px-3 py-1.5 rounded-lg bg-[#500b50] text-white text-xs font-bold"
            >
              Go to Upload
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredModels.map((m) => {
              const isCurrent = m.is_active || m.name === currentDisplayName;

              return (
                <div
                  key={m.id}
                  className={`p-4 rounded-xl border bg-white shadow-2xs flex flex-col justify-between transition ${
                    isCurrent ? 'border-emerald-600 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-[#500b50] border border-purple-200">
                          {m.voltage_level}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {m.platform}
                        </span>
                      </div>

                      {isCurrent && (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          <span>Active</span>
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-slate-900">{m.name}</h3>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        {m.buses} Substations • {m.branches} Corridors • {(m.total_installed_mw || 0).toLocaleString()} MW
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectModel(m.id)}
                    disabled={activatingId !== null}
                    className={`mt-4 w-full py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      isCurrent ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-[#500b50] text-white hover:bg-[#680f68]'
                    }`}
                  >
                    {activatingId === m.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    <span>{isCurrent ? 'Open' : 'Run'}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: FULL OPERATIONAL WORKSPACE
  // =========================================================================
  return (
    <div className="space-y-4 max-w-7xl mx-auto py-1 text-slate-800">
      {/* Workspace Top Bar with "Switch Model" button and Subtabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('select_model')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition"
            title="Return to Model Registry"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Switch Model</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-slate-900 tracking-tight">{currentDisplayName}</span>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">
                {buses.length} Substations • {lines.length} Branches
              </span>
            </div>
          </div>
        </div>

        {/* Subtabs Navigation */}
        <div className="flex flex-wrap items-center rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold shadow-xs gap-1">
          <button
            onClick={() => setWorkspaceTab('deck')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
              workspaceTab === 'deck' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Operational Deck</span>
          </button>

          <button
            onClick={() => setWorkspaceTab('load_sharing')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
              workspaceTab === 'load_sharing' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span>Load Sharing (P–f)</span>
          </button>

          <button
            onClick={() => setWorkspaceTab('cascade')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
              workspaceTab === 'cascade' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Power className="h-3.5 w-3.5 text-rose-500" />
            <span>Cascading Failure</span>
          </button>

          <button
            onClick={() => setWorkspaceTab('planning')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition relative ${
              workspaceTab === 'planning' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
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

      {/* Styled Diagnostics Banner */}
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
              <span>Solve</span>
            </button>
          )}
        </div>
      )}

      {/* WORKSPACE SUBTAB 1: OPERATIONAL DECK */}
      {workspaceTab === 'deck' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {/* Demand Scale */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Demand Scale
                  <TooltipBadge content="System-wide load scaling factor. Proportioned live across all bulk consumption nodes." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">{Math.round((pfVariables.loadMultiplier || 1.0) * 100)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="5"
                  min="40"
                  max="250"
                  value={Math.round((pfVariables.loadMultiplier || 1.0) * 100)}
                  onChange={(e) => handleLiveParamChange('loadMultiplier', parseFloat(e.target.value) / 100)}
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

            {/* Power Factor */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Power Factor (cos φ)
                  <TooltipBadge content="Operating active-to-apparent power ratio. Determines inductive reactive MVAR consumption." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">{(pfVariables.targetPowerFactor || 0.9).toFixed(2)}</span>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.75"
                max="1.0"
                value={pfVariables.targetPowerFactor || 0.9}
                onChange={(e) => handleLiveParamChange('targetPowerFactor', parseFloat(e.target.value))}
                className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 font-mono block">Range: 0.75 – 1.00</span>
            </div>

            {/* Slack Voltage */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Slack Voltage ($V_0$)
                  <TooltipBadge content="Terminal voltage setpoint magnitude at the reference swing bus in per-unit." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">{(pfVariables.slackVoltagePu || 1.05).toFixed(3)}</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.005"
                  min="0.95"
                  max="1.15"
                  value={pfVariables.slackVoltagePu || 1.05}
                  onChange={(e) => handleLiveParamChange('slackVoltagePu', parseFloat(e.target.value))}
                  className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
                />
                <span className="text-slate-400 text-xs font-mono">pu</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">Nominal: 1.000 pu</span>
            </div>

            {/* Shunt MVAR */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Shunt MVAR ($\Delta Q$)
                  <TooltipBadge content="Grid reactive support. Positive injects capacitive MVAR to boost voltage; negative absorbs MVAR." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">{pfVariables.shuntMvarCompensation || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="25"
                  value={pfVariables.shuntMvarCompensation || 0}
                  onChange={(e) => handleLiveParamChange('shuntMvarCompensation', parseFloat(e.target.value))}
                  className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
                />
                <span className="text-slate-400 text-xs font-mono">MVAR</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">+Capacitor / -Reactor</span>
            </div>

            {/* Thermal Derating */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Thermal Derating
                  <TooltipBadge content="Corridor continuous current capacity derating factor to account for ambient temperature and line sag." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">{(pfVariables.thermalDeratingFactor || 1.0).toFixed(2)}x</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="1.2"
                  value={pfVariables.thermalDeratingFactor || 1.0}
                  onChange={(e) => handleLiveParamChange('thermalDeratingFactor', parseFloat(e.target.value))}
                  className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
                />
                <span className="text-slate-400 text-xs font-mono">ratio</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">Ambient Temperature</span>
            </div>
          </div>

          {/* Telemetry Tables */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
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
                  className={`px-3 py-1 rounded transition flex items-center gap-1 ${
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
                  placeholder="Filter bus or zone..."
                  value={busSearchQuery}
                  onChange={(e) => setBusSearchQuery(e.target.value)}
                  className="border border-slate-300 rounded px-2.5 py-1 text-xs w-44 bg-white"
                />
                <button
                  onClick={() => onReset()}
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
                                Decommissioned
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

      {/* WORKSPACE SUBTAB 2: LOAD SHARING */}
      {workspaceTab === 'load_sharing' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center">
                Demand Surge Step ($\Delta P$)
                <TooltipBadge content="System-wide sudden active power disturbance testing decentralized governor droop pickup." />
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="25"
                  min="25"
                  max="2000"
                  value={loadStepMw}
                  onChange={(e) => setLoadStepMw(parseFloat(e.target.value) || 300)}
                  className="font-mono font-bold text-xs border border-slate-300 rounded px-2.5 py-1 w-28 bg-white"
                />
                <span className="text-xs font-mono font-bold text-slate-500">MW</span>
                <button
                  onClick={runLoadSharingCalculation}
                  disabled={loadSharingLoading}
                  className="ml-2 px-3 py-1 rounded bg-[#500b50] text-white text-xs font-bold flex items-center gap-1"
                >
                  {loadSharingLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                  <span>Solve Pickup</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[10px]">Settling Freq</span>
                <span className="font-bold text-slate-900">{loadSharingResult?.settling_frequency_hz || 50.0} Hz</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">System Stiffness</span>
                <span className="font-bold text-slate-900">{loadSharingResult?.system_stiffness_mw_per_hz || 0} MW/Hz</span>
              </div>
            </div>
          </div>

          {/* Parallel Circuits Impedance Division */}
          {loadSharingResult?.parallel_corridors && loadSharingResult.parallel_corridors.length > 0 && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-xs text-slate-900 flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-[#500b50]" />
                  <span>Parallel Branch Impedance Flow Division ($P_1/P_2 = X_2/X_1$)</span>
                </span>
                <span className="text-[10px] text-slate-500">
                  Natural branch split inverse to line series reactance
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {loadSharingResult.parallel_corridors.map((corr: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2 text-xs font-mono">
                    <div className="flex justify-between font-sans font-bold text-slate-900">
                      <span>{corr.corridor}</span>
                      <span className="text-[#500b50]">{corr.circuits_count} Circuits</span>
                    </div>
                    {corr.circuits.map((circ: any) => (
                      <div key={circ.line_id} className="flex justify-between items-center text-[11px] text-slate-600">
                        <span>{circ.name}</span>
                        <span>{circ.reactance_ohm} Ω ({circ.theoretical_share_percent}%)</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="p-2.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
              Synchronous Governor Droop Allocation Table
            </div>
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Station</th>
                  <th className="py-2.5 px-3">Capacity</th>
                  <th className="py-2.5 px-3">Droop ($R$)</th>
                  <th className="py-2.5 px-3">Participation</th>
                  <th className="py-2.5 px-3">Assigned Pickup</th>
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

      {/* WORKSPACE SUBTAB 3: CASCADING FAILURE */}
      {workspaceTab === 'cascade' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  Initiating Contingency Branch
                  <TooltipBadge content="Select the primary line circuit breaker to trip open first." />
                </label>
                <select
                  value={initialTripLine}
                  onChange={(e) => setInitialTripLine(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white font-semibold"
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      #{l.id}: {l.name} ({(l.loading_percent ?? 0).toFixed(0)}% load)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  Overcurrent Relay Threshold (%)
                  <TooltipBadge content="Percentage of rated continuous line current before thermal protection trips the circuit breaker open." />
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="80"
                    max="160"
                    step="5"
                    value={cascadeThreshold}
                    onChange={(e) => setCascadeThreshold(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold bg-white"
                  />
                  <span className="font-mono text-xs font-bold text-slate-500">%</span>
                </div>
                <div className="flex gap-1 pt-1">
                  {[95, 100, 115, 130].map((val) => (
                    <button
                      key={val}
                      onClick={() => setCascadeThreshold(val)}
                      className="flex-1 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      {val}%
                    </button>
                  ))}
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
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white py-2 text-xs font-bold transition disabled:opacity-50"
                >
                  {cascadeLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                  <span>Run Sequence</span>
                </button>
              </div>
            </div>
          </div>

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
                  View Outages on CAD
                </button>
              </div>

              <p className="text-slate-700 leading-relaxed">
                <strong>Forensic Sequence Summary:</strong> Initiating outage on circuit #{initialTripLine} triggered immediate flow redistribution. In total,{' '}
                <strong className="text-rose-700 font-mono font-bold">{cascadeResult.all_tripped_lines?.length || 0} transmission circuits</strong> exceeded the {cascadeThreshold}% threshold and were isolated across{' '}
                <strong>{cascadeResult.total_steps} chronological stages</strong>.
              </p>

              {cascadeResult.timeline && cascadeResult.timeline.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-white overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Stage</th>
                        <th className="py-2 px-3">Diagnostic Event</th>
                        <th className="py-2 px-3">Isolated Branches</th>
                        <th className="py-2 px-3 text-right">Max Thermal Loading</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {cascadeResult.timeline.map((stepItem: any, sIdx: number) => (
                        <tr key={sIdx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-bold text-slate-400">Step {stepItem.step}</td>
                          <td className="py-1.5 px-3 font-sans text-slate-800">{stepItem.description}</td>
                          <td className="py-1.5 px-3 text-rose-700">
                            {stepItem.tripped_in_this_step?.length > 0
                              ? stepItem.tripped_in_this_step.map((id: number) => `#${id}`).join(', ')
                              : 'None (System Settled)'}
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold">
                            {(stepItem.max_loading_percent || 0).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* WORKSPACE SUBTAB 4: REGIONAL PLANNING */}
      {workspaceTab === 'planning' && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span>
                <strong>In-Memory Sandbox Guarantee:</strong> All additions and isolations here test network expansion in memory. The original `.m` base file in Supabase is never altered.
              </span>
            </div>
            {totalSandboxModifications > 0 && (
              <button
                onClick={onReset}
                className="px-2.5 py-1 rounded bg-white border border-blue-300 text-blue-800 font-bold hover:bg-blue-100 shrink-0 ml-2"
              >
                Clear Sandbox
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 1. Propose Substation WITH Required Interconnection */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <Plus className="h-4 w-4 text-[#500b50]" />
                <span>1. Propose Substation &amp; Interconnection</span>
              </h4>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Substation Name
                    <TooltipBadge content="Name of the new regional bulk transmission node." />
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. KUBWA 330"
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Connect From Node
                    <TooltipBadge content="Select which existing substation this proposed node connects to." />
                  </label>
                  <select
                    value={connectToExistingBus}
                    onChange={(e) => setConnectToExistingBus(Number(e.target.value))}
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

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Voltage
                    <TooltipBadge content="Operating bus voltage class." />
                  </label>
                  <select
                    value={newSubKv}
                    onChange={(e) => setNewSubKv(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                  >
                    <option value={330}>330 kV Bulk</option>
                    <option value={132}>132 kV Sub-T</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Length (km)
                    <TooltipBadge content="Overhead transmission line distance to the connection node." />
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={tieLengthKm}
                    onChange={(e) => setTieLengthKm(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
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
                    value={newSubDemand}
                    onChange={(e) => setNewSubDemand(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleAddProposedSubstation}
                className="w-full py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs transition"
              >
                + Add Substation &amp; Interconnection
              </button>
            </div>

            {/* 2. Connect Independent Line Corridor */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <Plus className="h-4 w-4 text-[#500b50]" />
                <span>2. Connect Independent Line Corridor</span>
              </h4>

              <div className="text-xs">
                <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                  Corridor Name
                  <TooltipBadge content="Identifier for the overhead transmission line." />
                </label>
                <input
                  type="text"
                  placeholder="e.g. MAKURDI - WUKARI"
                  value={newLineName}
                  onChange={(e) => setNewLineName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    From Bus
                    <TooltipBadge content="Originating substation node." />
                  </label>
                  <select
                    value={newLineFrom}
                    onChange={(e) => setNewLineFrom(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
                  >
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.id}: {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    To Bus
                    <TooltipBadge content="Terminating substation node." />
                  </label>
                  <select
                    value={newLineTo}
                    onChange={(e) => setNewLineTo(Number(e.target.value))}
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

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Length (km)
                    <TooltipBadge content="Corridor distance in kilometers." />
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newLineLength}
                    onChange={(e) => setNewLineLength(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Conductor
                    <TooltipBadge content="Electrical conductor type determining reactance and rating." />
                  </label>
                  <select
                    value={newLineConductor}
                    onChange={(e) => setNewLineConductor(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
                  >
                    <option value="Bison 330kV">Bison 330kV</option>
                    <option value="Bear 330kV">Bear 330kV</option>
                    <option value="Panther 132kV">Panther 132kV</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleAddLine}
                className="w-full py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs transition"
              >
                + Connect Line Corridor
              </button>
            </div>

            {/* 3. Propose Power Plant */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <Plus className="h-4 w-4 text-[#500b50]" />
                <span>3. Propose Power Generation Plant</span>
              </h4>

              <div className="text-xs">
                <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                  Plant Identifier
                  <TooltipBadge content="Power station generation facility name." />
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kano Solar IPP"
                  value={newGenName}
                  onChange={(e) => setNewGenName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Interconnection Node
                    <TooltipBadge content="Substation busbar where power injects." />
                  </label>
                  <select
                    value={newGenBus}
                    onChange={(e) => setNewGenBus(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
                  >
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.id}: {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Output (MW)
                    <TooltipBadge content="Active generating capability in MW." />
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newGenP}
                    onChange={(e) => setNewGenP(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                    Target (pu)
                    <TooltipBadge content="Terminal generator excitation voltage target." />
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.95"
                    max="1.10"
                    value={newGenVm}
                    onChange={(e) => setNewGenVm(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleAddGen}
                className="w-full py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs transition"
              >
                + Incorporate Generation Plant
              </button>
            </div>

            {/* 4. Sandbox Node Deletion / Decommissioning */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <Trash2 className="h-4 w-4 text-rose-600" />
                <span>4. Decommission / Delete Node</span>
              </h4>

              <div className="text-xs space-y-2">
                <label className="block text-[11px] font-bold text-slate-600 flex items-center">
                  Select Substation to Isolate
                  <TooltipBadge content="Temporarily isolate a node and its incident branches to test contingency survival." />
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedDecommissionBus}
                    onChange={(e) => setSelectedDecommissionBus(Number(e.target.value))}
                    className="flex-1 border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
                  >
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.id}: {b.name}
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
                <div className="pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Currently Decommissioned Nodes ({pfVariables.disabledBuses.length})
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