'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import {
  API_BASE,
  ApiResult,
  callApi,
  describeNetworkError,
  fetchWithTimeout,
} from '@/lib/apiClient';
import { getCurrentUserKey, SYSTEM_REQ_ROW_NAME } from '@/lib/auth';
import {
  BusData,
  LineData,
  GridModelMeta,
  CascadeResult,
  ExtendedPowerFlowVariables,
  SimResult,
} from '@/types/grid';

export type { ExtendedPowerFlowVariables };
export { supabase };

const CONFIGURED_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || '';
const DEFAULT_BUCKET_CANDIDATES = [
  'models',
  'grid_models',
  'grid-models',
  'model_files',
  'model-files',
  'uploads',
];

const LOCAL_MODELS_CACHE_KEY = 'ml4ps_registered_models_v1';

// Internal registry keys that must never appear as user-selectable grid models
const IGNORED_MODEL_NAMES = new Set([
  SYSTEM_REQ_ROW_NAME,
  'net',
  'network',
  'active_net',
  'base_net',
  'current_net',
  'active_model_id',
  'active_model_name',
  'model_id',
  'model_name',
]);

interface PowerFlowSummary {
  converged: boolean;
  frequency: number;
  total_gen_mw: number;
  total_load_mw: number;
  total_losses_mw: number;
  message?: string | null;
}

interface HydrateResult {
  ok: boolean;
  reason?: string;
}

interface GridContextType {
  models: GridModelMeta[];
  activeModel: GridModelMeta | null;
  buses: BusData[];
  lines: LineData[];
  trippedLines: number[];
  pfVariables: ExtendedPowerFlowVariables;
  summary: PowerFlowSummary;
  loading: boolean;
  modelsLoading: boolean;
  divergedNotice: string | null;
  setPfVariables: React.Dispatch<React.SetStateAction<ExtendedPowerFlowVariables>>;
  toggleLine: (id: number) => void;
  toggleBusService: (busId: number) => void;
  resetTrippedLines: () => void;
  runSimulation: (customVars?: ExtendedPowerFlowVariables, customTrips?: number[]) => Promise<void>;
  activateModel: (id: string) => Promise<void>;
  fetchModels: () => Promise<void>;
  registerUploadedModel: (meta: GridModelMeta, rawPayload?: Record<string, unknown>) => Promise<void>;
  removeRegisteredModel: (idOrName: string) => Promise<void>;
  triggerCascade: (initialTripped: number[], threshold: number) => Promise<CascadeResult>;
  applyCascadeTrips: (trippedList: number[]) => void;
  resetPfVariables: () => void;
  callWithHydration: <T = Record<string, unknown>>(
    path: string,
    options?: RequestInit
  ) => Promise<ApiResult<T>>;
}

export const DEFAULT_VARIABLES: ExtendedPowerFlowVariables = {
  loadMultiplier: 1.0,
  targetPowerFactor: 0.9,
  slackVoltagePu: 1.05,
  shuntMvarCompensation: 0,
  thermalDeratingFactor: 1.0,
  newBuses: [],
  newLines: [],
  newGenerators: [],
  disabledBuses: [],
  disabledGenerators: [],
  disabledLoads: [],
  busOverrides: {},
  lineOverrides: {},
  generatorOverrides: {},
  loadOverrides: {},
  wideAreaScenario: {
    activeEvent: 'NONE',
    severityPercent: 30,
    autoRecoveryEnabled: true,
  },
};

function uniq(list: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      list
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
    )
  );
}

/** Normalizes model metadata rows coming from Supabase, backend API, or localStorage. */
export function normalizeRawModel(m: Record<string, unknown>): GridModelMeta {
  const nameStr = String(m?.name || m?.filename || m?.id || 'Unnamed Model');
  const vLevel =
    m?.voltage_level ||
    m?.voltage_class ||
    (nameStr.includes('132') ? '132kV' : nameStr.includes('130') ? '130kV' : '330kV');

  const domain =
    m?.domain ||
    (nameStr.toLowerCase().includes('dynamic') ? 'Dynamic & Transient' : 'Static Power Flow');

  const totalCap =
    m?.total_installed_mw ??
    m?.total_capacity_mw ??
    m?.installed_capacity ??
    m?.capacity_mw ??
    0;

  return {
    id: String(m?.id || nameStr),
    name: nameStr,
    voltage_level: String(vLevel),
    platform: String(m?.format || m?.platform || 'MATPOWER'),
    buses: Number(m?.buses ?? m?.bus_count ?? 0),
    branches: Number(m?.branches ?? m?.branch_count ?? m?.line_count ?? 0),
    total_installed_mw: Number(totalCap),
    total_demand_mw: Number(m?.total_demand_mw ?? m?.demand_mw ?? 0),
    domain: String(domain),
    is_active: Boolean(m?.is_active),
    converged: Boolean(m?.converged ?? true),
    is_default: Boolean(m?.is_default ?? false),
  };
}

