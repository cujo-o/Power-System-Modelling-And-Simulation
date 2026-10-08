'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  BusData,
  LineData,
  GridModelMeta,
  PowerFlowVariables,
  CascadeResult,
} from '@/types/grid';

// Initialize Supabase Client pointing to your project (hoggydryloidupqprwpl)
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hoggydryloidupqprwpl.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

interface PowerFlowSummary {
  converged: boolean;
  frequency: number;
  total_gen_mw: number;
  total_load_mw: number;
  total_losses_mw: number;
  message?: string | null;
}

interface GridContextType {
  models: GridModelMeta[];
  activeModel: GridModelMeta | null;
  buses: BusData[];
  lines: LineData[];
  trippedLines: number[];
  pfVariables: PowerFlowVariables;
  summary: PowerFlowSummary;
  loading: boolean;
  modelsLoading: boolean;
  divergedNotice: string | null;
  setPfVariables: React.Dispatch<React.SetStateAction<PowerFlowVariables>>;
  toggleLine: (id: number) => void;
  resetTrippedLines: () => void;
  runSimulation: (customVars?: PowerFlowVariables, customTrips?: number[]) => Promise<void>;
  activateModel: (id: string) => Promise<void>;
  fetchModels: () => Promise<void>;
  triggerCascade: (initialTripped: number[], threshold: number) => Promise<CascadeResult>;
  applyCascadeTrips: (trippedList: number[]) => void;
  resetPfVariables: () => void;
}

const DEFAULT_VARIABLES: PowerFlowVariables = {
  loadMultiplier: 1.0,
  targetPowerFactor: 0.9,
  slackVoltagePu: 1.05,
  shuntMvarCompensation: 0,
  thermalDeratingFactor: 1.0,
  newBuses: [],
  newLines: [],
  newGenerators: [],
};

const BACKEND_URLS = [
  process.env.NEXT_PUBLIC_API_URL,
  'https://national-power-backend.onrender.com',
].filter(Boolean) as string[];

// Dynamic normalizer mapping Supabase grid_models table columns
function normalizeRawModel(m: any): GridModelMeta {
  const vLevel =
    m?.voltage_level ||
    m?.voltage_class ||
    (m?.name?.includes('132') ? '132kV' : m?.name?.includes('130') ? '130kV' : '330kV');

  const domain =
    m?.domain ||
    (m?.name?.toLowerCase().includes('dynamic')
      ? 'Dynamic & Transient'
      : 'Static Power Flow');

  const totalCap =
    m?.total_installed_mw ??
    m?.total_capacity_mw ??
    m?.installed_capacity ??
    m?.capacity_mw ??
    0;

  const rawObj: any = {
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
  };

  return rawObj as GridModelMeta;
}

const GridContext = createContext<GridContextType | null>(null);

