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

// ============================================================================
// CONFIG
// ============================================================================

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hoggydryloidupqprwpl.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

/**
 * Name of the Supabase Storage bucket that holds the uploaded .m files.
 * SET THIS in Vercel (Project -> Settings -> Environment Variables) as
 * NEXT_PUBLIC_SUPABASE_BUCKET. If it is missing, the code falls back to
 * guessing common bucket names (which is what was producing the 400 errors).
 */
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

const REQUEST_TIMEOUT_MS = 45_000; // Render free tier can take ~30-50s to wake up
const GATEWAY_STATUSES = new Set([502, 503, 504]);

// Matches backend messages such as "No model active in memory - select the model."
const NO_MODEL_RE =
  /no\s+(active\s+)?model|model\s+(is\s+)?not\s+(loaded|active)|no\s+network\s+(loaded|active)|select\s+(a|the)\s+model/i;

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// HELPERS
// ============================================================================

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
  try {
    const raw = localStorage.getItem(`ml4ps_modifications_${modelKey}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveModelModifications(modelKey: string, vars: ExtendedPowerFlowVariables, trips: number[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`ml4ps_modifications_${modelKey}`, JSON.stringify({ vars, trips }));
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

/**
 * Talks to the solver backend. Tries every backend URL, retries on gateway errors
 * (Render returns 502/503/504 while a sleeping free-tier service is waking up),
 * and times out instead of hanging forever.
 */
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
      if (attempt === 0) await sleep(3000);
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
    // Backend signals: power-flow -> message text; cascade -> status "NO_MODEL"; load-sharing -> model_name "No Active Model"
    noModel:
      NO_MODEL_RE.test(message) ||
      body?.status === 'NO_MODEL' ||
      body?.model_name === 'No Active Model',
  };
}

function describeNetworkError(err: any): string {
  if (err?.name === 'AbortError') {
    return 'The solver took too long to respond (the backend may be waking up). Press Solve to retry.';
  }
  return 'Cannot reach the solver backend. Check your connection and press Solve to retry.';
}

/**
 * Finds the model's .m file in Supabase Storage.
 * Order: URLs stored on the table row -> authenticated download -> public URL.
 * Reads bucket/path hints from the grid_models row when they exist, so we do not
 * have to guess. Remembers the bucket that worked.
 */
/**
 * The solver's POST /api/models/load-payload rebuilds a network from pandapower JSON.
 * That JSON is saved on the grid_models row (upload returns it as `network_payload`).
 * Column names vary, so check the usual ones, then anything that looks like a network blob.
 */
const PAYLOAD_KEYS = [
  'network_payload',
  'payload',
  'network_json',
  'net_json',
  'pandapower_json',
  'pandapower_net',
  'network',
  'topology',
  'net',
];

function findNetworkPayload(row: any): { key: string; value: any } | null {
  if (!row || typeof row !== 'object') return null;
  const usable = (v: any) =>
    (typeof v === 'string' && v.length > 50) ||
    (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0);

  for (const k of PAYLOAD_KEYS) {
    if (usable(row[k])) return { key: k, value: row[k] };
  }
  for (const k of Object.keys(row)) {
    if (/payload|network|topology|net_?json|pandapower/i.test(k) && usable(row[k])) {
      return { key: k, value: row[k] };
    }
  }
  return null;
}

async function downloadModelFile(
  model: GridModelMeta,
  row: any
): Promise<{ blob: Blob | null; tried: string[] }> {
  const tried: string[] = [];
  const r = row || {};

  // 1. Full URLs saved on the table row
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
  if (!sb) {
    tried.push('Supabase client unavailable (NEXT_PUBLIC_SUPABASE_ANON_KEY is not set)');
    return { blob: null, tried };
  }

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

      // A missing bucket will fail for every path, so skip the rest of its paths.
      if (/bucket not found/i.test(msg)) break;

      // Public buckets without a SELECT policy reject download() but allow the public URL.
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

  // 3. Last resort: search each bucket for the file instead of guessing its path.
  const stem = baseName.replace(/\.[^.]+$/, '').toLowerCase();
  for (const bucket of buckets) {
    try {
      const { data: items, error } = await sb.storage.from(bucket).list('', { limit: 100, search: stem });
      if (error || !items?.length) continue;
      const hit =
        items.find((i) => i.name.toLowerCase() === withExt.toLowerCase()) ||
        items.find((i) => i.name.toLowerCase().startsWith(stem));
      if (!hit) continue;
      const { data: dl } = await sb.storage.from(bucket).download(hit.name);
      let blob: Blob | null = dl || null;
      if (!blob) {
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(hit.name);
        const res = pub?.publicUrl ? await fetch(pub.publicUrl).catch(() => null) : null;
        if (res && res.ok) blob = await res.blob();
      }
      if (blob) {
        if (typeof window !== 'undefined') localStorage.setItem('ml4ps_storage_bucket', bucket);
        return { blob, tried };
      }
      tried.push(`${bucket}/${hit.name} -> found by search but not readable (check bucket policy)`);
    } catch {}
  }

  return { blob: null, tried };
}

// ============================================================================
// PROVIDER
// ============================================================================

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

  // Refs always hold the LATEST values. Callbacks read from these, so they never
  // run with stale state (this was why edits sometimes simulated the old values).
  const pfVariablesRef = useRef<ExtendedPowerFlowVariables>(DEFAULT_VARIABLES);
  const trippedRef = useRef<number[]>([]);
  const linesRef = useRef<LineData[]>([]);
  const activeModelRef = useRef<GridModelMeta | null>(null);
  const modelsRef = useRef<GridModelMeta[]>([]);
  const rawRowsRef = useRef<Map<string, any>>(new Map());
  const simSeqRef = useRef(0);
  const hydrateInFlightRef = useRef<{ id: string; promise: Promise<HydrateResult> } | null>(null);
  const hydrateFailedRef = useRef<Map<string, { at: number; reason?: string }>>(new Map());
  const autoRunRef = useRef(false);

  linesRef.current = lines;

  const persistModifications = useCallback(() => {
    const m = activeModelRef.current;
    const key = m?.id || m?.name;
    if (key) saveModelModifications(key, pfVariablesRef.current, trippedRef.current);
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

  // --------------------------------------------------------------------------
  // Make sure the backend actually has this model loaded in memory.
  // Render's free tier wipes memory when it sleeps/restarts, which is what caused
  // "No model active in memory - select the model".
  // --------------------------------------------------------------------------
  const hydrateBackend = useCallback(async (model: GridModelMeta): Promise<HydrateResult> => {
    const names = uniq([model.name, model.id]);
    let reachedBackend = false;

    // 1. Ask the backend to activate a model it already has.
    for (const n of names) {
      try {
        const r = await callApi(`/api/models/activate/${encodeURIComponent(n)}`, { method: 'POST' });
        reachedBackend = true;
        if (r.ok) return { ok: true };
      } catch {}
    }

    if (!reachedBackend) {
      return {
        ok: false,
        reason: 'Cannot reach the solver backend. It may be waking up - press Solve to retry.',
      };
    }

    // 2. Backend lost it: rebuild it from the network JSON saved on the Supabase row
    //    (this is exactly what the solver's /api/models/load-payload endpoint is for).
    let row = rawRowsRef.current.get(model.id);
    let found = findNetworkPayload(row);

    if (!found && supabase) {
      // The cached row may not include the payload column; ask for this one row directly.
      try {
        const { data } = await supabase.from('grid_models').select('*').eq('id', model.id).maybeSingle();
        if (data) {
          row = data;
          rawRowsRef.current.set(model.id, data);
          found = findNetworkPayload(data);
        }
      } catch {}
    }

    if (found) {
      try {
        const lp = await callApi('/api/models/load-payload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: model.id,
            name: model.name,
            voltage_level: model.voltage_level,
            domain: model.domain,
            platform: model.platform,
            network_payload: found.value,
          }),
        });
        if (lp.ok) return { ok: true };
        return {
          ok: false,
          reason: `The solver rejected the saved network for "${model.name}" (HTTP ${lp.status})${lp.message ? ': ' + lp.message : ''}`,
        };
      } catch (e: any) {
        return { ok: false, reason: describeNetworkError(e) };
      }
    }

    // 3. No saved network JSON on the row: fall back to a .m file in Supabase Storage.
    const { blob, tried } = await downloadModelFile(model, row);
    if (!blob) {
      console.warn(
        '[ml4ps] No network payload on the grid_models row and no file in Storage. Row columns:',
        row ? Object.keys(row) : '(row not found)',
        'Storage attempts:',
        tried
      );
      return {
        ok: false,
        reason:
          `The solver restarted and lost "${model.name}", and no saved copy of its network was found ` +
          `(looked for a network_payload column on the grid_models row, then Supabase Storage). ` +
          `Re-upload the model in Upload & Ingestion and make sure its network_payload is saved to Supabase.`,
      };
    }

    const fileName = /\.[a-z0-9]+$/i.test(model.name) ? model.name : `${model.name}.m`;
    try {
      const fd = new FormData();
      fd.append('file', blob, fileName);
      const up = await callApi('/api/models/upload', { method: 'POST', body: fd });
      if (!up.ok) {
        return {
          ok: false,
          reason: `Uploading the model to the solver failed (HTTP ${up.status})${up.message ? ': ' + up.message : ''}`,
        };
      }
    } catch (e: any) {
      return { ok: false, reason: describeNetworkError(e) };
    }

    // 4. Make sure the freshly uploaded model is the active one (ignore failures: upload may auto-activate).
    for (const n of names) {
      try {
        const r = await callApi(`/api/models/activate/${encodeURIComponent(n)}`, { method: 'POST' });
        if (r.ok) break;
      } catch {}
    }
    return { ok: true };
  }, []);

  // Dedupes concurrent hydrations (e.g. auto-run and a button click at the same time).
  // After a failure, don't hammer Supabase/Render again for 60 s (every slider tweak would retry otherwise).
  const hydrateOnce = useCallback(
    (model: GridModelMeta, force = false): Promise<HydrateResult> => {
      const inFlight = hydrateInFlightRef.current;
      if (inFlight && inFlight.id === model.id) return inFlight.promise;

      const failed = hydrateFailedRef.current.get(model.id);
      if (!force && failed && Date.now() - failed.at < 60_000) {
        return Promise.resolve({ ok: false, reason: failed.reason });
      }

      const promise = hydrateBackend(model)
        .then((r) => {
          if (r.ok) hydrateFailedRef.current.delete(model.id);
          else hydrateFailedRef.current.set(model.id, { at: Date.now(), reason: r.reason });
          return r;
        })
        .finally(() => {
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
            return m;
          });
        } else if (error) {
          console.warn('Supabase grid_models query failed:', error.message);
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

      // Keep the list and the active model consistent so the UI shows the right one as active.
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

  // --------------------------------------------------------------------------
  // Power flow
  // --------------------------------------------------------------------------
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

        const varsToRun: ExtendedPowerFlowVariables = isRealPfVar ? customVars : pfVariablesRef.current;
        let tripsToRun: number[] = Array.isArray(customTrips) ? customTrips : trippedRef.current;

        if (varsToRun?.disabledBuses && varsToRun.disabledBuses.length > 0) {
          const busSet = new Set(varsToRun.disabledBuses);
          const incidentLines = linesRef.current
            .filter((l) => busSet.has(l.from_bus) || busSet.has(l.to_bus))
            .map((l) => l.id);
          tripsToRun = Array.from(new Set([...tripsToRun, ...incidentLines]));
        }

        const finite = (v: any, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
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

        // Self-heal: backend forgot the model (restart) -> reload it and retry once.
        if (result.noModel && activeModelRef.current) {
          const h = await hydrateOnce(activeModelRef.current);
          if (!h.ok) {
            if (seq === simSeqRef.current) setDivergedNotice(h.reason || result.message);
            return;
          }
          result = await post();
        }

        if (seq !== simSeqRef.current) return; // a newer run superseded this one

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

  // --------------------------------------------------------------------------
  // Activate (select) a model
  // --------------------------------------------------------------------------
  const activateModel = useCallback(
    async (id: string) => {
      const target = modelsRef.current.find((m) => m.id === id || m.name === id);
      if (!target) {
        setDivergedNotice(`Model "${id}" was not found in the registry. Press Refresh and try again.`);
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

      // Do not show the previous model's network while the new one loads.
      if (switchingModel) {
        setBuses([]);
        setLines([]);
        linesRef.current = [];
      }

      // Load saved edits for this model.
      const saved =
        getStoredModelModifications(target.id) || getStoredModelModifications(target.name);
      const varsToApply = mergeVars(saved?.vars);
      const tripsToApply = Array.isArray(saved?.trips) ? saved!.trips : [];
      pfVariablesRef.current = varsToApply;
      trippedRef.current = tripsToApply;
      setPfVariablesState(varsToApply);
      setTrippedLines(tripsToApply);

      try {
        const h = await hydrateOnce(target, true);
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

  // --------------------------------------------------------------------------
  // Edits
  // --------------------------------------------------------------------------
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
    const key = m?.id || m?.name;
    if (key && typeof window !== 'undefined') {
      localStorage.removeItem(`ml4ps_modifications_${key}`);
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
      if (!r.ok || r.noModel) {
        throw new Error(
          r.noModel
            ? 'The solver has no model loaded. Press Solve to reload it, then run the sequence again.'
            : r.message || `Cascade simulation failed (HTTP ${r.status}).`
        );
      }
      return r.body as CascadeResult;
    },
    [hydrateOnce]
  );

  // --------------------------------------------------------------------------
  // Startup: load the registry, then re-load the last-used model into the solver
  // so the workspace has data without the user having to click anything.
  // --------------------------------------------------------------------------
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (autoRunRef.current || !activeModel) return;
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('ml4ps_active_model_id')) return; // user never opened a model

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