function readLocalCustomModels(): Record<string, unknown>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_MODELS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/** Writes cached model records to localStorage, stripping bulky payloads if quota is exceeded. */
function writeLocalCustomModels(rows: Record<string, unknown>[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_MODELS_CACHE_KEY, JSON.stringify(rows));
  } catch {
    try {
      const lightweight = rows.map((row) => {
        const copy = { ...row };
        delete copy.network_payload;
        delete copy.raw_file_text;
        return copy;
      });
      localStorage.setItem(LOCAL_MODELS_CACHE_KEY, JSON.stringify(lightweight));
    } catch {}
  }
}

function mergeVars(
  saved: Partial<ExtendedPowerFlowVariables> | undefined | null
): ExtendedPowerFlowVariables {
  if (!saved || typeof saved !== 'object') return DEFAULT_VARIABLES;
  return {
    ...DEFAULT_VARIABLES,
    ...saved,
    newBuses: Array.isArray(saved.newBuses) ? saved.newBuses : [],
    newLines: Array.isArray(saved.newLines) ? saved.newLines : [],
    newGenerators: Array.isArray(saved.newGenerators) ? saved.newGenerators : [],
    disabledBuses: Array.isArray(saved.disabledBuses) ? saved.disabledBuses : [],
    disabledGenerators: Array.isArray(saved.disabledGenerators) ? saved.disabledGenerators : [],
    disabledLoads: Array.isArray(saved.disabledLoads) ? saved.disabledLoads : [],
    busOverrides: saved.busOverrides || {},
    lineOverrides: saved.lineOverrides || {},
    generatorOverrides: saved.generatorOverrides || {},
    loadOverrides: saved.loadOverrides || {},
    wideAreaScenario: saved.wideAreaScenario || DEFAULT_VARIABLES.wideAreaScenario,
  };
}

function getStoredModelModifications(
  modelKey: string
): { vars: ExtendedPowerFlowVariables; trips: number[] } | null {
  if (typeof window === 'undefined') return null;
  const userKey = getCurrentUserKey();
  try {
    const rawUser = localStorage.getItem(`ml4ps_mods_${userKey}_${modelKey}`);
    if (rawUser) return JSON.parse(rawUser);
    const rawFallback = localStorage.getItem(`ml4ps_modifications_${modelKey}`);
    if (rawFallback) return JSON.parse(rawFallback);
  } catch {}
  return null;
}

function saveModelModifications(
  modelKey: string,
  vars: ExtendedPowerFlowVariables,
  trips: number[]
) {
  if (typeof window === 'undefined') return;
  const userKey = getCurrentUserKey();
  try {
    const serialized = JSON.stringify({ vars, trips });
    localStorage.setItem(`ml4ps_mods_${userKey}_${modelKey}`, serialized);
    localStorage.setItem(`ml4ps_modifications_${modelKey}`, serialized);
  } catch {}
}

/**
 * Applies interactive sandbox overrides (bus/line/generator/load edits, prime-mover
 * physics, and wide-area disruption scenarios) onto solver telemetry.
 */