export const GridProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<GridModelMeta[]>([]);
  const [activeModel, setActiveModel] = useState<GridModelMeta | null>(null);
  const [buses, setBuses] = useState<BusData[]>([]);
  const [lines, setLines] = useState<LineData[]>([]);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [pfVariables, setPfVariables] = useState<PowerFlowVariables>(DEFAULT_VARIABLES);
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

  const apiFetch = useCallback(async (path: string, options?: RequestInit) => {
    let lastError: any = null;
    for (const base of BACKEND_URLS) {
      try {
        const cleanBase = base.replace(/\/+$/, '');
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const res = await fetch(`${cleanBase}${cleanPath}`, options);
        return res;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Connection to backend failed.');
  }, []);

  // Fetch models directly from Supabase table: grid_models
  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    let retrieved: GridModelMeta[] = [];

    if (supabase) {
      try {
        const { data, error } = await supabase.from('grid_models').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          retrieved = data.map(normalizeRawModel);
        } else if (error) {
          console.warn('Supabase grid_models query notice:', error.message);
        }
      } catch (err) {
        console.warn('Supabase grid_models query error:', err);
      }
    }

    if (retrieved.length === 0) {
      for (const base of BACKEND_URLS) {
        try {
          const cleanBase = base.replace(/\/+$/, '');
          const res = await fetch(`${cleanBase}/api/models`);
          if (res.ok) {
            const json = await res.json();
            const list = Array.isArray(json) ? json : json.models || json.data || [];
            if (list.length > 0) {
              retrieved = list.map(normalizeRawModel);
              break;
            }
          }
        } catch {}
      }
    }

    setModels(retrieved);

    if (retrieved.length > 0) {
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('ml4ps_active_model_id') : null;
      const matched =
        retrieved.find((m) => m.id === savedId || m.name === savedId) ||
        retrieved.find((m) => m.is_active) ||
        retrieved[0];

      if (matched) {
        setActiveModel(matched);
      }
    } else {
      setActiveModel(null);
    }

    setModelsLoading(false);
  }, []);

  // Run AC Power Flow (passes active model identifiers to solve the active network)
  const runSimulation = useCallback(
    async (customVars?: any, customTrips?: any, overrideModelId?: string, overrideModelName?: string) => {
      setLoading(true);
      setDivergedNotice(null);

      const isRealPfVar =
        customVars &&
        typeof customVars === 'object' &&
        !('nativeEvent' in customVars) &&
        !('target' in customVars) &&
        ('loadMultiplier' in customVars || 'slackVoltagePu' in customVars);

      const varsToRun = isRealPfVar ? customVars : pfVariables;
      const tripsToRun = Array.isArray(customTrips) ? customTrips : trippedLines;

      const activeId = overrideModelId || activeModel?.id;
      const activeName = overrideModelName || activeModel?.name;

      const payload = {
        model_id: activeId,
        model_name: activeName,
        filename: activeName,
        pf_variables: {
          loadMultiplier: Number(varsToRun?.loadMultiplier ?? 1.0),
          targetPowerFactor: Number(varsToRun?.targetPowerFactor ?? 0.9),
          slackVoltagePu: Number(varsToRun?.slackVoltagePu ?? 1.05),
          shuntMvarCompensation: Number(varsToRun?.shuntMvarCompensation ?? 0.0),
          thermalDeratingFactor: Number(varsToRun?.thermalDeratingFactor ?? 1.0),
          newBuses: Array.isArray(varsToRun?.newBuses) ? varsToRun.newBuses : [],
          newLines: Array.isArray(varsToRun?.newLines) ? varsToRun.newLines : [],
          newGenerators: Array.isArray(varsToRun?.newGenerators) ? varsToRun.newGenerators : [],
        },
        tripped_lines: tripsToRun.filter((id: any): id is number => typeof id === 'number'),
      };

      try {
        let res: Response | null = null;
        try {
          res = await apiFetch('/api/simulations/power-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch {
          res = await apiFetch('/simulations/power-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }

        if (res && res.ok) {
          const data = await res.json();
          setBuses(data.buses || []);
          setLines(data.lines || []);
          setSummary({
            converged: data.converged ?? true,
            frequency: data.frequency ?? 50.0,
            total_gen_mw: data.total_gen_mw ?? 0.0,
            total_load_mw: data.total_load_mw ?? 0.0,
            total_losses_mw: data.total_losses_mw ?? 0.0,
            message: data.message,
          });

          if (!data.converged || data.message) {
            setDivergedNotice(data.message || 'Power flow diverged. Using continuation fallback.');
          }
        }
      } catch (err: any) {
        setDivergedNotice(err.message || 'Connecting to AC solver...');
      } finally {
        setLoading(false);
      }
    },
    [pfVariables, trippedLines, activeModel, apiFetch]
  );

  // Activate model: Prioritizes GET /api/models/{id}/activate to resolve HTTP 405
  const activateModel = useCallback(
    async (id: string) => {
      setLoading(true);

      const targetModel = models.find((m) => m.id === id || m.name === id);
      const modelIdentifier = targetModel ? targetModel.id : id;
      const modelName = targetModel ? targetModel.name : id;

      setModels((prev) =>
        prev.map((m) => ({
          ...m,
          is_active: m.id === modelIdentifier || m.name === modelName,
        }))
      );

      if (targetModel) {
        setActiveModel({ ...targetModel, is_active: true });
        if (typeof window !== 'undefined') {
          localStorage.setItem('ml4ps_active_model_id', modelIdentifier);
        }
      }

      if (supabase) {
        try {
          await supabase.from('grid_models').update({ is_active: false }).neq('id', '');
          await supabase.from('grid_models').update({ is_active: true }).eq('id', modelIdentifier);
        } catch {}
      }

      let activatedData: any = null;

      // Ordered candidates: GET requests on hex ID placed first to prevent 405
      const candidateRequests = [
        { path: `/api/models/${encodeURIComponent(modelIdentifier)}/activate`, method: 'GET' },
        { path: `/api/models/${encodeURIComponent(modelIdentifier)}`, method: 'GET' },
        { path: `/api/models/activate?model_id=${encodeURIComponent(modelIdentifier)}`, method: 'GET' },
        { path: `/api/models/activate?name=${encodeURIComponent(modelName)}`, method: 'GET' },
        { path: `/api/models/${encodeURIComponent(modelIdentifier)}/activate`, method: 'POST' },
        { path: `/api/models/${encodeURIComponent(modelName)}/activate`, method: 'GET' },
        { path: `/api/models/${encodeURIComponent(modelName)}`, method: 'GET' },
        { path: `/models/${encodeURIComponent(modelIdentifier)}/activate`, method: 'GET' },
        {
          path: `/api/models/activate`,
          method: 'POST',
          body: JSON.stringify({ model_id: modelIdentifier, model_name: modelName, filename: modelName }),
        },
      ];

      for (const req of candidateRequests) {
        try {
          const res = await apiFetch(req.path, {
            method: req.method,
            headers: req.body ? { 'Content-Type': 'application/json' } : undefined,
            body: req.body,
          });

          if (res.ok) {
            const data = await res.json();
            activatedData = data;
            break;
          }
        } catch {
          // Continue to next candidate
        }
      }

      if (activatedData) {
        if (activatedData.active_model) setActiveModel(activatedData.active_model);
        if (Array.isArray(activatedData.buses) && activatedData.buses.length > 0) {
          setBuses(activatedData.buses);
        }
        if (Array.isArray(activatedData.lines) && activatedData.lines.length > 0) {
          setLines(activatedData.lines);
        }
      }

      setTrippedLines([]);
      setPfVariables(DEFAULT_VARIABLES);

      // Solve AC power flow with the newly activated model
      await runSimulation(DEFAULT_VARIABLES, [], modelIdentifier, modelName);
      setLoading(false);
    },
    [models, apiFetch, runSimulation]
  );

  const toggleLine = useCallback(
    (id: number) => {
      setTrippedLines((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        runSimulation(undefined, next);
        return next;
      });
    },
    [runSimulation]
  );

  const resetTrippedLines = useCallback(() => {
    setTrippedLines([]);
    runSimulation(undefined, []);
  }, [runSimulation]);

  const resetPfVariables = useCallback(() => {
    setPfVariables(DEFAULT_VARIABLES);
    runSimulation(DEFAULT_VARIABLES, trippedLines);
  }, [runSimulation, trippedLines]);

  const triggerCascade = useCallback(
    async (initialTripped: number[], threshold: number): Promise<CascadeResult> => {
      const payload = {
        model_id: activeModel?.id,
        model_name: activeModel?.name,
        initial_tripped_lines: initialTripped,
        overload_threshold_percent: threshold,
        max_cascade_steps: 8,
        load_multiplier: pfVariables.loadMultiplier,
        slack_voltage_pu: pfVariables.slackVoltagePu,
      };

      let res: Response | null = null;
      try {
        res = await apiFetch('/api/simulations/cascade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        res = await apiFetch('/simulations/cascade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      return await res.json();
    },
    [pfVariables, activeModel, apiFetch]
  );

  const applyCascadeTrips = useCallback(
    (trippedList: number[]) => {
      setTrippedLines(trippedList);
      runSimulation(undefined, trippedList);
    },
    [runSimulation]
  );

  // Fetch registered cases on mount
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // When activeModel is resolved, activate it in solver memory
  useEffect(() => {
    if (activeModel?.id) {
      if (buses.length === 0) {
        activateModel(activeModel.id);
      } else {
        runSimulation();
      }
    }
  }, [activeModel?.id]);

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