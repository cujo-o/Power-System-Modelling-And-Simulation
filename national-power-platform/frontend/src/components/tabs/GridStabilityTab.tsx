'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  BusData,
  LineData,
  GridModelMeta,
  NewBusElement,
  NewLineElement,
  NewGenElement,
  CascadeResult,
  GeneratorOverride,
  LoadOverride,
  BusOverride,
  LineOverride,
} from '@/types/grid';
import { ExtendedPowerFlowVariables } from '@/context/GridContext';
import {
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Plus,
  GitBranch,
  Sliders,
  ShieldAlert,
  ArrowRight,
  Check,
  Power,
  Activity,
  Trash2,
  UploadCloud,
  ChevronLeft,
  Info,
  MoreHorizontal,
  X,
  Droplets,
  Flame,
  Sun,
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

type DeckCategory = 'all' | 'buses' | 'lines' | 'generators' | 'loads' | 'disruptions';

type EditingTarget =
  | { kind: 'bus'; bus: BusData }
  | { kind: 'line'; line: LineData }
  | { kind: 'generator'; bus: BusData }
  | { kind: 'load'; bus: BusData }
  | null;

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
    if (typeof window !== 'undefined') {
      localStorage.setItem('ml4ps_view_mode', mode);
    }
  };

  const [workspaceTab, setWorkspaceTabState] = useState<
    'deck' | 'load_sharing' | 'cascade' | 'planning'
  >(() => {
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

  const [deckCategory, setDeckCategory] = useState<DeckCategory>('all');
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null);

  // Search & Filter
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<'ALL' | 'Static' | 'Dynamic'>('ALL');
  const [voltageFilter, setVoltageFilter] = useState<'ALL' | '330kV' | '132kV' | '130kV'>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [elementSearchQuery, setElementSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_SERVICE' | 'ISOLATED' | 'VIOLATION'>('ALL');

  // Cascade State
  const [cascadeThreshold, setCascadeThreshold] = useState<number>(100);
  const [initialTripLine, setInitialTripLine] = useState<number>(0);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);
  const [cascadeError, setCascadeError] = useState<string | null>(null);

  // Load Sharing State
  const [loadStepMw, setLoadStepMw] = useState<number>(300);
  const [dampingD, setDampingD] = useState<number>(1.2);
  const [loadSharingLoading, setLoadSharingLoading] = useState(false);
  const [loadSharingResult, setLoadSharingResult] = useState<any>(null);
  const [loadSharingError, setLoadSharingError] = useState<string | null>(null);

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

  // Modal Form Local States for `⋯` Property Editor
  const [editName, setEditName] = useState('');
  const [editKv, setEditKv] = useState(330);
  const [editZone, setEditZone] = useState('');
  const [editVmSetpoint, setEditVmSetpoint] = useState(1.02);
  const [editShuntMvar, setEditShuntMvar] = useState(0);

  const [editLineLength, setEditLineLength] = useState(50);
  const [editLineR, setEditLineR] = useState(0.035);
  const [editLineX, setEditLineX] = useState(0.32);
  const [editLineRatingMw, setEditLineRatingMw] = useState(600);

  const [editPrimeMover, setEditPrimeMover] = useState<
    'Hydro' | 'Thermal (Gas)' | 'Solar / Distributed' | 'Synchronous'
  >('Hydro');
  const [editRatedMw, setEditRatedMw] = useState(400);
  const [editActiveMw, setEditActiveMw] = useState(250);
  const [editWaterIntake, setEditWaterIntake] = useState(320);
  const [editNetHead, setEditNetHead] = useState(95);
  const [editTurbineEff, setEditTurbineEff] = useState(90);
  const [editGasPressure, setEditGasPressure] = useState(42);
  const [editAmbientTemp, setEditAmbientTemp] = useState(32);
  const [editIrradiance, setEditIrradiance] = useState(850);
  const [editCloudCover, setEditCloudCover] = useState(15);
  const [editInertiaH, setEditInertiaH] = useState(4.5);
  const [editDroopPct, setEditDroopPct] = useState(4.0);

  const [editLoadPMw, setEditLoadPMw] = useState(60);
  const [editLoadQMvar, setEditLoadQMvar] = useState(25);
  const [editCritInfra, setEditCritInfra] = useState<
    | 'Standard Bulk Load'
    | 'Water Treatment & Pumping'
    | 'Regional Hospital Cluster'
    | 'Telecom & SCADA Hub'
    | 'Industrial Corridor'
  >('Standard Bulk Load');
  const [editUflsProtected, setEditUflsProtected] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleLiveParamChange = (field: keyof ExtendedPowerFlowVariables, value: any) => {
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    setPfVariables((prev) => ({ ...prev, [field]: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSimulation();
    }, 350);
  };

  const openPropertyEditor = (target: EditingTarget) => {
    if (!target) return;
    setEditingTarget(target);

    if (target.kind === 'bus') {
      const b = target.bus;
      const ovr = pfVariables.busOverrides?.[b.id];
      setEditName(ovr?.name ?? b.name);
      setEditKv(ovr?.vn_kv ?? b.vn_kv ?? 330);
      setEditZone(ovr?.zone ?? b.zone ?? 'Grid Zone');
      setEditVmSetpoint(ovr?.v_pu_setpoint ?? b.v_pu ?? 1.0);
      setEditShuntMvar(ovr?.shunt_mvar ?? 0);
    } else if (target.kind === 'line') {
      const l = target.line;
      const ovr = pfVariables.lineOverrides?.[l.id];
      setEditName(ovr?.name ?? l.name);
      setEditLineLength(ovr?.length_km ?? l.length_km ?? 65);
      setEditLineR(ovr?.r_ohm_per_km ?? l.r_ohm_per_km ?? 0.032);
      setEditLineX(ovr?.x_ohm_per_km ?? l.x_ohm_per_km ?? 0.31);
      setEditLineRatingMw(ovr?.thermal_rating_mw ?? 550);
    } else if (target.kind === 'generator') {
      const b = target.bus;
      const ovr = pfVariables.generatorOverrides?.[b.id];
      const isHydroDefault = /kainji|jebba|shiroro|zungeru|hydro/i.test(b.name || '');
      const baseP = Math.max(25, Math.abs(b.p_mw || 150));
      setEditName(ovr?.name ?? b.name);
      setEditPrimeMover(
        ovr?.primeMover ?? (isHydroDefault ? 'Hydro' : 'Thermal (Gas)')
      );
      setEditRatedMw(ovr?.ratedMw ?? Math.round(baseP * 1.35));
      setEditActiveMw(ovr?.activeMw ?? Math.round(baseP));
      setEditVmSetpoint(ovr?.vmPu ?? b.v_pu ?? 1.03);
      setEditNetHead(ovr?.netHeadM ?? 92);
      setEditTurbineEff(ovr?.turbineEfficiency ?? 90);
      const defaultQ = Math.round((baseP * 1000) / (0.9 * 9.81 * 92));
      setEditWaterIntake(ovr?.waterIntakeM3s ?? defaultQ);
      setEditGasPressure(ovr?.gasPressureBar ?? 45);
      setEditAmbientTemp(ovr?.ambientTempC ?? 31);
      setEditIrradiance(ovr?.irradianceWm2 ?? 900);
      setEditCloudCover(ovr?.cloudCoverPct ?? 10);
      setEditInertiaH(ovr?.inertiaH ?? (isHydroDefault ? 5.2 : 4.0));
      setEditDroopPct(ovr?.droopPercent ?? 4.0);
    } else if (target.kind === 'load') {
      const b = target.bus;
      const ovr = pfVariables.loadOverrides?.[b.id];
      setEditName(ovr?.name ?? b.name);
      setEditLoadPMw(ovr?.pMw ?? Math.max(5, Math.abs(b.p_mw || 40)));
      setEditLoadQMvar(ovr?.qMvar ?? Math.round(b.q_mvar || 18));
      setEditCritInfra(ovr?.criticalInfrastructure ?? 'Standard Bulk Load');
      setEditUflsProtected(ovr?.uflsProtected ?? false);
    }
  };

  const computedModalHydroMw = useMemo(() => {
    const eff = editTurbineEff / 100;
    return Number(((eff * 9.81 * editNetHead * editWaterIntake) / 1000).toFixed(1));
  }, [editTurbineEff, editNetHead, editWaterIntake]);

  const handleSavePropertyEdit = () => {
    if (!editingTarget) return;

    if (editingTarget.kind === 'bus') {
      const bId = editingTarget.bus.id;
      const nextOvr: BusOverride = {
        name: editName.trim(),
        vn_kv: editKv,
        zone: editZone.trim(),
        v_pu_setpoint: editVmSetpoint,
        shunt_mvar: editShuntMvar,
      };
      setPfVariables((prev) => ({
        ...prev,
        busOverrides: { ...(prev.busOverrides || {}), [bId]: nextOvr },
      }));
    } else if (editingTarget.kind === 'line') {
      const lId = editingTarget.line.id;
      const nextOvr: LineOverride = {
        name: editName.trim(),
        length_km: editLineLength,
        r_ohm_per_km: editLineR,
        x_ohm_per_km: editLineX,
        thermal_rating_mw: editLineRatingMw,
      };
      setPfVariables((prev) => ({
        ...prev,
        lineOverrides: { ...(prev.lineOverrides || {}), [lId]: nextOvr },
      }));
    } else if (editingTarget.kind === 'generator') {
      const bId = editingTarget.bus.id;
      const nextOvr: GeneratorOverride = {
        busId: bId,
        name: editName.trim(),
        primeMover: editPrimeMover,
        ratedMw: editRatedMw,
        activeMw:
          editPrimeMover === 'Hydro' ? computedModalHydroMw : editActiveMw,
        vmPu: editVmSetpoint,
        waterIntakeM3s: editWaterIntake,
        netHeadM: editNetHead,
        turbineEfficiency: editTurbineEff,
        gasPressureBar: editGasPressure,
        ambientTempC: editAmbientTemp,
        irradianceWm2: editIrradiance,
        cloudCoverPct: editCloudCover,
        inertiaH: editInertiaH,
        droopPercent: editDroopPct,
        inService: true,
      };
      setPfVariables((prev) => ({
        ...prev,
        generatorOverrides: { ...(prev.generatorOverrides || {}), [bId]: nextOvr },
      }));
    } else if (editingTarget.kind === 'load') {
      const bId = editingTarget.bus.id;
      const nextOvr: LoadOverride = {
        busId: bId,
        name: editName.trim(),
        pMw: editLoadPMw,
        qMvar: editLoadQMvar,
        criticalInfrastructure: editCritInfra,
        uflsProtected: editUflsProtected,
        inService: true,
      };
      setPfVariables((prev) => ({
        ...prev,
        loadOverrides: { ...(prev.loadOverrides || {}), [bId]: nextOvr },
      }));
    }

    setEditingTarget(null);
    setTimeout(() => runSimulation(), 80);
  };

  useEffect(() => {
    if (lines.length > 0 && !lines.some((l) => l.id === initialTripLine)) {
      setInitialTripLine(lines[0].id);
    }
  }, [lines, initialTripLine]);

  useEffect(() => {
    if (buses.length > 0) {
      if (!buses.some((b) => b.id === connectToExistingBus)) setConnectToExistingBus(buses[0].id);
      if (!buses.some((b) => b.id === newLineFrom)) setNewLineFrom(buses[0].id);
      if (!buses.some((b) => b.id === newLineTo)) setNewLineTo(buses[1]?.id || buses[0].id);
      if (!buses.some((b) => b.id === newGenBus)) setNewGenBus(buses[0].id);
      if (!buses.some((b) => b.id === selectedDecommissionBus))
        setSelectedDecommissionBus(buses[0].id);
    }
  }, [buses, connectToExistingBus, newLineFrom, newLineTo, newGenBus, selectedDecommissionBus]);

  const runLoadSharingCalculation = async () => {
    setLoadSharingLoading(true);
    setLoadSharingError(null);
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
      } else {
        setLoadSharingError(`Load-sharing solve returned HTTP ${res.status}.`);
      }
    } catch (err: any) {
      setLoadSharingError(err?.message || 'Could not reach the solver backend.');
    } finally {
      setLoadSharingLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceTab === 'load_sharing' && buses.length > 0) {
      runLoadSharingCalculation();
    }
  }, [workspaceTab, modelName, buses.length]);

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchesDomain =
        domainFilter === 'ALL' ||
        (domainFilter === 'Static' &&
          ((m.domain || '').includes('Static') || (m.domain || '').includes('Steady'))) ||
        (domainFilter === 'Dynamic' && (m.domain || '').includes('Dynamic'));

      const level = (m.voltage_level || '').toLowerCase();
      const matchesVoltage =
        voltageFilter === 'ALL' ||
        (voltageFilter === '330kV' && level.includes('330')) ||
        (voltageFilter === '132kV' && (level.includes('132') || level.includes('130'))) ||
        (voltageFilter === '130kV' && (level.includes('130') || level.includes('132')));

      const matchesPlatform =
        platformFilter === 'ALL' ||
        (m.platform || '').toLowerCase().includes(platformFilter.toLowerCase());

      const matchesSearch =
        (m.name || '').toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
        (m.voltage_level || '').toLowerCase().includes(modelSearchQuery.toLowerCase());

      return matchesDomain && matchesVoltage && matchesPlatform && matchesSearch;
    });
  }, [models, domainFilter, voltageFilter, platformFilter, modelSearchQuery]);

  const generatorBuses = useMemo(() => {
    const gList = buses.filter((b) => {
      const n = (b.name || '').toLowerCase();
      return (
        (b.p_mw ?? 0) < -1 ||
        n.includes('gs') ||
        n.includes('ps') ||
        n.includes('slack') ||
        n.includes('ipp') ||
        pfVariables.generatorOverrides?.[b.id] !== undefined
      );
    });
    return gList.length > 0 ? gList : buses.slice(0, Math.min(5, buses.length));
  }, [buses, pfVariables.generatorOverrides]);

  const loadBuses = useMemo(() => {
    const lList = buses.filter(
      (b) => (b.p_mw ?? 0) >= 0 || pfVariables.loadOverrides?.[b.id] !== undefined
    );
    return lList.length > 0 ? lList : buses;
  }, [buses, pfVariables.loadOverrides]);

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
    setTimeout(() => runSimulation(), 60);
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
    setTimeout(() => runSimulation(), 60);
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
    setTimeout(() => runSimulation(), 60);
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

  // Applies all tripped lines from the cascade result and navigates immediately to /sld
  const handleViewCascadeOnSld = () => {
    if (!cascadeResult) return;
    const collected = new Set<number>();
    if (Array.isArray(cascadeResult.all_tripped_lines)) {
      cascadeResult.all_tripped_lines.forEach((id) => collected.add(Number(id)));
    }
    if (Array.isArray(cascadeResult.timeline)) {
      cascadeResult.timeline.forEach((step) => {
        if (Array.isArray(step.tripped_in_this_step)) {
          step.tripped_in_this_step.forEach((id) => collected.add(Number(id)));
        }
      });
    }
    if (collected.size === 0 && initialTripLine !== undefined) {
      collected.add(Number(initialTripLine));
    }

    const tripArray = Array.from(collected).filter((n) => Number.isFinite(n));
    onApplyCascadeTrips(tripArray);
    onNavigateTab('Single-Line Diagram');
    router.push('/sld');
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

  // =========================================================================
  // VIEW 1: INITIAL MODEL SELECTION SCREEN
  // =========================================================================
  if (viewMode === 'select_model') {
    return (
      <div className="space-y-4 max-w-7xl mx-auto py-1 text-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Grid Stability &amp; Dynamic Models
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a static or dynamic transmission network to launch the operational studio.
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
                <option value="ALL">All Domains (Static &amp; Dynamic)</option>
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
              const isDynamicModel =
                m.name.toLowerCase().includes('dynamic') ||
                (m.domain || '').toLowerCase().includes('dynamic');

              return (
                <div
                  key={m.id}
                  className={`p-4 rounded-xl border bg-white shadow-2xs flex flex-col justify-between transition ${
                    isCurrent
                      ? 'border-emerald-600 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300'
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
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isDynamicModel
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-blue-50 text-blue-800'
                          }`}
                        >
                          {isDynamicModel ? 'Dynamic & Static Ready' : 'Static + Dynamic Sandbox'}
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
                        {m.buses} Substations • {m.branches} Corridors •{' '}
                        {(m.total_installed_mw || 0).toLocaleString()} MW
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectModel(m.id)}
                    disabled={activatingId !== null}
                    className={`mt-4 w-full py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      isCurrent
                        ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                        : 'bg-[#500b50] text-white hover:bg-[#680f68]'
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
  const currentScenario = pfVariables.wideAreaScenario || {
    activeEvent: 'NONE',
    severityPercent: 30,
    autoRecoveryEnabled: true,
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto py-1 text-slate-800">
      {/* Workspace Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('select_model')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Switch Model</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-slate-900 tracking-tight">
                {currentDisplayName}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">
                {totalSubstationsCount} Substations • {totalBranchesCount} Branches
              </span>
            </div>
          </div>
        </div>

        {/* Subtabs Navigation */}
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
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition relative ${
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

      {/* Diagnostics Banner */}
      {divergedNotice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
            <span>{divergedNotice}</span>
          </div>
          <button
            onClick={() => (activeModel ? onActivateModel(activeModel.id) : runSimulation())}
            disabled={loading}
            className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold text-xs shrink-0 flex items-center gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Solving…' : 'Solve'}</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* WORKSPACE SUBTAB 1: OPERATIONAL DECK                                      */}
      {/* ========================================================================= */}
      {workspaceTab === 'deck' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  Demand Scale
                  <TooltipBadge content="System-wide load scaling factor proportioned live across all consumption nodes." />
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
                  <TooltipBadge content="Operating active-to-apparent power ratio." />
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
                  <TooltipBadge content="Terminal voltage setpoint magnitude at the reference swing bus in per-unit." />
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
                  <TooltipBadge content="Grid reactive support (+Capacitor / -Reactor)." />
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
                  <TooltipBadge content="Corridor continuous current capacity derating factor." />
                </span>
                <span className="font-mono text-[#500b50] font-bold">
                  {(pfVariables.thermalDeratingFactor || 1.0).toFixed(2)}x
                </span>
              </div>
              <input
                type="number"
                step="0.05"
                min="0.5"
                max="1.2"
                value={pfVariables.thermalDeratingFactor || 1.0}
                onChange={(e) =>
                  handleLiveParamChange('thermalDeratingFactor', parseFloat(e.target.value))
                }
                className="w-full font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs focus:border-[#500b50] focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 font-mono block">Ambient Temperature</span>
            </div>
          </div>

          {/* Element Category Switches, Status Filter & Search Bar */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap rounded-lg border border-slate-200 p-0.5 bg-white font-bold gap-0.5">
                <button
                  onClick={() => setDeckCategory('all')}
                  className={`px-2.5 py-1.5 rounded transition ${
                    deckCategory === 'all'
                      ? 'bg-[#500b50] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Elements ({buses.length + lines.length})
                </button>
                <button
                  onClick={() => setDeckCategory('buses')}
                  className={`px-2.5 py-1.5 rounded transition ${
                    deckCategory === 'buses'
                      ? 'bg-[#500b50] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Substations / Buses ({buses.length})
                </button>
                <button
                  onClick={() => setDeckCategory('lines')}
                  className={`px-2.5 py-1.5 rounded transition ${
                    deckCategory === 'lines'
                      ? 'bg-[#500b50] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lines &amp; Breakers ({lines.length})
                </button>
                <button
                  onClick={() => setDeckCategory('generators')}
                  className={`px-2.5 py-1.5 rounded transition ${
                    deckCategory === 'generators'
                      ? 'bg-[#500b50] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Generators &amp; Water/Gas ({generatorBuses.length})
                </button>
                <button
                  onClick={() => setDeckCategory('loads')}
                  className={`px-2.5 py-1.5 rounded transition ${
                    deckCategory === 'loads'
                      ? 'bg-[#500b50] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Loads &amp; Critical Infra ({loadBuses.length})
                </button>
                <button
                  onClick={() => setDeckCategory('disruptions')}
                  className={`px-2.5 py-1.5 rounded transition ${
                    deckCategory === 'disruptions'
                      ? 'bg-rose-700 text-white'
                      : 'text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  Wide-Area Disruptions
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e: any) => setStatusFilter(e.target.value)}
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

            {/* WIDE-AREA DISRUPTIVE EVENTS PANEL */}
            {deckCategory === 'disruptions' && (
              <div className="p-5 space-y-4 bg-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Wide-Area Disruptive Events &amp; Critical Infrastructure Interdependencies
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Simulate regional natural events, gas pipeline pressure drops, coordinated cyber/physical attacks, and automated recovery measures.
                    </p>
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
                    <span>Automated Emergency Var &amp; Priority Load Recovery</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                  {[
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
                      desc: 'Interdependency: ELPS/AKK gas supply drop derates thermal gas generators.',
                    },
                    {
                      id: 'CYBER_SCADA_ATTACK',
                      title: 'Coordinated Cyber / Physical Attack',
                      desc: 'Simultaneous false-data voltage setpoint depression & substation stress.',
                    },
                    {
                      id: 'DISTRIBUTED_CLOUD_TRANSIENT',
                      title: 'Intermittent DG Cloud Sweep',
                      desc: 'Rapid irradiance drop across distributed solar IPPs in Northern corridors.',
                    },
                  ].map((scen) => {
                    const isSelected = currentScenario.activeEvent === scen.id;
                    return (
                      <button
                        key={scen.id}
                        onClick={() =>
                          handleLiveParamChange('wideAreaScenario', {
                            ...currentScenario,
                            activeEvent: scen.id as any,
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
                          {isSelected ? 'Active Scenario' : 'Activate'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SUBSTATIONS / BUSES TABLE */}
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
                      <th className="py-2 px-3">Switch (In-Service)</th>
                      <th className="py-2 px-3 text-right">Edit (⋯)</th>
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
                              {bus.zone || 'Grid'} • {bus.vn_kv || 330} kV
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
                                onClick={() =>
                                  toggleBusService && toggleBusService(bus.id)
                                }
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                                  isDisabled
                                    ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                }`}
                              >
                                {isDisabled ? 'Isolated (Off)' : 'In Service (On)'}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-right font-sans">
                              <button
                                onClick={() => openPropertyEditor({ kind: 'bus', bus })}
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

            {/* GENERATING UNITS TABLE */}
            {(deckCategory === 'all' || deckCategory === 'generators') && (
              <div className="overflow-x-auto max-h-[340px] border-b border-slate-200">
                <div className="px-3 py-2 bg-purple-50/70 text-[11px] font-bold uppercase tracking-wider text-[#500b50]">
                  Generating Units — Static &amp; Dynamic Prime-Mover Controls (Water Intake / Gas / Inertia)
                </div>
                <table className="w-full text-left text-xs min-w-[740px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Bus</th>
                      <th className="py-2 px-3">Generating Station</th>
                      <th className="py-2 px-3">Prime Mover &amp; Intake</th>
                      <th className="py-2 px-3">Output (MW)</th>
                      <th className="py-2 px-3">Dynamics (H / R)</th>
                      <th className="py-2 px-3">Switch</th>
                      <th className="py-2 px-3 text-right">Edit (⋯)</th>
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
                                    Hydro • Water Intake: {ovr?.waterIntakeM3s ?? 280} m³/s (Head:{' '}
                                    {ovr?.netHeadM ?? 92}m)
                                  </span>
                                </span>
                              ) : ovr?.primeMover === 'Solar / Distributed' ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                                  <Sun className="h-3.5 w-3.5" />
                                  <span>
                                    Distributed Solar • {ovr?.irradianceWm2 ?? 900} W/m²
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-orange-700 font-semibold">
                                  <Flame className="h-3.5 w-3.5" />
                                  <span>
                                    Thermal Gas • {ovr?.gasPressureBar ?? 45} bar
                                  </span>
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
                                onClick={() =>
                                  openPropertyEditor({ kind: 'generator', bus })
                                }
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition inline-flex items-center justify-center"
                                title="Edit Generator Water Intake, Gas Pressure, Inertia & Output"
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

            {/* TRANSMISSION LINES TABLE */}
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
                      <th className="py-2 px-3">Breaker Switch</th>
                      <th className="py-2 px-3 text-right">Edit (⋯)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {lines
                      .filter((l) => {
                        const isTripped = trippedLines.includes(l.id);
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
                        const isTripped = trippedLines.includes(l.id);
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
                                {isTripped ? 'Breaker Open (Reclose)' : 'Closed (Trip N-1)'}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-right font-sans">
                              <button
                                onClick={() => openPropertyEditor({ kind: 'line', line: l })}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition inline-flex items-center justify-center"
                                title="Edit Line Impedance, Length & Thermal Limit"
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

            {/* LOADS & CRITICAL INFRASTRUCTURE TABLE */}
            {(deckCategory === 'all' || deckCategory === 'loads') && (
              <div className="overflow-x-auto max-h-[340px]">
                <div className="px-3 py-2 bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Loads &amp; Critical Infrastructure Interdependencies ({loadBuses.length})
                </div>
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Bus</th>
                      <th className="py-2 px-3">Load Center</th>
                      <th className="py-2 px-3">Infrastructure Sector</th>
                      <th className="py-2 px-3">Demand P (MW)</th>
                      <th className="py-2 px-3">Reactive Q (MVAR)</th>
                      <th className="py-2 px-3">Feeder Switch</th>
                      <th className="py-2 px-3 text-right">Edit (⋯)</th>
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
                            <td className="py-2 px-3 font-bold text-slate-900">
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
                                onClick={() => openPropertyEditor({ kind: 'load', bus })}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition inline-flex items-center justify-center"
                                title="Edit Load Demand & Critical Infrastructure Priority"
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

      {/* ========================================================================= */}
      {/* `⋯` THREE-DOTS PROPERTY EDITOR MODAL                                      */}
      {/* ========================================================================= */}
      {editingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-[#500b50] block">
                  Static &amp; Dynamic Property Editor
                </span>
                <h3 className="font-black text-sm text-slate-900">
                  {editingTarget.kind === 'bus' && `Edit Substation #${editingTarget.bus.id}`}
                  {editingTarget.kind === 'line' && `Edit Transmission Line #${editingTarget.line.id}`}
                  {editingTarget.kind === 'generator' &&
                    `Edit Generating Unit @ Bus #${editingTarget.bus.id}`}
                  {editingTarget.kind === 'load' &&
                    `Edit Load & Infrastructure @ Bus #${editingTarget.bus.id}`}
                </h3>
              </div>
              <button
                onClick={() => setEditingTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {editingTarget.kind === 'bus' && (
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Substation Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Nominal Voltage (kV)
                      </label>
                      <input
                        type="number"
                        value={editKv}
                        onChange={(e) => setEditKv(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Grid Zone</label>
                      <input
                        type="text"
                        value={editZone}
                        onChange={(e) => setEditZone(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Voltage Setpoint (p.u.)
                      </label>
                      <input
                        type="number"
                        step="0.005"
                        min="0.85"
                        max="1.15"
                        value={editVmSetpoint}
                        onChange={(e) => setEditVmSetpoint(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Local Shunt Bank (MVAR)
                      </label>
                      <input
                        type="number"
                        step="10"
                        value={editShuntMvar}
                        onChange={(e) => setEditShuntMvar(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingTarget.kind === 'line' && (
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Corridor Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Line Length (km)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={editLineLength}
                        onChange={(e) => setEditLineLength(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Thermal Limit Rating (MW)
                      </label>
                      <input
                        type="number"
                        min="20"
                        value={editLineRatingMw}
                        onChange={(e) => setEditLineRatingMw(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Series Resistance R (Ω/km)
                      </label>
                      <input
                        type="number"
                        step="0.005"
                        value={editLineR}
                        onChange={(e) => setEditLineR(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Series Reactance X (Ω/km)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editLineX}
                        onChange={(e) => setEditLineX(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingTarget.kind === 'generator' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Station Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Prime Mover Type
                      </label>
                      <select
                        value={editPrimeMover}
                        onChange={(e: any) => setEditPrimeMover(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-bold"
                      >
                        <option value="Hydro">Hydro Turbine (Water Intake)</option>
                        <option value="Thermal (Gas)">Thermal Gas Turbine</option>
                        <option value="Solar / Distributed">Distributed Solar / Renewable</option>
                        <option value="Synchronous">Standard Synchronous Gen</option>
                      </select>
                    </div>
                  </div>

                  {editPrimeMover === 'Hydro' && (
                    <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-950 flex items-center gap-1.5">
                          <Droplets className="h-4 w-4 text-blue-600" />
                          <span>Hydraulic Turbine Intake &amp; Reservoir Head</span>
                        </span>
                        <span className="font-mono font-black text-xs text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                          P = {computedModalHydroMw} MW
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-blue-900 mb-1">
                            Water Intake (m³/s)
                          </label>
                          <input
                            type="number"
                            step="10"
                            min="0"
                            max="2000"
                            value={editWaterIntake}
                            onChange={(e) => setEditWaterIntake(Number(e.target.value))}
                            className="w-full border border-blue-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-blue-900 mb-1">
                            Net Head H (m)
                          </label>
                          <input
                            type="number"
                            step="2"
                            min="10"
                            max="300"
                            value={editNetHead}
                            onChange={(e) => setEditNetHead(Number(e.target.value))}
                            className="w-full border border-blue-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-blue-900 mb-1">
                            Efficiency η (%)
                          </label>
                          <input
                            type="number"
                            step="1"
                            min="50"
                            max="98"
                            value={editTurbineEff}
                            onChange={(e) => setEditTurbineEff(Number(e.target.value))}
                            className="w-full border border-blue-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {editPrimeMover === 'Thermal (Gas)' && (
                    <div className="p-3.5 rounded-xl border border-orange-200 bg-orange-50/60 space-y-3">
                      <span className="font-bold text-orange-950 flex items-center gap-1.5">
                        <Flame className="h-4 w-4 text-orange-600" />
                        <span>Gas Pipeline Interdependency &amp; Thermal Derating</span>
                      </span>
                      <div className="grid grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-orange-900 mb-1">
                            Gas Pressure (bar)
                          </label>
                          <input
                            type="number"
                            step="2"
                            min="0"
                            max="65"
                            value={editGasPressure}
                            onChange={(e) => setEditGasPressure(Number(e.target.value))}
                            className="w-full border border-orange-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-orange-900 mb-1">
                            Ambient Temp (°C)
                          </label>
                          <input
                            type="number"
                            step="1"
                            min="15"
                            max="50"
                            value={editAmbientTemp}
                            onChange={(e) => setEditAmbientTemp(Number(e.target.value))}
                            className="w-full border border-orange-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-orange-900 mb-1">
                            Rated Cap (MW)
                          </label>
                          <input
                            type="number"
                            step="25"
                            value={editRatedMw}
                            onChange={(e) => setEditRatedMw(Number(e.target.value))}
                            className="w-full border border-orange-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {editPrimeMover === 'Solar / Distributed' && (
                    <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3">
                      <span className="font-bold text-amber-950 flex items-center gap-1.5">
                        <Sun className="h-4 w-4 text-amber-600" />
                        <span>Distributed Generation Irradiance &amp; Cloud Cover</span>
                      </span>
                      <div className="grid grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-amber-900 mb-1">
                            Irradiance (W/m²)
                          </label>
                          <input
                            type="number"
                            step="50"
                            min="0"
                            max="1200"
                            value={editIrradiance}
                            onChange={(e) => setEditIrradiance(Number(e.target.value))}
                            className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-amber-900 mb-1">
                            Cloud Cover (%)
                          </label>
                          <input
                            type="number"
                            step="5"
                            min="0"
                            max="95"
                            value={editCloudCover}
                            onChange={(e) => setEditCloudCover(Number(e.target.value))}
                            className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-amber-900 mb-1">
                            Array Cap (MW)
                          </label>
                          <input
                            type="number"
                            step="10"
                            value={editRatedMw}
                            onChange={(e) => setEditRatedMw(Number(e.target.value))}
                            className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Inertia Constant H (s)
                      </label>
                      <input
                        type="number"
                        step="0.2"
                        min="0.5"
                        max="12.0"
                        value={editInertiaH}
                        onChange={(e) => setEditInertiaH(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Governor Droop R (%)
                      </label>
                      <input
                        type="number"
                        step="0.2"
                        min="1.5"
                        max="10.0"
                        value={editDroopPct}
                        onChange={(e) => setEditDroopPct(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Terminal Voltage (p.u.)
                      </label>
                      <input
                        type="number"
                        step="0.005"
                        min="0.95"
                        max="1.10"
                        value={editVmSetpoint}
                        onChange={(e) => setEditVmSetpoint(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingTarget.kind === 'load' && (
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Load Center Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Active Demand P (MW)
                      </label>
                      <input
                        type="number"
                        step="5"
                        min="0"
                        value={editLoadPMw}
                        onChange={(e) => setEditLoadPMw(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Reactive Demand Q (MVAR)
                      </label>
                      <input
                        type="number"
                        step="5"
                        value={editLoadQMvar}
                        onChange={(e) => setEditLoadQMvar(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Critical Infrastructure Interdependency Category
                    </label>
                    <select
                      value={editCritInfra}
                      onChange={(e: any) => setEditCritInfra(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-semibold"
                    >
                      <option value="Standard Bulk Load">Standard Bulk Distribution Load</option>
                      <option value="Water Treatment & Pumping">
                        Water Treatment &amp; Municipal Pumping
                      </option>
                      <option value="Regional Hospital Cluster">
                        Regional Hospital &amp; Emergency Cluster
                      </option>
                      <option value="Telecom & SCADA Hub">
                        Telecommunications &amp; Fiber Backhaul Hub
                      </option>
                      <option value="Industrial Corridor">
                        Industrial Manufacturing Corridor
                      </option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={editUflsProtected}
                      onChange={(e) => setEditUflsProtected(e.target.checked)}
                      className="accent-[#500b50]"
                    />
                    <span>Exempt from Automatic Under-Frequency Load Shedding (Priority Feeder)</span>
                  </label>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditingTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePropertyEdit}
                  className="px-5 py-2 rounded-xl bg-[#500b50] hover:bg-[#680f68] text-white font-bold"
                >
                  Apply &amp; Re-Solve Model
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* WORKSPACE SUBTAB 2: LOAD SHARING                                          */}
      {/* ========================================================================= */}
      {workspaceTab === 'load_sharing' && (
        <div className="space-y-4">
          {loadSharingError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{loadSharingError}</span>
            </div>
          )}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center">
                Demand Surge Step (ΔP)
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
                  {loadSharingLoading ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Activity className="h-3 w-3" />
                  )}
                  <span>Solve Pickup</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[10px]">Settling Freq</span>
                <span className="font-bold text-slate-900">
                  {loadSharingResult?.settling_frequency_hz || 50.0} Hz
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">System Stiffness</span>
                <span className="font-bold text-slate-900">
                  {loadSharingResult?.system_stiffness_mw_per_hz || 0} MW/Hz
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="p-2.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
              Synchronous Governor Droop Allocation Table
            </div>
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Station</th>
                  <th className="py-2.5 px-3">Capacity</th>
                  <th className="py-2.5 px-3">Droop (R)</th>
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
                    <td className="py-2 px-3 font-bold text-[#500b50]">
                      {gen.participation_factor_percent}%
                    </td>
                    <td className="py-2 px-3 font-bold text-emerald-700">
                      +{gen.allocated_delta_mw} MW
                    </td>
                    <td className="py-2 px-3 text-right">+{gen.remaining_headroom_mw} MW</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* WORKSPACE SUBTAB 3: CASCADING FAILURE (With SLD Navigation & Timeline)    */}
      {/* ========================================================================= */}
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
                      #{l.id}: {l.name || `Bus #${l.from_bus} → Bus #${l.to_bus}`} (
                      {(l.loading_percent ?? 0).toFixed(0)}% load)
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
                    setCascadeError(null);
                    try {
                      const res = await onCascadeTrigger([initialTripLine], cascadeThreshold);
                      setCascadeResult(res);
                    } catch (err: any) {
                      setCascadeResult(null);
                      setCascadeError(err?.message || 'Cascade simulation failed.');
                    } finally {
                      setCascadeLoading(false);
                    }
                  }}
                  disabled={cascadeLoading || lines.length === 0}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white py-2 text-xs font-bold transition disabled:opacity-50"
                >
                  {cascadeLoading ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Activity className="h-3.5 w-3.5" />
                  )}
                  <span>Run Sequence</span>
                </button>
              </div>
            </div>
          </div>

          {cascadeError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{cascadeError}</span>
            </div>
          )}

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
                  onClick={handleViewCascadeOnSld}
                  className="px-3.5 py-1.5 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition"
                >
                  <span>Apply Outages &amp; View on SLD</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="text-slate-700 leading-relaxed">
                <strong>Forensic Sequence Summary:</strong> Initiating outage on circuit #
                {initialTripLine} triggered immediate flow redistribution. In total,{' '}
                <strong className="text-rose-700 font-mono font-bold">
                  {cascadeResult.all_tripped_lines?.length || 0} transmission circuits
                </strong>{' '}
                exceeded the {cascadeThreshold}% threshold and were isolated across{' '}
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
                          <td className="py-1.5 px-3 font-bold text-slate-400">
                            Step {stepItem.step}
                          </td>
                          <td className="py-1.5 px-3 font-sans text-slate-800">
                            {stepItem.description}
                          </td>
                          <td className="py-1.5 px-3 text-rose-700">
                            {stepItem.tripped_in_this_step?.length > 0
                              ? stepItem.tripped_in_this_step
                                  .map((id: number) => `#${id}`)
                                  .join(', ')
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

      {/* ========================================================================= */}
      {/* WORKSPACE SUBTAB 4: REGIONAL PLANNING (All 4 Complete Cards Restored)     */}
      {/* ========================================================================= */}
      {workspaceTab === 'planning' && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
            
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
                    className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white"
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

            {/* 4. Sandbox Node Decommissioning */}
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
                    onClick={() =>
                      toggleBusService && toggleBusService(selectedDecommissionBus)
                    }
                    className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0"
                  >
                    {pfVariables.disabledBuses?.includes(selectedDecommissionBus)
                      ? 'Restore Node'
                      : 'Isolate Node'}
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