function applyElementOverridesToTelemetry(
  rawBuses: BusData[],
  rawLines: LineData[],
  vars: ExtendedPowerFlowVariables,
  trippedLines: number[]
): { buses: BusData[]; lines: LineData[]; frequencyDeltaHz: number } {
  const busOverrides = vars.busOverrides || {};
  const lineOverrides = vars.lineOverrides || {};
  const genOverrides = vars.generatorOverrides || {};
  const loadOverrides = vars.loadOverrides || {};
  const disabledBuses = new Set(vars.disabledBuses || []);
  const disabledGens = new Set(vars.disabledGenerators || []);
  const disabledLoads = new Set(vars.disabledLoads || []);
  const scenario = vars.wideAreaScenario || {
    activeEvent: 'NONE',
    severityPercent: 0,
    autoRecoveryEnabled: true,
  };

  let netGenDeltaMw = 0;

  const updatedBuses = rawBuses.map((b) => {
    let name = b.name;
    let vn_kv = b.vn_kv ?? 330;
    let zone = b.zone || 'Transmission';
    let v_pu = b.v_pu ?? 1.0;
    let p_mw = b.p_mw ?? 0;
    let q_mvar = b.q_mvar ?? 0;

    const bOvr = busOverrides[b.id];
    if (bOvr) {
      if (bOvr.name) name = bOvr.name;
      if (bOvr.vn_kv) vn_kv = bOvr.vn_kv;
      if (bOvr.zone) zone = bOvr.zone;
      if (bOvr.v_pu_setpoint !== undefined) v_pu = bOvr.v_pu_setpoint;
      if (bOvr.shunt_mvar !== undefined) {
        q_mvar -= bOvr.shunt_mvar;
        v_pu = Math.min(1.12, Math.max(0.82, v_pu + bOvr.shunt_mvar * 0.00025));
      }
    }

    const gOvr = genOverrides[b.id];
    if (disabledGens.has(b.id) || (gOvr && gOvr.inService === false)) {
      if (p_mw < 0) {
        netGenDeltaMw -= Math.abs(p_mw);
        p_mw = 0;
      }
    } else if (gOvr) {
      if (gOvr.name) name = gOvr.name;
      if (gOvr.vmPu !== undefined) v_pu = gOvr.vmPu;

      let computedGenMw = gOvr.activeMw ?? Math.abs(p_mw);
      if (
        gOvr.primeMover === 'Hydro' &&
        gOvr.waterIntakeM3s !== undefined &&
        gOvr.netHeadM !== undefined
      ) {
        // P = eta * rho * g * Q * H / 1e6  (MW)
        const eff = (gOvr.turbineEfficiency ?? 90) / 100;
        computedGenMw = Number(
          ((eff * 9.81 * gOvr.netHeadM * gOvr.waterIntakeM3s) / 1000).toFixed(1)
        );
      } else if (gOvr.primeMover === 'Thermal (Gas)' && gOvr.gasPressureBar !== undefined) {
        const baseCap = gOvr.ratedMw || Math.max(100, Math.abs(p_mw) * 1.25);
        const pressureRatio = Math.min(1.15, Math.max(0, gOvr.gasPressureBar / 45.0));
        const tempDerate =
          gOvr.ambientTempC && gOvr.ambientTempC > 30
            ? Math.max(0.75, 1 - (gOvr.ambientTempC - 30) * 0.004)
            : 1.0;
        computedGenMw = Number((baseCap * 0.85 * pressureRatio * tempDerate).toFixed(1));
      } else if (gOvr.primeMover === 'Solar / Distributed' && gOvr.irradianceWm2 !== undefined) {
        const baseCap = gOvr.ratedMw || Math.max(50, Math.abs(p_mw));
        const irrFactor = Math.max(0, gOvr.irradianceWm2 / 1000);
        const cloudFactor = 1 - Math.min(95, Math.max(0, gOvr.cloudCoverPct ?? 0)) / 100;
        computedGenMw = Number((baseCap * irrFactor * cloudFactor).toFixed(1));
      }

      const prevGenMw = p_mw < 0 ? Math.abs(p_mw) : 0;
      netGenDeltaMw += computedGenMw - prevGenMw;
      p_mw = -computedGenMw;
    }

    const lOvr = loadOverrides[b.id];
    if (disabledLoads.has(b.id) || (lOvr && lOvr.inService === false)) {
      if (p_mw > 0) {
        netGenDeltaMw += p_mw;
        p_mw = 0;
        q_mvar = 0;
      }
    } else if (lOvr) {
      if (lOvr.name) name = lOvr.name;
      if (lOvr.pMw !== undefined && p_mw >= 0) {
        netGenDeltaMw -= lOvr.pMw - p_mw;
        p_mw = lOvr.pMw;
      }
      if (lOvr.qMvar !== undefined) {
        q_mvar = lOvr.qMvar;
      }
    }

    if (scenario.activeEvent !== 'NONE') {
      const sev = Math.max(0, Math.min(100, scenario.severityPercent || 30)) / 100;
      const isHydroBus = /kainji|jebba|shiroro|zungeru|hydro/i.test(name);
      const isGasBus = p_mw < -15 && !isHydroBus;

      if (scenario.activeEvent === 'GAS_PIPELINE_RUPTURE' && isGasBus) {
        const loss = Math.abs(p_mw) * sev * 0.65;
        p_mw += loss;
        netGenDeltaMw -= loss;
        v_pu = Math.max(0.86, v_pu - sev * 0.04);
      } else if (scenario.activeEvent === 'HYDRO_FLOOD_SURGE' && isHydroBus) {
        const loss = Math.abs(p_mw) * sev * 0.4;
        p_mw += loss;
        netGenDeltaMw -= loss;
      } else if (scenario.activeEvent === 'CYBER_SCADA_ATTACK') {
        v_pu = Math.max(0.85, v_pu - sev * 0.05);
      } else if (scenario.activeEvent === 'DISTRIBUTED_CLOUD_TRANSIENT') {
        v_pu = Math.max(0.88, v_pu - sev * 0.03);
      }

      if (scenario.autoRecoveryEnabled) {
        v_pu = Math.min(1.05, v_pu + 0.025);
      }
    }

    if (disabledBuses.has(b.id)) {
      p_mw = 0;
      q_mvar = 0;
      v_pu = 0;
    }

    return {
      ...b,
      name,
      vn_kv,
      zone,
      v_pu: Number(v_pu.toFixed(4)),
      p_mw: Number(p_mw.toFixed(2)),
      q_mvar: Number(q_mvar.toFixed(2)),
    };
  });

  const trippedSet = new Set(trippedLines);
  const updatedLines = rawLines.map((l) => {
    const lOvr = lineOverrides[l.id];
    const isTripped = trippedSet.has(l.id) || lOvr?.in_service === false;
    const name = lOvr?.name || l.name;
    const length_km = lOvr?.length_km ?? l.length_km;
    const r_ohm_per_km = lOvr?.r_ohm_per_km ?? l.r_ohm_per_km;
    const x_ohm_per_km = lOvr?.x_ohm_per_km ?? l.x_ohm_per_km;
    let flow_mw = isTripped ? 0 : l.flow_mw ?? l.p_mw ?? 0;
    let loading_percent = isTripped ? 0 : l.loading_percent ?? 0;

    if (!isTripped && lOvr?.x_ohm_per_km && l.x_ohm_per_km) {
      const ratio = l.x_ohm_per_km / Math.max(0.01, lOvr.x_ohm_per_km);
      flow_mw = Number((flow_mw * ratio).toFixed(1));
      loading_percent = Number((loading_percent * ratio).toFixed(1));
    }

    if (!isTripped && lOvr?.thermal_rating_mw && lOvr.thermal_rating_mw > 0) {
      loading_percent = Number(
        ((Math.abs(flow_mw) / lOvr.thermal_rating_mw) * 100).toFixed(1)
      );
    }

    return {
      ...l,
      name,
      length_km,
      r_ohm_per_km,
      x_ohm_per_km,
      flow_mw,
      p_mw: flow_mw,
      loading_percent,
      in_service: !isTripped,
    };
  });

  const frequencyDeltaHz = Number((netGenDeltaMw / 2500).toFixed(3));
  return { buses: updatedBuses, lines: updatedLines, frequencyDeltaHz };
}

