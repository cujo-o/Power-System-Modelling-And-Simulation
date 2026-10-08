'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  GitBranch,
  Sliders,
  ShieldAlert,
  ArrowRight,
  Check,
  Zap,
  Power,
  Activity,
  Info,
  Trash2,
  Edit2,
  Lock,
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
  onActivateModel: (id: string) => Promise<void> | void;
  onNavigateTab: (tab: string) => void;
  onCascadeTrigger: (initialTripped: number[], threshold: number) => Promise<CascadeResult>;
  onApplyCascadeTrips: (trippedList: number[]) => void;
  apiBaseUrl?: string;
  isAdmin?: boolean;
  onDeleteModel?: (id: string) => Promise<void> | void;
  onEditModel?: (id: string, updated: Partial<GridModelMeta>) => Promise<void> | void;
}

interface GenAllocation {
  id: string;
  name: string;
  bus_id: number;
  rated_mw: number;
  droop_percent: number;
  participation_factor_percent: number;
  base_p_mw: number;
  allocated_delta_mw: number;
  new_p_mw: number;
  remaining_headroom_mw: number;
  exceeded_rating: boolean;
}

interface ParallelCorridor {
  corridor: string;
  from_bus: number;
  to_bus: number;
  circuits_count: number;
  circuits: {
    line_id: number;
    name: string;
    reactance_ohm: number;
    theoretical_share_percent: number;
  }[];
}

interface LoadSharingResult {
  model_name: string;
  nominal_frequency_hz: number;
  settling_frequency_hz: number;
  frequency_deviation_hz: number;
  load_step_mw: number;
  system_stiffness_mw_per_hz: number;
  allocations: GenAllocation[];
  parallel_corridors: ParallelCorridor[];
}

