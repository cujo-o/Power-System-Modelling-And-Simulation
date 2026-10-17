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
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  BusData,
  LineData,
  GridModelMeta,
  PowerFlowVariables,
  CascadeResult,
} from '@/types/grid';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hoggydryloidupqprwpl.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const CONFIGURED_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || '';
const DEFAULT_BUCKET_GUESSES = [
  'models',
  'grid_models',
  'grid-models',
  'model_files',
  'model-files',
  'uploads',
];

const BACKEND_URLS: string[] = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_API_URL, 'https://national-power-backend.onrender.com']
      .filter(Boolean)
      .map((u) => String(u).replace(/\/+$/, ''))
  )
);

const REQUEST_TIMEOUT_MS = 45_000;
const GATEWAY_STATUSES = new Set([502, 503, 504]);
const NO_MODEL_RE =
  /no\s+(active\s+)?model|model\s+(is\s+)?not\s+(loaded|active)|no\s+network\s+(loaded|active)|select\s+(a|the)\s+model/i;

interface PowerFlowSummary {
  converged: boolean;
  frequency: number;
  total_gen_mw: number;
  total_load_mw: number;
  total_losses_mw: number;
  message?: string | null;
}

export interface ExtendedPowerFlowVariables extends PowerFlowVariables {
  disabledBuses?: number[];
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
  triggerCascade: (initialTripped: number[], threshold: number) => Promise<CascadeResult>;
  applyCascadeTrips: (trippedList: number[]) => void;
  resetPfVariables: () => void;
}

interface ApiResult {
  ok: boolean;
  status: number;
  body: any;
  message: string;
  noModel: boolean;
}

interface HydrateResult {
  ok: boolean;
  reason?: string;
}

const DEFAULT_VARIABLES: ExtendedPowerFlowVariables = {
  loadMultiplier: 1.0,
  targetPowerFactor: 0.9,
  slackVoltagePu: 1.05,
  shuntMvarCompensation: 0,
  thermalDeratingFactor: 1.0,
  newBuses: [],
  newLines: [],
  newGenerators: [],
  disabledBuses: [],
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function uniq(list: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      list
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
    )
  );
}

function getCurrentUserKey(): string {
  if (typeof window === 'undefined') return 'guest';
  try {
    const raw = localStorage.getItem('nesi_user') || localStorage.getItem('ml4ps_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      return (parsed.email || parsed.username || 'guest').toLowerCase();
    }
  } catch {}
  return 'guest';
}