/** Downloads the raw `.m` or `.json` file from Supabase Storage or direct URL if needed to rehydrate the backend. */
async function downloadModelFile(
  model: GridModelMeta,
  row: Record<string, unknown> | undefined
): Promise<Blob | null> {
  const r = row || {};

  const directUrls = uniq([
    r.file_url as string,
    r.public_url as string,
    r.download_url as string,
    r.url as string,
    r.storage_url as string,
  ]).filter((u) => /^https?:\/\//i.test(u));

  for (const url of directUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.blob();
    } catch {}
  }

  if (!supabase) return null;

  const remembered =
    typeof window !== 'undefined' ? localStorage.getItem('ml4ps_storage_bucket') : null;
  const buckets = uniq([
    r.bucket as string,
    r.bucket_name as string,
    r.storage_bucket as string,
    CONFIGURED_BUCKET,
    remembered,
    ...DEFAULT_BUCKET_CANDIDATES,
  ]);

  const baseName = model.name;
  const withExt = /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}.m`;
  const paths = uniq([
    r.storage_path as string,
    r.file_path as string,
    r.path as string,
    r.object_path as string,
    r.file_name as string,
    r.filename as string,
    baseName,
    withExt,
    `${model.id}.m`,
    model.id,
  ]);

  for (const bucket of buckets) {
    for (const rawPath of paths) {
      let path = rawPath.replace(/^\/+/, '');
      if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);

      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (data) {
        if (typeof window !== 'undefined') localStorage.setItem('ml4ps_storage_bucket', bucket);
        return data;
      }

      if (error?.message && /bucket not found/i.test(error.message)) break;

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      if (pub?.publicUrl) {
        try {
          const res = await fetch(pub.publicUrl);
          if (res.ok) {
            if (typeof window !== 'undefined') localStorage.setItem('ml4ps_storage_bucket', bucket);
            return await res.blob();
          }
        } catch {}
      }
    }
  }

  return null;
}

const GridContext = createContext<GridContextType | null>(null);

export const GridProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<GridModelMeta[]>([]);
  const [activeModel, setActiveModel] = useState<GridModelMeta | null>(null);
  const [buses, setBuses] = useState<BusData[]>([]);
  const [lines, setLines] = useState<LineData[]>([]);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [pfVariables, setPfVariablesState] =
    useState<ExtendedPowerFlowVariables>(DEFAULT_VARIABLES);
  const [loading, setLoading] = useState<boolean>(false);
  const [modelsLoading, setModelsLoading] = useState<boolean>(false);
  const [divergedNotice, setDivergedNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<PowerFlowSummary>({
    converged: true,
    frequency: 50.0,
    total_gen_mw: 0.0,
    total_load_mw: 0.0,
    total_losses_mw: 0.0,
  });

  const pfVariablesRef = useRef<ExtendedPowerFlowVariables>(DEFAULT_VARIABLES);
  const trippedRef = useRef<number[]>([]);
  const rawBusesRef = useRef<BusData[]>([]);
  const rawLinesRef = useRef<LineData[]>([]);
  const linesRef = useRef<LineData[]>([]);
  const activeModelRef = useRef<GridModelMeta | null>(null);
  const modelsRef = useRef<GridModelMeta[]>([]);
  const rawRowsRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const simSeqRef = useRef(0);
  const hydrateInFlightRef = useRef<{ id: string; promise: Promise<HydrateResult> } | null>(null);
  const autoRunRef = useRef(false);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const persistModifications = useCallback(() => {
    const m = activeModelRef.current;
    if (!m) return;
    if (m.id) saveModelModifications(m.id, pfVariablesRef.current, trippedRef.current);
    if (m.name) saveModelModifications(m.name, pfVariablesRef.current, trippedRef.current);
  }, []);

  const setPfVariables: React.Dispatch<React.SetStateAction<ExtendedPowerFlowVariables>> =
    useCallback(
      (action) => {
        const prev = pfVariablesRef.current;
        const next = typeof action === 'function' ? action(prev) : action;
        pfVariablesRef.current = next;
        setPfVariablesState(next);
        persistModifications();

        if (rawBusesRef.current.length > 0) {
          const applied = applyElementOverridesToTelemetry(
            rawBusesRef.current,
            rawLinesRef.current,
            next,
            trippedRef.current
          );
          setBuses(applied.buses);
          setLines(applied.lines);
        }
      },
      [persistModifications]
    );

  const setTripped = useCallback(
    (next: number[]) => {
      trippedRef.current = next;
      setTrippedLines(next);
      persistModifications();
    },
    [persistModifications]
  );

  /** Ensures `model` is loaded in backend memory, rehydrating from JSON payload, raw text, or Storage if needed. */
  const hydrateBackend = useCallback(async (model: GridModelMeta): Promise<HydrateResult> => {
    const names = uniq([model.name, model.id, model.name.replace(/\.m$/i, '')]);
    let reachedBackend = false;

    for (const candidate of names) {
      try {
        const res = await callApi(`/api/models/activate/${encodeURIComponent(candidate)}`, {
          method: 'POST',
        });
        reachedBackend = true;
        if (res.ok) return { ok: true };
      } catch {}
    }

    let rawRow = rawRowsRef.current.get(model.id) || rawRowsRef.current.get(model.name);
    if (!rawRow) {
      const localList = readLocalCustomModels();
      rawRow = localList.find((x) => x.id === model.id || x.name === model.name);
    }

    if (!rawRow && supabase) {
      try {
        const { data: byName } = await supabase
          .from('grid_models')
          .select('*')
          .eq('name', model.name)
          .maybeSingle();
        if (byName) rawRow = byName as Record<string, unknown>;
      } catch {}
    }

    const networkPayload =
      rawRow?.network_payload ??
      rawRow?.payload ??
      rawRow?.net_json ??
      rawRow?.topology_json ??
      rawRow?.data;

    if (typeof networkPayload === 'string' && networkPayload.length > 0) {
      try {
        const loadRes = await callApi('/api/models/load-payload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: model.id,
            name: model.name,
            voltage_level: model.voltage_level || '330kV',
            domain: model.domain || 'Static Power Flow',
            platform: model.platform || 'MATPOWER',
            network_payload: networkPayload,
          }),
        });
        reachedBackend = true;
        if (loadRes.ok) return { ok: true };
      } catch {}
    }

    if (typeof rawRow?.raw_file_text === 'string' && rawRow.raw_file_text.length > 0) {
      try {
        const fileName = /\.[a-z0-9]+$/i.test(model.name) ? model.name : `${model.name}.m`;
        const blob = new Blob([rawRow.raw_file_text], { type: 'text/plain;charset=utf-8' });
        const fd = new FormData();
        fd.append('file', blob, fileName);
        const up = await callApi('/api/models/upload', { method: 'POST', body: fd });
        reachedBackend = true;
        if (up.ok) return { ok: true };
      } catch {}
    }

    const blob = await downloadModelFile(model, rawRow);
    if (blob) {
      const fileName = /\.[a-z0-9]+$/i.test(model.name) ? model.name : `${model.name}.m`;
      try {
        const fd = new FormData();
        fd.append('file', blob, fileName);
        const up = await callApi('/api/models/upload', { method: 'POST', body: fd });
        reachedBackend = true;
        if (up.ok) return { ok: true };
      } catch (err) {
        return { ok: false, reason: describeNetworkError(err) };
      }
    }

    if (!reachedBackend) {
      return {
        ok: false,
        reason: 'Cannot reach the solver backend. It may be waking up — click Solve to retry.',
      };
    }

    return {
      ok: false,
      reason: `Model "${model.name}" is not in solver memory yet. Re-upload it once in Upload & Ingestion to cache its topology.`,
    };
  }, []);

  const hydrateOnce = useCallback(
    (model: GridModelMeta): Promise<HydrateResult> => {
      const inFlight = hydrateInFlightRef.current;
      if (inFlight && inFlight.id === model.id) return inFlight.promise;

      const promise = hydrateBackend(model).finally(() => {
        if (hydrateInFlightRef.current?.id === model.id) hydrateInFlightRef.current = null;
      });
      hydrateInFlightRef.current = { id: model.id, promise };
      return promise;
    },
    [hydrateBackend]
  );

  /**
   * Calls any backend simulation endpoint and automatically rehydrates the active
   * model once if the worker restarted cold and lost in-memory state.
   */
  const callWithHydration = useCallback(
    async <T = Record<string, unknown>>(
      path: string,
      options?: RequestInit
    ): Promise<ApiResult<T>> => {
      let res = await callApi<T>(path, options);
      if (res.noModel && activeModelRef.current) {
        const hydrated = await hydrateOnce(activeModelRef.current);
        if (!hydrated.ok) {
          return {
            ...res,
            ok: false,
            message: hydrated.reason || res.message,
          };
        }
        res = await callApi<T>(path, options);
      }
      return res;
    },
    [hydrateOnce]
  );

  /** Merges registered models from Supabase, the active backend, and localStorage cache. */
  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    const mergedByName = new Map<string, GridModelMeta>();
    const rawMap = new Map<string, Record<string, unknown>>();

    const addRow = (row: unknown) => {
      if (!row || typeof row !== 'object') return;
      const rec = row as Record<string, unknown>;
      const rName = String(rec.name || rec.filename || rec.id || '').trim();
      if (!rName || IGNORED_MODEL_NAMES.has(rName.toLowerCase())) return;

      const meta = normalizeRawModel(rec);
      const key = meta.name.toLowerCase();
      if (IGNORED_MODEL_NAMES.has(key)) return;

      const existing = mergedByName.get(key);
      mergedByName.set(key, existing ? { ...existing, ...meta } : meta);
      rawMap.set(meta.id, { ...(rawMap.get(meta.id) || {}), ...rec });
      rawMap.set(meta.name, { ...(rawMap.get(meta.name) || {}), ...rec });
    };

    if (supabase) {
      try {
        const { data, error } = await supabase.from('grid_models').select('*');
        if (!error && Array.isArray(data)) data.forEach(addRow);
      } catch {}
    }

    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/models`, {}, 12_000);
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.models || json.data || [];
        if (Array.isArray(list)) list.forEach(addRow);
      }
    } catch {}

    readLocalCustomModels().forEach(addRow);

    rawRowsRef.current = rawMap;
    let retrieved = Array.from(mergedByName.values());

    if (retrieved.length > 0) {
      const savedId =
        typeof window !== 'undefined' ? localStorage.getItem('ml4ps_active_model_id') : null;
      const matched =
        retrieved.find(
          (m) =>
            m.id === savedId ||
            m.name === savedId ||
            m.name.toLowerCase() === String(savedId || '').toLowerCase()
        ) ||
        retrieved.find((m) => m.is_active) ||
        retrieved[0];

      retrieved = retrieved.map((m) => ({
        ...m,
        is_active: m.name.toLowerCase() === matched.name.toLowerCase(),
      }));
      const activeEntry =
        retrieved.find((m) => m.name.toLowerCase() === matched.name.toLowerCase()) || matched;

      modelsRef.current = retrieved;
      activeModelRef.current = activeEntry;
      setModels(retrieved);
      setActiveModel(activeEntry);
    } else {
      modelsRef.current = [];
      activeModelRef.current = null;
      setModels([]);
      setActiveModel(null);
    }

    setModelsLoading(false);
  }, []);

  const runSimulation = useCallback(
    async (customVars?: ExtendedPowerFlowVariables, customTrips?: number[]) => {
      const seq = ++simSeqRef.current;
      setLoading(true);

      try {
        const isRealPfVar =
          customVars &&
          typeof customVars === 'object' &&
          !('nativeEvent' in customVars) &&
          !('target' in customVars) &&
          ('loadMultiplier' in customVars || 'slackVoltagePu' in customVars);

        const varsToRun: ExtendedPowerFlowVariables = isRealPfVar
          ? customVars
          : pfVariablesRef.current;
        let tripsToRun: number[] = Array.isArray(customTrips) ? customTrips : trippedRef.current;

        if (varsToRun?.disabledBuses && varsToRun.disabledBuses.length > 0) {
          const busSet = new Set(varsToRun.disabledBuses);
          const incidentLines = linesRef.current
            .filter((l) => busSet.has(l.from_bus) || busSet.has(l.to_bus))
            .map((l) => l.id);
          tripsToRun = Array.from(new Set([...tripsToRun, ...incidentLines]));
        }

        if (varsToRun?.lineOverrides) {
          const ovrTrips = Object.entries(varsToRun.lineOverrides)
            .filter(([, ovr]) => ovr?.in_service === false)
            .map(([idStr]) => Number(idStr));
          tripsToRun = Array.from(new Set([...tripsToRun, ...ovrTrips]));
        }

        const finite = (v: unknown, fallback: number) =>
          Number.isFinite(Number(v)) ? Number(v) : fallback;

        const payload = {
          pf_variables: {
            loadMultiplier: finite(varsToRun?.loadMultiplier, 1.0),
            targetPowerFactor: finite(varsToRun?.targetPowerFactor, 0.9),
            slackVoltagePu: finite(varsToRun?.slackVoltagePu, 1.05),
            shuntMvarCompensation: finite(varsToRun?.shuntMvarCompensation, 0.0),
            thermalDeratingFactor: finite(varsToRun?.thermalDeratingFactor, 1.0),
            newBuses: Array.isArray(varsToRun?.newBuses) ? varsToRun.newBuses : [],
            newLines: Array.isArray(varsToRun?.newLines) ? varsToRun.newLines : [],
            newGenerators: Array.isArray(varsToRun?.newGenerators) ? varsToRun.newGenerators : [],
          },
          tripped_lines: tripsToRun.filter((id): id is number => typeof id === 'number'),
        };

        const result = await callWithHydration<SimResult>('/api/simulations/power-flow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (seq !== simSeqRef.current) return;

        if (!result.ok) {
          setDivergedNotice(
            result.message || `Solver error (HTTP ${result.status}). Click Solve to retry.`
          );
          return;
        }

        const data = result.body;

        if (Array.isArray(data.buses) && data.buses.length > 0) {
          rawBusesRef.current = data.buses;
        }
        if (Array.isArray(data.lines) && data.lines.length > 0) {
          rawLinesRef.current = data.lines;
        }

        const applied = applyElementOverridesToTelemetry(
          rawBusesRef.current,
          rawLinesRef.current,
          varsToRun,
          tripsToRun
        );

        setBuses(applied.buses);
        setLines(applied.lines);

        const hasOverrides =
          Object.keys(varsToRun.generatorOverrides || {}).length > 0 ||
          Object.keys(varsToRun.loadOverrides || {}).length > 0 ||
          (varsToRun.disabledGenerators?.length || 0) > 0 ||
          (varsToRun.disabledLoads?.length || 0) > 0 ||
          (varsToRun.wideAreaScenario?.activeEvent || 'NONE') !== 'NONE';

        const totalGenMw = hasOverrides
          ? Number(
              applied.buses
                .reduce((acc, b) => acc + (b.p_mw < 0 ? Math.abs(b.p_mw) : 0), 0)
                .toFixed(1)
            )
          : data.total_gen_mw ?? 0.0;

        const totalLoadMw = hasOverrides
          ? Number(
              applied.buses
                .reduce((acc, b) => acc + (b.p_mw > 0 ? b.p_mw : 0), 0)
                .toFixed(1)
            )
          : data.total_load_mw ?? 0.0;

        const baseFreq = data.frequency ?? 50.0;
        const settledFreq = Number(
          Math.max(47.5, Math.min(51.5, baseFreq + applied.frequencyDeltaHz)).toFixed(3)
        );

        setSummary({
          converged: data.converged ?? true,
          frequency: settledFreq,
          total_gen_mw: totalGenMw,
          total_load_mw: totalLoadMw,
          total_losses_mw: data.total_losses_mw ?? 0.0,
          message: data.message,
        });

        if (data.converged === false || result.noModel) {
          setDivergedNotice(data.message || 'Power flow diverged.');
        } else {
          setDivergedNotice(data.message || null);
        }
      } catch (err) {
        if (seq === simSeqRef.current) setDivergedNotice(describeNetworkError(err));
      } finally {
        if (seq === simSeqRef.current) setLoading(false);
      }
    },
    [callWithHydration]
  );

  const registerUploadedModel = useCallback(
    async (meta: GridModelMeta, rawPayload?: Record<string, unknown>) => {
      const entry: GridModelMeta = { ...meta, is_active: true };
      const rawRecord: Record<string, unknown> = { ...entry, ...(rawPayload || {}) };

      rawRowsRef.current.set(entry.id, rawRecord);
      rawRowsRef.current.set(entry.name, rawRecord);

      const currentLocal = readLocalCustomModels().filter(
        (x) =>
          String(x.name || '').toLowerCase() !== entry.name.toLowerCase() &&
          String(x.id || '').toLowerCase() !== entry.id.toLowerCase()
      );
      writeLocalCustomModels([rawRecord, ...currentLocal]);

      if (typeof window !== 'undefined') {
        localStorage.setItem('ml4ps_active_model_id', entry.name);
      }

      const existingFiltered = modelsRef.current
        .filter((m) => m.name.toLowerCase() !== entry.name.toLowerCase())
        .map((m) => ({ ...m, is_active: false }));
      const nextModels = [entry, ...existingFiltered];

      modelsRef.current = nextModels;
      activeModelRef.current = entry;
      setModels(nextModels);
      setActiveModel(entry);

      pfVariablesRef.current = DEFAULT_VARIABLES;
      trippedRef.current = [];
      setPfVariablesState(DEFAULT_VARIABLES);
      setTrippedLines([]);

      await runSimulation(DEFAULT_VARIABLES, []);
    },
    [runSimulation]
  );

  const removeRegisteredModel = useCallback(
    async (idOrName: string) => {
      const targetLower = idOrName.toLowerCase();
      const updatedLocal = readLocalCustomModels().filter(
        (x) =>
          String(x.id || '').toLowerCase() !== targetLower &&
          String(x.name || '').toLowerCase() !== targetLower
      );
      writeLocalCustomModels(updatedLocal);

      if (supabase) {
        try {
          await supabase.from('grid_models').delete().eq('id', idOrName);
        } catch {}
        try {
          await supabase.from('grid_models').delete().eq('name', idOrName);
        } catch {}
      }

      try {
        await callApi(`/api/models/${encodeURIComponent(idOrName)}`, { method: 'DELETE' });
      } catch {}

      await fetchModels();
    },
    [fetchModels]
  );

  const activateModel = useCallback(
    async (id: string) => {
      const idLower = id.toLowerCase();
      const target = modelsRef.current.find(
        (m) =>
          m.id === id ||
          m.name === id ||
          m.id.toLowerCase() === idLower ||
          m.name.toLowerCase() === idLower
      );
      if (!target) {
        setDivergedNotice(`Model "${id}" was not found. Click Refresh and try again.`);
        return;
      }

      setLoading(true);
      setDivergedNotice(null);

      const switchingModel = activeModelRef.current?.name !== target.name;
      const activeEntry = { ...target, is_active: true };

      activeModelRef.current = activeEntry;
      setActiveModel(activeEntry);

      const nextModels = modelsRef.current.map((m) => ({
        ...m,
        is_active: m.name === target.name,
      }));
      modelsRef.current = nextModels;
      setModels(nextModels);

      if (typeof window !== 'undefined') {
        localStorage.setItem('ml4ps_active_model_id', target.name);
      }

      if (switchingModel) {
        setBuses([]);
        setLines([]);
        rawBusesRef.current = [];
        rawLinesRef.current = [];
        linesRef.current = [];
      }

      const saved =
        getStoredModelModifications(target.id) || getStoredModelModifications(target.name);
      const varsToApply = mergeVars(saved?.vars);
      const tripsToApply = Array.isArray(saved?.trips) ? saved.trips : [];
      pfVariablesRef.current = varsToApply;
      trippedRef.current = tripsToApply;
      setPfVariablesState(varsToApply);
      setTrippedLines(tripsToApply);

      try {
        const h = await hydrateOnce(target);
        if (!h.ok) {
          setDivergedNotice(h.reason || 'Could not load this model on the solver.');
          return;
        }
        await runSimulation(varsToApply, tripsToApply);
      } finally {
        setLoading(false);
      }
    },
    [hydrateOnce, runSimulation]
  );

  const toggleLine = useCallback(
    (id: number) => {
      const prev = trippedRef.current;
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setTripped(next);
      runSimulation(undefined, next);
    },
    [runSimulation, setTripped]
  );

  const toggleBusService = useCallback(
    (busId: number) => {
      const prev = pfVariablesRef.current;
      const disabled = prev.disabledBuses || [];
      const nextDisabled = disabled.includes(busId)
        ? disabled.filter((id) => id !== busId)
        : [...disabled, busId];
      const updatedVars = { ...prev, disabledBuses: nextDisabled };
      setPfVariables(updatedVars);
      runSimulation(updatedVars);
    },
    [runSimulation, setPfVariables]
  );

  const resetTrippedLines = useCallback(() => {
    setTripped([]);
    runSimulation(undefined, []);
  }, [runSimulation, setTripped]);

  const resetPfVariables = useCallback(() => {
    const m = activeModelRef.current;
    const userKey = getCurrentUserKey();
    if (m && typeof window !== 'undefined') {
      localStorage.removeItem(`ml4ps_mods_${userKey}_${m.id}`);
      localStorage.removeItem(`ml4ps_mods_${userKey}_${m.name}`);
      localStorage.removeItem(`ml4ps_modifications_${m.id}`);
      localStorage.removeItem(`ml4ps_modifications_${m.name}`);
    }
    pfVariablesRef.current = DEFAULT_VARIABLES;
    trippedRef.current = [];
    setPfVariablesState(DEFAULT_VARIABLES);
    setTrippedLines([]);
    runSimulation(DEFAULT_VARIABLES, []);
  }, [runSimulation]);

  const applyCascadeTrips = useCallback(
    (trippedList: number[]) => {
      setTripped(trippedList);
      runSimulation(undefined, trippedList);
    },
    [runSimulation, setTripped]
  );

  const triggerCascade = useCallback(
    async (initialTripped: number[], threshold: number): Promise<CascadeResult> => {
      const vars = pfVariablesRef.current;
      const payload = {
        initial_tripped_lines: initialTripped,
        overload_threshold_percent: threshold,
        max_cascade_steps: 8,
        load_multiplier: vars.loadMultiplier,
        slack_voltage_pu: vars.slackVoltagePu,
        target_power_factor: vars.targetPowerFactor,
      };

      const res = await callWithHydration<CascadeResult>('/api/simulations/cascade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(res.message || `Cascade simulation failed (HTTP ${res.status}).`);
      }
      return res.body;
    },
    [callWithHydration]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchModels();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchModels]);

  useEffect(() => {
    if (autoRunRef.current || !activeModel) return;
    autoRunRef.current = true;
    const saved =
      getStoredModelModifications(activeModel.id) || getStoredModelModifications(activeModel.name);
    const vars = mergeVars(saved?.vars);
    const trips = Array.isArray(saved?.trips) ? saved.trips : [];
    pfVariablesRef.current = vars;
    trippedRef.current = trips;
    const timer = setTimeout(() => {
      setPfVariablesState(vars);
      setTrippedLines(trips);
      void runSimulation(vars, trips);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeModel, runSimulation]);

  return (
    <GridContext.Provider
      value={{
        models,
        activeModel,
        buses,
        lines,
        trippedLines,
        pfVariables,
        summary,
        loading,
        modelsLoading,
        divergedNotice,
        setPfVariables,
        toggleLine,
        toggleBusService,
        resetTrippedLines,
        runSimulation,
        activateModel,
        fetchModels,
        registerUploadedModel,
        removeRegisteredModel,
        triggerCascade,
        applyCascadeTrips,
        resetPfVariables,
        callWithHydration,
      }}
    >
      {children}
    </GridContext.Provider>
  );
};

export const useGrid = () => {
  const context = useContext(GridContext);
  if (!context) throw new Error('useGrid must be used within a GridProvider');
  return context;
};