const TooltipBadge: React.FC<{ content: string }> = ({ content }) => (
  <span className="relative group inline-block ml-1 align-middle">
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 hover:bg-[#500b50] hover:text-white cursor-help transition">
      ?
    </span>
    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-52 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-normal normal-case leading-snug text-white shadow-xl z-50 text-center">
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
  models = [],
  onActivateModel,
  onNavigateTab,
  onCascadeTrigger,
  onApplyCascadeTrips,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-platform.onrender.com',
  isAdmin = true,
  onDeleteModel,
  onEditModel,
}) => {
  const activeModel = models.find((m) => m.is_active);
  const [workflowStep, setWorkflowStep] = useState<'select_model' | 'simulation_properties'>(
    buses.length > 0 ? 'simulation_properties' : 'select_model'
  );

  const [simSubTab, setSimSubTab] = useState<'deck' | 'load_sharing' | 'cascade' | 'planning'>('deck');
  const [deckView, setDeckView] = useState<'buses' | 'lines'>('buses');
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Filters & Search
  const [domainFilter, setDomainFilter] = useState<'ALL' | 'Static' | 'Dynamic'>('ALL');
  const [voltageFilter, setVoltageFilter] = useState<'ALL' | '330kV' | '132kV' | '130kV'>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [busSearchQuery, setBusSearchQuery] = useState('');

  // Cascade State
  const [cascadeThreshold, setCascadeThreshold] = useState(100.0);
  const [initialTripLine, setInitialTripLine] = useState<number>(0);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);

  // Dynamic Load Sharing State
  const [loadStepMw, setLoadStepMw] = useState<number>(300);
  const [dampingD, setDampingD] = useState<number>(1.2);
  const [droopOverrides, setDroopOverrides] = useState<Record<string, number>>({});
  const [loadSharingLoading, setLoadSharingLoading] = useState<boolean>(false);
  const [loadSharingResult, setLoadSharingResult] = useState<LoadSharingResult | null>(null);

  // Regional Planning State
  const [newBusName, setNewBusName] = useState('');
  const [newBusKv, setNewBusKv] = useState(330);
  const [newBusZone, setNewBusZone] = useState('North-Central');
  const [newBusLoadP, setNewBusLoadP] = useState(0);

  const [newLineName, setNewLineName] = useState('');
  const [newLineFrom, setNewLineFrom] = useState<number>(1);
  const [newLineTo, setNewLineTo] = useState<number>(2);
  const [newLineLength, setNewLineLength] = useState(65);
  const [newLineConductor, setNewLineConductor] = useState('Bison 330kV');

  const [newGenName, setNewGenName] = useState('');
  const [newGenBus, setNewGenBus] = useState<number>(1);
  const [newGenP, setNewGenP] = useState(150);
  const [newGenVm, setNewGenVm] = useState(1.03);

  // Synchronize dropdown references
  useEffect(() => {
    if (lines.length > 0 && (!initialTripLine || !lines.some((l) => l.id === initialTripLine))) {
      setInitialTripLine(lines[0].id);
    }
  }, [lines, initialTripLine]);

  useEffect(() => {
    if (buses.length > 0) {
      if (!buses.some((b) => b.id === newLineFrom)) setNewLineFrom(buses[0].id);
      if (!buses.some((b) => b.id === newLineTo)) setNewLineTo(buses[1]?.id || buses[0].id);
      if (!buses.some((b) => b.id === newGenBus)) setNewGenBus(buses[0].id);
    }
  }, [buses, newLineFrom, newLineTo, newGenBus]);

  const runLoadSharingCalculation = async () => {
    setLoadSharingLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/simulations/load-sharing/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          load_step_mw: loadStepMw,
          system_damping_d: dampingD,
          droop_overrides: droopOverrides,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLoadSharingResult(data);
      }
    } catch (err) {
      console.error('Failed to compute dynamic load sharing:', err);
    } finally {
      setLoadSharingLoading(false);
    }
  };

  useEffect(() => {
    if (simSubTab === 'load_sharing') {
      runLoadSharingCalculation();
    }
  }, [simSubTab, modelName]);

  const filteredModels = models.filter((m) => {
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

  const filteredBuses = useMemo(() => {
    if (!busSearchQuery.trim()) return buses;
    const query = busSearchQuery.toLowerCase();
    return buses.filter(
      (b) =>
        b.name.toLowerCase().includes(query) ||
        String(b.id).includes(query) ||
        (b.zone || '').toLowerCase().includes(query)
    );
  }, [buses, busSearchQuery]);

  const voltageStats = useMemo(() => {
    if (buses.length === 0) return { min: 1.0, max: 1.0, avg: 1.0, compliantPercent: 100, minBus: '', maxBus: '' };
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let compliantCount = 0;
    let minBus = '';
    let maxBus = '';

    buses.forEach((b) => {
      const v = b.v_pu ?? 1.0;
      sum += v;
      if (v < min) {
        min = v;
        minBus = b.name;
      }
      if (v > max) {
        max = v;
        maxBus = b.name;
      }
      if (v >= 0.95 && v <= 1.05) compliantCount++;
    });

    return {
      min: Number(min.toFixed(3)),
      max: Number(max.toFixed(3)),
      avg: Number((sum / buses.length).toFixed(3)),
      compliantPercent: Number(((compliantCount / buses.length) * 100).toFixed(1)),
      minBus,
      maxBus,
    };
  }, [buses]);

  const handleActivateAndOpen = async (id: string) => {
    setActivatingId(id);
    try {
      await onActivateModel(id);
      setWorkflowStep('simulation_properties');
      setSimSubTab('deck');
    } finally {
      setActivatingId(null);
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
    setPfVariables((prev) => ({ ...prev, newBuses: [...prev.newBuses, item] }));
    setNewBusName('');
    setNewBusLoadP(0);
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

  const totalExtensionsCount =
    pfVariables.newBuses.length + pfVariables.newLines.length + pfVariables.newGenerators.length;

  const currentDisplayName = activeModel?.name || modelName || 'Active Grid Model';
  const PALETTE = ['#0284c7', '#059669', '#d97706', '#7c3aed', '#dc2626', '#ea580c', '#0d9488', '#2563eb', '#9333ea', '#16a34a'];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Grid Stability &amp; Simulation Studio
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Operational variables deck, dynamic load sharing, $N-1$ contingency switching, and regional expansion.
          </p>
        </div>

        <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
          <button
            onClick={() => setWorkflowStep('select_model')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
              workflowStep === 'select_model'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="h-4 w-4" />
            <span>1. Choose / Manage Models</span>
          </button>

          <span className="text-slate-300 px-2">/</span>

          <button
            onClick={() => setWorkflowStep('simulation_properties')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
              workflowStep === 'simulation_properties'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>2. Simulation Properties</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: CHOOSE AND MANAGE MODELS (Admin Operations)                      */}
      {/* ========================================================================= */}
      {workflowStep === 'select_model' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Filter Registered Models
              </span>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <span className="text-xs font-mono font-bold text-purple-900 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-md flex items-center gap-1">
                    <span>Admin Mode Active</span>
                  </span>
                ) : (
                  <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    <span>Read Only</span>
                  </span>
                )}
                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                  {filteredModels.length} of {models.length} Models
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Search Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. 330kV, 132kV, 130kV, IEEE..."
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
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
                  <option value="ALL">All Domains</option>
                  <option value="Static">Static Power Flow</option>
                  <option value="Dynamic">Dynamic &amp; Transient</option>
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
                  <option value="130kV">130 kV Regional Feeder</option>
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
                  <option value="ALL">All Formats</option>
                  <option value="MATPOWER">MATPOWER (.m)</option>
                  <option value="PSAT">PSAT / .130</option>
                  <option value="DIgSILENT">DIgSILENT PowerFactory</option>
                  <option value="ETAP">ETAP</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredModels.map((m) => {
              const isCurrentActive = m.is_active || m.name === currentDisplayName;

              return (
                <div
                  key={m.id}
                  className={`p-6 rounded-2xl border bg-white shadow-xs transition flex flex-col justify-between ${
                    isCurrentActive
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300'
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

                      <div className="flex items-center gap-2">
                        {isCurrentActive && (
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300 flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5" />
                            <span>Active Case</span>
                          </span>
                        )}

                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            {onEditModel && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const newName = prompt('Update Model Name:', m.name);
                                  if (newName && newName.trim()) {
                                    await onEditModel(m.id, { name: newName.trim() });
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                                title="Admin: Rename Model"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {onDeleteModel && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (confirm(`Admin Action: Permanently delete model "${m.name}"?`)) {
                                    await onDeleteModel(m.id);
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title="Admin: Delete Model"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 leading-snug">{m.name}</h3>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-mono bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-xs text-slate-400 block font-sans font-medium">Substations</span>
                        <span className="font-bold text-slate-900">{m.buses ?? 0} Buses</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block font-sans font-medium">Corridors</span>
                        <span className="font-bold text-slate-900">{m.branches ?? 0} Lines</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block font-sans font-medium">Generation</span>
                        <span className="font-bold text-[#500b50]">
                          {(m.total_installed_mw ?? 0).toLocaleString()} MW
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block font-sans font-medium">Demand</span>
                        <span className="font-bold text-slate-900">
                          {(m.total_demand_mw ?? 0).toLocaleString()} MW
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleActivateAndOpen(m.id)}
                    disabled={activatingId !== null}
                    className={`mt-5 w-full rounded-xl py-3 text-sm font-bold transition shadow-xs flex items-center justify-center gap-2 ${
                      isCurrentActive
                        ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                        : 'bg-[#500b50] text-white hover:bg-[#680f68]'
                    }`}
                  >
                    {activatingId === m.id ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Activating &amp; Solving Flow...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 text-amber-300" />
                        <span>{isCurrentActive ? 'Load & Open Properties' : 'Activate & Open Model'}</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: SIMULATION PROPERTIES                                             */}
      {/* ========================================================================= */}
      {workflowStep === 'simulation_properties' && (
        <div className="space-y-6">
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
                  {currentDisplayName}
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  {buses.length > 0 ? (
                    <>
                      {buses.length} Substations • {lines.length} Corridors • Band: 0.95–1.05 pu
                      {trippedLines.length > 0 && (
                        <span className="text-rose-600 font-bold ml-2">
                          ({trippedLines.length} Line(s) Tripped on $N-1$)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-600 font-bold">
                      Solver memory empty. Click &quot;Re-Hydrate &amp; Solve&quot; below.
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              {buses.length === 0 && (
                <button
                  onClick={() => {
                    const targetId = activeModel?.id || models[0]?.id;
                    if (targetId) handleActivateAndOpen(targetId);
                    else runSimulation();
                  }}
                  disabled={loading || activatingId !== null}
                  className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 transition shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading || activatingId ? 'animate-spin' : ''}`} />
                  <span>Re-Hydrate &amp; Solve</span>
                </button>
              )}

              <button
                onClick={() => setWorkflowStep('select_model')}
                className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 transition shadow-xs"
              >
                <span>Switch / Manage Models</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-xs w-fit gap-1">
            <button
              onClick={() => setSimSubTab('deck')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
                simSubTab === 'deck' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span>Operational Deck</span>
            </button>

            <button
              onClick={() => setSimSubTab('load_sharing')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
                simSubTab === 'load_sharing' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="h-4 w-4 text-emerald-400" />
              <span>Load Sharing (P–f)</span>
            </button>

            <button
              onClick={() => setSimSubTab('cascade')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
                simSubTab === 'cascade' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Power className="h-4 w-4 text-rose-500" />
              <span>Cascading Failure</span>
            </button>

            <button
              onClick={() => setSimSubTab('planning')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition relative ${
                simSubTab === 'planning' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
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

          {/* SUB-VIEW 1: OPERATIONAL VARIABLES DECK */}
          {simSubTab === 'deck' && (
            <div className="space-y-6">
              {divergedNotice && (
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
                  <span>{divergedNotice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-600 flex items-center">
                      <span>Demand Scale</span>
                      <TooltipBadge content="System-wide active load scaling factor. Proportioned dynamically across all bulk consumption and regional nodes." />
                    </label>
                    <span className="text-xs font-mono font-bold text-purple-900">
                      {(pfVariables.loadMultiplier || 1.0).toFixed(2)}x
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="5"
                      min="40"
                      max="250"
                      value={Math.round((pfVariables.loadMultiplier || 1.0) * 100)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setPfVariables((v) => ({ ...v, loadMultiplier: isNaN(val) ? 1.0 : val / 100 }));
                      }}
                      className="w-full text-base font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:border-[#500b50] focus:outline-none"
                    />
                    <span className="text-slate-500 font-mono text-sm font-semibold">%</span>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {[80, 100, 125, 150, 180].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setPfVariables((v) => ({ ...v, loadMultiplier: pct / 100 }))}
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border transition ${
                          Math.round((pfVariables.loadMultiplier || 1.0) * 100) === pct
                            ? 'bg-[#500b50] text-white border-[#500b50]'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-600 flex items-center">
                      <span>Power Factor (cos φ)</span>
                      <TooltipBadge content="Operating active-to-apparent power ratio. Determines inductive reactive MVAR demand across all substation load centers." />
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.70"
                      max="1.0"
                      value={pfVariables.targetPowerFactor || 0.9}
                      onChange={(e) =>
                        setPfVariables((v) => ({ ...v, targetPowerFactor: parseFloat(e.target.value) || 0.9 }))
                      }
                      className="w-full text-base font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:border-[#500b50] focus:outline-none"
                    />
                    <span className="text-slate-400 font-mono text-xs">ratio</span>
                  </div>

                  <span className="text-[11px] text-slate-400 block font-mono">
                    Inductive Tan(φ): {Math.tan(Math.acos(pfVariables.targetPowerFactor || 0.9)).toFixed(2)}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-600 flex items-center">
                      <span>Slack Voltage (V₀)</span>
                      <TooltipBadge content="Terminal voltage setpoint magnitude at the reference busbar in per-unit." />
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.005"
                      min="0.95"
                      max="1.15"
                      value={pfVariables.slackVoltagePu || 1.05}
                      onChange={(e) =>
                        setPfVariables((v) => ({ ...v, slackVoltagePu: parseFloat(e.target.value) || 1.05 }))
                      }
                      className="w-full text-base font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:border-[#500b50] focus:outline-none"
                    />
                    <span className="text-slate-500 font-mono text-sm">pu</span>
                  </div>

                  <span className="text-[11px] text-slate-400 block font-mono">
                    {((pfVariables.slackVoltagePu || 1.05) * 330).toFixed(1)} kV Base
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-600 flex items-center">
                      <span>Shunt MVAR (ΔQ)</span>
                      <TooltipBadge content="Grid reactive compensation. Positive values inject capacitive MVAR to boost voltages; negative absorbs MVAR." />
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="10"
                      value={pfVariables.shuntMvarCompensation || 0}
                      onChange={(e) =>
                        setPfVariables((v) => ({ ...v, shuntMvarCompensation: parseFloat(e.target.value) || 0 }))
                      }
                      className="w-full text-base font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:border-[#500b50] focus:outline-none"
                    />
                    <span className="text-slate-500 font-mono text-xs font-semibold">MVAR</span>
                  </div>

                  <span className="text-[11px] text-slate-400 block font-mono">
                    +Capacitor / -Reactor
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-600 flex items-center">
                      <span>Thermal Derating</span>
                      <TooltipBadge content="Transmission corridor capacity derating factor to account for ambient temperature and line sag." />
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="1.2"
                      value={pfVariables.thermalDeratingFactor || 1.0}
                      onChange={(e) =>
                        setPfVariables((v) => ({ ...v, thermalDeratingFactor: parseFloat(e.target.value) || 1.0 }))
                      }
                      className="w-full text-base font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:border-[#500b50] focus:outline-none"
                    />
                    <span className="text-slate-500 font-mono text-sm">x</span>
                  </div>

                  <span className="text-[11px] text-slate-400 block font-mono">
                    Ambient Temperature
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-xs gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-bold">
                    <button
                      onClick={() => setDeckView('buses')}
                      className={`px-3 py-1.5 rounded-md transition ${
                        deckView === 'buses' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Substation Voltages ({buses.length} Nodes)
                    </button>
                    <button
                      onClick={() => setDeckView('lines')}
                      className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                        deckView === 'lines' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
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
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
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

              {deckView === 'buses' && (
                <div className="space-y-4">
                  {buses.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Minimum Grid Voltage
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span
                            className={`text-lg font-black font-mono ${
                              voltageStats.min < 0.95 ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {voltageStats.min.toFixed(3)} pu
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 truncate block mt-0.5">
                          {voltageStats.minBus}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Maximum Grid Voltage
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span
                            className={`text-lg font-black font-mono ${
                              voltageStats.max > 1.05 ? 'text-amber-600' : 'text-emerald-700'
                            }`}
                          >
                            {voltageStats.max.toFixed(3)} pu
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 truncate block mt-0.5">
                          {voltageStats.maxBus}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Average Grid Voltage
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-lg font-black font-mono text-slate-900">
                            {voltageStats.avg.toFixed(3)} pu
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Nominal target: 1.000 pu
                        </span>
                      </div>

                      <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Compliance Band (NERC)
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span
                            className={`text-lg font-black font-mono ${
                              voltageStats.compliantPercent < 90 ? 'text-amber-600' : 'text-emerald-700'
                            }`}
                          >
                            {voltageStats.compliantPercent}%
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          0.95 pu to 1.05 pu
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                    <div className="bg-[#500b50] text-white px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm font-bold">
                      <span>Substation Bus Voltage Profiles ({filteredBuses.length} Nodes)</span>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Filter bus name or zone..."
                          value={busSearchQuery}
                          onChange={(e) => setBusSearchQuery(e.target.value)}
                          className="bg-white/10 hover:bg-white/15 focus:bg-white focus:text-slate-900 text-white placeholder-white/60 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none transition w-56"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[440px]">
                      <table className="w-full text-left text-sm min-w-[650px]">
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
                          {filteredBuses.map((bus) => {
                            const vVal = bus.v_pu ?? 1.0;
                            const isUnder = vVal < 0.95;
                            const isOver = vVal > 1.05;

                            return (
                              <tr key={bus.id} className="hover:bg-slate-50/80">
                                <td className="py-2.5 px-4 font-mono text-slate-400 font-bold">#{bus.id}</td>
                                <td className="py-2.5 px-4 font-bold text-slate-900">{bus.name}</td>
                                <td className="py-2.5 px-4 text-slate-600 font-medium text-xs">{bus.zone || 'Bulk Grid'}</td>
                                <td className="py-2.5 px-4 font-mono font-bold">
                                  <span className={isUnder ? 'text-rose-600' : isOver ? 'text-amber-600' : 'text-emerald-700'}>
                                    {vVal.toFixed(3)} pu
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 font-mono text-xs text-slate-600">
                                  {(bus.va_deg ?? 0.0) >= 0 ? '+' : ''}
                                  {(bus.va_deg ?? 0.0).toFixed(2)}°
                                </td>
                                <td className="py-2.5 px-4 font-mono text-xs font-semibold">
                                  {(bus.p_mw ?? 0).toFixed(1)}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-700">
                                  {(bus.q_mvar ?? 0) >= 0 ? '+' : ''}
                                  {(bus.q_mvar ?? 0).toFixed(1)}
                                </td>
                                <td className="py-2.5 px-4">
                                  {isUnder ? (
                                    <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                                      Under-voltage
                                    </span>
                                  ) : isOver ? (
                                    <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                                      Over-voltage
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
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

              {deckView === 'lines' && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
                    <span>Transmission Lines &amp; $N-1$ Breaker Deck ({lines.length} Corridors)</span>
                    <span className="font-normal text-xs text-white/80">Operate breaker to simulate immediate $N-1$ redistribution</span>
                  </div>
                  <div className="overflow-x-auto max-h-[440px]">
                    <table className="w-full text-left text-sm min-w-[700px]">
                      <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold sticky top-0">
                        <tr>
                          <th className="py-3 px-4">Line ID</th>
                          <th className="py-3 px-4">Transmission Corridor</th>
                          <th className="py-3 px-4">Interconnection</th>
                          <th className="py-3 px-4">Flow (MW)</th>
                          <th className="py-3 px-4">Thermal Loading</th>
                          <th className="py-3 px-4">Breaker Status</th>
                          <th className="py-3 px-4 text-right">Switching Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {lines.map((l) => {
                          const isTripped = trippedLines.includes(l.id);
                          const loadingPercent = l.loading_percent ?? 0;
                          const isOverload = loadingPercent > 100;
                          const flowMw = l.flow_mw ?? l.p_mw ?? 0;

                          return (
                            <tr key={l.id} className={`hover:bg-slate-50/80 ${isTripped ? 'bg-rose-50/50' : ''}`}>
                              <td className="py-2.5 px-4 font-mono text-slate-400 font-bold">#{l.id}</td>
                              <td className="py-2.5 px-4 font-bold text-slate-900">{l.name}</td>
                              <td className="py-2.5 px-4 font-mono text-slate-600 text-xs">
                                Bus #{l.from_bus} $\to$ #{l.to_bus}
                              </td>
                              <td className="py-2.5 px-4 font-mono font-bold">
                                {isTripped ? '0.0 MW' : `${flowMw.toFixed(1)} MW`}
                              </td>
                              <td className="py-2.5 px-4 font-mono">
                                {isTripped ? (
                                  <span className="text-slate-400 font-semibold">Isolated</span>
                                ) : (
                                  <span className={isOverload ? 'text-rose-600 font-bold' : 'text-slate-800'}>
                                    {loadingPercent.toFixed(1)}%
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4">
                                {isTripped ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                                    Breaker Open (Tripped)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                                    Breaker Closed (In Service)
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <button
                                  onClick={() => toggleLine(l.id)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs ${
                                    isTripped
                                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                      : 'bg-rose-600 text-white hover:bg-rose-700'
                                  }`}
                                >
                                  {isTripped ? 'Reclose Breaker' : 'Trip Breaker ($N-1$)'}
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

          {/* SUB-VIEW 2: DYNAMIC LOAD SHARING */}
          {simSubTab === 'load_sharing' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <Activity className="h-4 w-4 text-[#500b50]" />
                      <span>Decentralized Generator Governor Droop (P–f)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Autonomous frequency pickup without telecommunications using speed governor slopes.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setDroopOverrides({});
                        setTimeout(runLoadSharingCalculation, 60);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                    >
                      Reset 4.0% Droop
                    </button>
                    <button
                      onClick={runLoadSharingCalculation}
                      disabled={loadSharingLoading}
                      className="flex items-center gap-2 rounded-xl bg-[#500b50] px-5 py-2 text-xs font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
                    >
                      {loadSharingLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-amber-300" />}
                      <span>Recalculate Dispatch</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                      Step Demand ($\Delta P$)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="25"
                        min="25"
                        max="2000"
                        value={loadStepMw}
                        onChange={(e) => setLoadStepMw(parseFloat(e.target.value) || 300)}
                        className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm focus:border-[#500b50] focus:outline-none"
                      />
                      <span className="text-xs text-slate-500 font-mono font-bold">MW</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                      System Damping ($D$)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="3.0"
                        value={dampingD}
                        onChange={(e) => setDampingD(parseFloat(e.target.value) || 1.2)}
                        className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm focus:border-[#500b50] focus:outline-none"
                      />
                      <span className="text-xs text-slate-400 font-mono">pu</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                      Grid Stiffness ($\beta$)
                    </label>
                    <span className="text-xl font-mono font-black text-slate-900 block mt-0.5">
                      {loadSharingResult?.system_stiffness_mw_per_hz ?? 0} MW/Hz
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Aggregate Governor Slope</span>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                      Settling Frequency
                    </label>
                    <span
                      className={`text-xl font-mono font-black block mt-0.5 ${
                        (loadSharingResult?.settling_frequency_hz ?? 50.0) < 48.8 ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {(loadSharingResult?.settling_frequency_hz ?? 50.0).toFixed(3)} Hz
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      $\Delta f$: {(loadSharingResult?.frequency_deviation_hz ?? 0.0).toFixed(3)} Hz
                    </span>
                  </div>
                </div>
              </div>

              {loadSharingResult && loadSharingResult.allocations.length > 0 && (
                <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>Autonomous Frequency Pickup Stack</span>
                    <span className="font-mono font-bold">100% of +{loadStepMw} MW Shared</span>
                  </div>

                  <div className="h-7 w-full rounded-xl overflow-hidden flex bg-slate-100 border border-slate-200 p-0.5">
                    {loadSharingResult.allocations.map((alloc, idx) => {
                      const widthPct = alloc.participation_factor_percent;
                      const color = PALETTE[idx % PALETTE.length];
                      return (
                        <div
                          key={alloc.id}
                          style={{ width: `${Math.max(2, widthPct)}%`, backgroundColor: color }}
                          className="h-full first:rounded-l-lg last:rounded-r-lg transition-all duration-300 relative group"
                          title={`${alloc.name}: +${alloc.allocated_delta_mw} MW (${widthPct}%)`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-3 pt-1">
                    {loadSharingResult.allocations.map((alloc, idx) => (
                      <div key={alloc.id} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PALETTE[idx % PALETTE.length] }} />
                        <span className="font-bold text-slate-800">{alloc.name}</span>
                        <span className="font-mono text-slate-400">({alloc.participation_factor_percent}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
                  <span>Discovered Synchronous Generation ({loadSharingResult?.allocations.length || 0} Units in Active Model)</span>
                  <span className="font-normal text-xs text-white/80">
                    Tune governor droop ($R$) to alter participation factors
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[440px]">
                  <table className="w-full text-left text-xs min-w-[750px]">
                    <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
                      <tr>
                        <th className="py-3 px-4">Generating Station</th>
                        <th className="py-3 px-4">Bus Node</th>
                        <th className="py-3 px-4">Rated Capacity</th>
                        <th className="py-3 px-4">Droop ($R$)</th>
                        <th className="py-3 px-4">Participation</th>
                        <th className="py-3 px-4">Base Output</th>
                        <th className="py-3 px-4">Assigned Share</th>
                        <th className="py-3 px-4">New Output</th>
                        <th className="py-3 px-4 text-right">Headroom Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                      {!loadSharingResult || loadSharingResult.allocations.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-slate-400 font-sans">
                            No active synchronous generator elements detected in the active model.
                          </td>
                        </tr>
                      ) : (
                        loadSharingResult.allocations.map((alloc, idx) => {
                          const currentDroop = droopOverrides[alloc.id] ?? alloc.droop_percent;
                          const hasDeficit = alloc.exceeded_rating;

                          return (
                            <tr key={alloc.id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-4 font-sans font-bold text-slate-900 flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PALETTE[idx % PALETTE.length] }} />
                                <span>{alloc.name}</span>
                              </td>
                              <td className="py-3 px-4 text-slate-500">Bus #{alloc.bus_id}</td>
                              <td className="py-3 px-4 font-bold">{alloc.rated_mw} MW</td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="1.5"
                                    max="10.0"
                                    value={currentDroop}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 4.0;
                                      setDroopOverrides((prev) => ({ ...prev, [alloc.id]: val }));
                                    }}
                                    className="w-16 border border-slate-300 rounded px-2 py-0.5 bg-white font-bold text-slate-900 focus:border-[#500b50] focus:outline-none"
                                  />
                                  <span className="text-slate-400 font-normal">%</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-bold text-[#500b50]">
                                {alloc.participation_factor_percent}%
                              </td>
                              <td className="py-3 px-4 text-slate-600">{alloc.base_p_mw} MW</td>
                              <td className="py-3 px-4 font-bold text-emerald-700">
                                +{alloc.allocated_delta_mw} MW
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-900">
                                {alloc.new_p_mw} MW
                              </td>
                              <td className="py-3 px-4 text-right">
                                {hasDeficit ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                    Rating Exceeded
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                    +{alloc.remaining_headroom_mw} MW Margin
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {loadSharingResult && loadSharingResult.parallel_corridors.length > 0 && (
                <div className="space-y-4 pt-2">
                  <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 text-xs text-blue-900 flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Natural Parallel Circuit Impedance Division ($P_1 / P_2 = X_2 / X_1$)</p>
                      <p className="mt-0.5 text-blue-800">
                        In AC networks, parallel lines divide power inversely proportional to series reactance.
                      </p>
                    </div>
                  </div>

                  {loadSharingResult.parallel_corridors.map((corr, idx) => (
                    <div key={idx} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                      <div className="bg-slate-800 text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-emerald-400" />
                          <span>{corr.corridor}</span>
                        </div>
                        <span className="font-mono text-xs font-normal text-slate-300">
                          {corr.circuits_count} Parallel Circuits Detected
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[650px]">
                          <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px]">
                            <tr>
                              <th className="py-2.5 px-4">Line ID</th>
                              <th className="py-2.5 px-4">Circuit Identifier</th>
                              <th className="py-2.5 px-4">Series Reactance ($X$)</th>
                              <th className="py-2.5 px-4">Natural Power Share</th>
                              <th className="py-2.5 px-4">Capacity Utilization</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                            {corr.circuits.map((circ) => (
                              <tr key={circ.line_id} className="hover:bg-slate-50/80">
                                <td className="py-3 px-4 font-bold text-slate-500">#{circ.line_id}</td>
                                <td className="py-3 px-4 font-sans font-bold text-slate-900">{circ.name}</td>
                                <td className="py-3 px-4">{circ.reactance_ohm} Ω</td>
                                <td className="py-3 px-4 font-bold text-[#500b50]">
                                  {circ.theoretical_share_percent}%
                                </td>
                                <td className="py-3 px-4">
                                  <div className="w-36 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                    <div
                                      className="bg-emerald-600 h-full rounded-full"
                                      style={{ width: `${circ.theoretical_share_percent}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUB-VIEW 3: CASCADING FAILURE */}
          {simSubTab === 'cascade' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Initiating Contingency
                    </label>
                    <select
                      value={initialTripLine}
                      onChange={(e) => setInitialTripLine(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                    >
                      {lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          #{l.id}: {l.name} ({(l.loading_percent ?? 0).toFixed(0)}% load)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Overcurrent Trip Threshold
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="90"
                        max="150"
                        step="5"
                        value={cascadeThreshold}
                        onChange={(e) => setCascadeThreshold(Number(e.target.value))}
                        className="w-full text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5"
                      />
                      <span className="font-mono font-bold text-rose-700 text-sm">%</span>
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
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-700 text-white py-2.5 text-sm font-bold hover:bg-rose-800 transition shadow-xs disabled:opacity-50"
                    >
                      {cascadeLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                      <span>Run Cascading Sequence</span>
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
                        <h4 className="font-bold text-slate-900">{(cascadeResult.status || '').replace(/_/g, ' ')}</h4>
                        <p className="text-xs text-slate-500">
                          {cascadeResult.total_steps} stage(s) calculated • {(cascadeResult.all_tripped_lines || []).length} transmission corridors tripped.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => onApplyCascadeTrips(cascadeResult.all_tripped_lines || [])}
                      className="px-4 py-2 rounded-lg bg-[#500b50] text-white font-bold text-xs shadow-xs"
                    >
                      View on Single-Line Diagram
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUB-VIEW 4: REGIONAL PLANNING SANDTABLE */}
          {simSubTab === 'planning' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-sm border-b pb-2 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-[#500b50]" />
                    <span>1. Propose Substation</span>
                  </h4>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Substation Name</label>
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
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Voltage</label>
                      <select
                        value={newBusKv}
                        onChange={(e) => setNewBusKv(Number(e.target.value))}
                        className="w-full border rounded-lg px-2.5 py-2 text-sm bg-white"
                      >
                        <option value={330}>330 kV Bulk</option>
                        <option value={132}>132 kV Sub-T</option>
                        <option value={130}>130 kV Regional</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Zone</label>
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
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Active Demand (MW)</label>
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
                    + Add Substation Node &amp; Re-Solve
                  </button>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-sm border-b pb-2 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-[#500b50]" />
                    <span>2. Connect Line Corridor</span>
                  </h4>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Corridor Identifier</label>
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
                      <label className="block text-xs font-semibold text-slate-600 mb-1">From Bus</label>
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
                      <label className="block text-xs font-semibold text-slate-600 mb-1">To Bus</label>
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
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Length (km)</label>
                      <input
                        type="number"
                        min="1"
                        value={newLineLength}
                        onChange={(e) => setNewLineLength(Number(e.target.value))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Conductor</label>
                      <select
                        value={newLineConductor}
                        onChange={(e) => setNewLineConductor(e.target.value)}
                        className="w-full border rounded-lg px-2.5 py-2 text-sm bg-white"
                      >
                        <option value="Bison 330kV">Bison 330kV</option>
                        <option value="Bear 330kV">Bear 330kV</option>
                        <option value="Panther 132kV">Panther 132kV / 130kV</option>
                        <option value="Wolf 132kV">Wolf 132kV / 130kV</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleAddLine}
                    className="w-full py-2.5 rounded-lg bg-[#500b50] text-white font-bold text-xs hover:bg-[#680f68] transition"
                  >
                    + Connect Line &amp; Re-Solve
                  </button>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-sm border-b pb-2 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-[#500b50]" />
                    <span>3. Propose Power Plant</span>
                  </h4>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Plant Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Kano Solar IPP"
                      value={newGenName}
                      onChange={(e) => setNewGenName(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Interconnection Bus</label>
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
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Output (MW)</label>
                      <input
                        type="number"
                        min="1"
                        value={newGenP}
                        onChange={(e) => setNewGenP(Number(e.target.value))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Target (pu)</label>
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
                    + Incorporate Plant &amp; Re-Solve
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