function normalizeRawModel(m: any): GridModelMeta {
  const vLevel =
    m?.voltage_level ||
    m?.voltage_class ||
    (m?.name?.includes('132') ? '132kV' : m?.name?.includes('130') ? '130kV' : '330kV');

  const domain =
    m?.domain ||
    (m?.name?.toLowerCase().includes('dynamic') ? 'Dynamic & Transient' : 'Static Power Flow');

  const totalCap =
    m?.total_installed_mw ??
    m?.total_capacity_mw ??
    m?.installed_capacity ??
    m?.capacity_mw ??
    0;

  return {
    id: String(m?.id || m?.name || 'model-' + Math.random().toString(36).substring(7)),
    name: String(m?.name || m?.filename || 'Unnamed Model'),
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

function mergeVars(saved: Partial<ExtendedPowerFlowVariables> | undefined | null): ExtendedPowerFlowVariables {
  if (!saved || typeof saved !== 'object') return DEFAULT_VARIABLES;
  return {
    ...DEFAULT_VARIABLES,
    ...saved,
    newBuses: Array.isArray(saved.newBuses) ? saved.newBuses : [],
    newLines: Array.isArray(saved.newLines) ? saved.newLines : [],
    newGenerators: Array.isArray(saved.newGenerators) ? saved.newGenerators : [],
    disabledBuses: Array.isArray(saved.disabledBuses) ? saved.disabledBuses : [],
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

function saveModelModifications(modelKey: string, vars: ExtendedPowerFlowVariables, trips: number[]) {
  if (typeof window === 'undefined') return;
  const userKey = getCurrentUserKey();
  try {
    const serialized = JSON.stringify({ vars, trips });
    localStorage.setItem(`ml4ps_mods_${userKey}_${modelKey}`, serialized);
    localStorage.setItem(`ml4ps_modifications_${modelKey}`, serialized);
  } catch {}
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  let lastError: any = null;
  let lastGatewayRes: Response | null = null;

  for (const base of BACKEND_URLS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchWithTimeout(`${base}${cleanPath}`, options);
        if (!GATEWAY_STATUSES.has(res.status)) return res;
        lastGatewayRes = res;
      } catch (err) {
        lastError = err;
      }
      if (attempt === 0) await sleep(2500);
    }
  }

  if (lastGatewayRes) return lastGatewayRes;
  throw lastError || new Error('Connection to backend failed.');
}

async function readBody(res: Response): Promise<any> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function bodyMessage(body: any): string {
  const d = body?.detail ?? body?.message ?? body?.error;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join('; ');
  return d ? JSON.stringify(d) : '';
}

async function callApi(path: string, options?: RequestInit): Promise<ApiResult> {
  const res = await apiFetch(path, options);
  const body = await readBody(res);
  const message = bodyMessage(body);
  return {
    ok: res.ok,
    status: res.status,
    body,
    message,
    noModel: NO_MODEL_RE.test(message),
  };
}

function describeNetworkError(err: any): string {
  if (err?.name === 'AbortError') {
    return 'The solver took too long to respond (backend waking up). Click Solve to retry.';
  }
  return 'Cannot reach the solver backend. Check your connection and click Solve to retry.';
}

async function downloadModelFile(
  model: GridModelMeta,
  row: any
): Promise<{ blob: Blob | null; tried: string[] }> {
  const tried: string[] = [];
  const r = row || {};

  const urls = uniq([r.file_url, r.public_url, r.download_url, r.url, r.storage_url]).filter((u) =>
    /^https?:\/\//i.test(u)
  );
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (res.ok) return { blob: await res.blob(), tried };
      tried.push(`${u} -> HTTP ${res.status}`);
    } catch {
      tried.push(`${u} -> network error`);
    }
  }

  const sb = supabase;
  if (!sb) return { blob: null, tried };

  const remembered =
    typeof window !== 'undefined' ? localStorage.getItem('ml4ps_storage_bucket') : null;
  const buckets = uniq([
    r.bucket,
    r.bucket_name,
    r.storage_bucket,
    CONFIGURED_BUCKET,
    remembered,
    ...DEFAULT_BUCKET_GUESSES,
  ]);

  const baseName = model.name;
  const withExt = /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}.m`;
  const paths = uniq([
    r.storage_path,
    r.file_path,
    r.path,
    r.object_path,
    r.file_name,
    r.filename,
    baseName,
    withExt,
    `${model.id}.m`,
    model.id,
  ]);

  for (const bucket of buckets) {
    for (const rawPath of paths) {
      let path = rawPath.replace(/^\/+/, '');
      if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);

      const { data, error } = await sb.storage.from(bucket).download(path);
      if (data) {
        if (typeof window !== 'undefined') localStorage.setItem('ml4ps_storage_bucket', bucket);
        return { blob: data, tried };
      }

      const msg = error?.message || 'download failed';
      tried.push(`${bucket}/${path} -> ${msg}`);
      if (/bucket not found/i.test(msg)) break;

      const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
      if (pub?.publicUrl) {
        try {
          const res = await fetch(pub.publicUrl);
          if (res.ok) {
            if (typeof window !== 'undefined') localStorage.setItem('ml4ps_storage_bucket', bucket);
            return { blob: await res.blob(), tried };
          }
        } catch {}
      }
    }
  }

  return { blob: null, tried };
}

const GridContext = createContext<GridContextType | null>(null);

export const GridProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<GridModelMeta[]>([]);
  const [activeModel, setActiveModel] = useState<GridModelMeta | null>(null);
  const [buses, setBuses] = useState<BusData[]>([]);
  const [lines, setLines] = useState<LineData[]>([]);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [pfVariables, setPfVariablesState] = useState<ExtendedPowerFlowVariables>(DEFAULT_VARIABLES);
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
  const linesRef = useRef<LineData[]>([]);
  const activeModelRef = useRef<GridModelMeta | null>(null);
  const modelsRef = useRef<GridModelMeta[]>([]);
  const rawRowsRef = useRef<Map<string, any>>(new Map());
  const simSeqRef = useRef(0);
  const hydrateInFlightRef = useRef<{ id: string; promise: Promise<HydrateResult> } | null>(null);
  const autoRunRef = useRef(false);

  linesRef.current = lines;

  const persistModifications = useCallback(() => {
    const m = activeModelRef.current;
    if (m) {
      if (m.id) saveModelModifications(m.id, pfVariablesRef.current, trippedRef.current);
      if (m.name) saveModelModifications(m.name, pfVariablesRef.current, trippedRef.current);
    }
  }, []);

  const setPfVariables: React.Dispatch<React.SetStateAction<ExtendedPowerFlowVariables>> =
    useCallback(
      (action) => {
        const prev = pfVariablesRef.current;
        const next = typeof action === 'function' ? action(prev) : action;
        pfVariablesRef.current = next;
        setPfVariablesState(next);
        persistModifications();
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

  // Hydrate model into backend memory:
  // 1) POST /api/models/activate/{name}
  // 2) POST /api/models/load-payload using network_payload stored in Supabase grid_models table
  // 3) Download .m file from Supabase Storage and POST /api/models/upload
  const hydrateBackend = useCallback(async (model: GridModelMeta): Promise<HydrateResult> => {
    const names = uniq([model.name, model.id, model.name.replace(/\.m$/i, '')]);
    let reachedBackend = false;

    // 1. Check if backend already has it in memory
    for (const n of names) {
      try {
        const r = await callApi(`/api/models/activate/${encodeURIComponent(n)}`, { method: 'POST' });
        reachedBackend = true;
        if (r.ok) return { ok: true };
      } catch {}
    }

    // 2. Check Supabase grid_models row for network_payload (JSON topology)
    let rawRow = rawRowsRef.current.get(model.id) || rawRowsRef.current.get(model.name);
    if (!rawRow && supabase) {
      try {
        const { data: byId } = await supabase
          .from('grid_models')
          .select('*')
          .eq('id', model.id)
          .maybeSingle();
        if (byId) rawRow = byId;
        else {
          const { data: byName } = await supabase
            .from('grid_models')
            .select('*')
            .eq('name', model.name)
            .maybeSingle();
          if (byName) rawRow = byName;
        }
      } catch {}
    }

    const networkPayload =
      rawRow?.network_payload ??
      rawRow?.payload ??
      rawRow?.net_json ??
      rawRow?.topology_json ??
      rawRow?.data;

    if (networkPayload) {
      try {
        const loadRes = await callApi('/api/models/load-payload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: model.id,
            name: model.name,
            voltage_level: model.voltage_level || '330kV',
            domain: model.domain || 'Static & Dynamic',
            platform: model.platform || 'MATPOWER',
            network_payload: networkPayload,
          }),
        });
        reachedBackend = true;
        if (loadRes.ok) return { ok: true };
      } catch {}
    }

    // 3. Fallback: Download raw .m file from Supabase Storage bucket & upload to solver
    const { blob } = await downloadModelFile(model, rawRow);
    if (blob) {
      const fileName = /\.[a-z0-9]+$/i.test(model.name) ? model.name : `${model.name}.m`;
      try {
        const fd = new FormData();
        fd.append('file', blob, fileName);
        const up = await callApi('/api/models/upload', { method: 'POST', body: fd });
        if (up.ok) {
          // Cache network_payload back into Supabase grid_models row so future loads are instant
          if (up.body?.network_payload && supabase) {
            try {
              await supabase
                .from('grid_models')
                .update({ network_payload: up.body.network_payload })
                .eq('id', model.id);
            } catch {}
          }
          return { ok: true };
        }
      } catch (e: any) {
        return { ok: false, reason: describeNetworkError(e) };
      }
    }

    // 4. Check if backend has any default/fallback model loaded so the solver can still run
    try {
      const listRes = await callApi('/api/models', { method: 'GET' });
      if (listRes.ok && Array.isArray(listRes.body) && listRes.body.length > 0) {
        const firstId = listRes.body[0].id || listRes.body[0].name;
        const act = await callApi(`/api/models/activate/${encodeURIComponent(firstId)}`, {
          method: 'POST',
        });
        if (act.ok) return { ok: true };
      }
    } catch {}

    if (!reachedBackend) {
      return {
        ok: false,
        reason: 'Cannot reach the solver backend. It may be waking up — click Solve to retry.',
      };
    }

    return {
      ok: false,
      reason: `Model "${model.name}" needs to be hydrated in solver memory. Re-upload "${model.name}" once in the Upload tab to store its topology payload permanently.`,
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

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    let retrieved: GridModelMeta[] = [];
    const rawMap = new Map<string, any>();

    if (supabase) {
      try {
        const { data, error } = await supabase.from('grid_models').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          retrieved = data.map((row) => {
            const m = normalizeRawModel(row);
            rawMap.set(m.id, row);
            rawMap.set(m.name, row);
            return m;
          });
        }
      } catch (err) {
        console.warn('Supabase fetch notice:', err);
      }
    }

    if (retrieved.length === 0) {
      for (const base of BACKEND_URLS) {
        try {
          const res = await fetchWithTimeout(`${base}/api/models`);
          if (res.ok) {
            const json = await res.json();
            const list = Array.isArray(json) ? json : json.models || json.data || [];
            if (list.length > 0) {
              retrieved = list.map((row: any) => {
                const m = normalizeRawModel(row);
                rawMap.set(m.id, row);
                rawMap.set(m.name, row);
                return m;
              });
              break;
            }
          }
        } catch {}
      }
    }

    rawRowsRef.current = rawMap;

    if (retrieved.length > 0) {
      const savedId =
        typeof window !== 'undefined' ? localStorage.getItem('ml4ps_active_model_id') : null;
      const matched =
        retrieved.find((m) => m.id === savedId || m.name === savedId) ||
        retrieved.find((m) => m.is_active) ||
        retrieved[0];

      retrieved = retrieved.map((m) => ({ ...m, is_active: m.id === matched.id }));
      const activeEntry = retrieved.find((m) => m.id === matched.id) || matched;

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
    async (customVars?: any, customTrips?: any) => {
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

        const finite = (v: any, fallback: number) =>
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
          tripped_lines: tripsToRun.filter((id: any): id is number => typeof id === 'number'),
        };

        const post = () =>
          callApi('/api/simulations/power-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

        let result = await post();

        if (result.noModel && activeModelRef.current) {
          const h = await hydrateOnce(activeModelRef.current);
          if (!h.ok) {
            if (seq === simSeqRef.current) setDivergedNotice(h.reason || result.message);
            return;
          }
          result = await post();
        }

        if (seq !== simSeqRef.current) return;

        if (!result.ok) {
          setDivergedNotice(
            `Solver error (HTTP ${result.status})${result.message ? ': ' + result.message : ''}`
          );
          return;
        }

        const data = result.body;

        if (Array.isArray(data.buses) && data.buses.length > 0) setBuses(data.buses);
        if (Array.isArray(data.lines) && data.lines.length > 0) setLines(data.lines);

        setSummary({
          converged: data.converged ?? true,
          frequency: data.frequency ?? 50.0,
          total_gen_mw: data.total_gen_mw ?? 0.0,
          total_load_mw: data.total_load_mw ?? 0.0,
          total_losses_mw: data.total_losses_mw ?? 0.0,
          message: data.message,
        });

        if (data.converged === false || result.noModel) {
          setDivergedNotice(data.message || 'Power flow diverged.');
        } else {
          setDivergedNotice(null);
        }
      } catch (err: any) {
        if (seq === simSeqRef.current) setDivergedNotice(describeNetworkError(err));
      } finally {
        if (seq === simSeqRef.current) setLoading(false);
      }
    },
    [hydrateOnce]
  );

  const activateModel = useCallback(
    async (id: string) => {
      const target = modelsRef.current.find((m) => m.id === id || m.name === id);
      if (!target) {
        setDivergedNotice(`Model "${id}" was not found. Click Refresh and try again.`);
        return;
      }

      setLoading(true);
      setDivergedNotice(null);

      const switchingModel = activeModelRef.current?.id !== target.id;
      const activeEntry = { ...target, is_active: true };

      activeModelRef.current = activeEntry;
      setActiveModel(activeEntry);

      const nextModels = modelsRef.current.map((m) => ({ ...m, is_active: m.id === target.id }));
      modelsRef.current = nextModels;
      setModels(nextModels);

      if (typeof window !== 'undefined') {
        localStorage.setItem('ml4ps_active_model_id', target.id);
      }

      if (switchingModel) {
        setBuses([]);
        setLines([]);
        linesRef.current = [];
      }

      const saved =
        getStoredModelModifications(target.id) || getStoredModelModifications(target.name);
      const varsToApply = mergeVars(saved?.vars);
      const tripsToApply = Array.isArray(saved?.trips) ? saved!.trips : [];
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
      };

      const post = () =>
        callApi('/api/simulations/cascade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

      let r = await post();
      if (r.noModel && activeModelRef.current) {
        const h = await hydrateOnce(activeModelRef.current);
        if (!h.ok) throw new Error(h.reason || 'Model is not loaded on the solver.');
        r = await post();
      }
      if (!r.ok) {
        throw new Error(r.message || `Cascade simulation failed (HTTP ${r.status}).`);
      }
      return r.body as CascadeResult;
    },
    [hydrateOnce]
  );

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (autoRunRef.current || !activeModel) return;
    autoRunRef.current = true;
    const saved =
      getStoredModelModifications(activeModel.id) || getStoredModelModifications(activeModel.name);
    const vars = mergeVars(saved?.vars);
    const trips = Array.isArray(saved?.trips) ? saved!.trips : [];
    pfVariablesRef.current = vars;
    trippedRef.current = trips;
    setPfVariablesState(vars);
    setTrippedLines(trips);
    runSimulation(vars, trips);
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
        triggerCascade,
        applyCascadeTrips,
        resetPfVariables,
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