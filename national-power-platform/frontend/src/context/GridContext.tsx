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

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
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
  'https://national-power-platform.onrender.com',
].filter(Boolean) as string[];

// Type-safe normalizer mapping Supabase rows to GridModelMeta (No hardcoded models)
function normalizeRawModel(m: any): GridModelMeta {
  const vLevel =
    m.voltage_level ||
    m.voltage_class ||
    (m.name?.includes('132') ? '132kV' : m.name?.includes('130') ? '130kV' : '330kV');

  return {
    id: String(m.id || m.name || Math.random().toString(36).substring(7)),
    name: String(m.name || m.filename || 'Unnamed Model'),
    voltage_level: String(vLevel),
    platform: String(m.platform || m.format || 'MATPOWER'),
    buses: Number(m.buses ?? m.bus_count ?? m.num_buses ?? 0),
    branches: Number(m.branches ?? m.branch_count ?? m.num_branches ?? m.line_count ?? 0),
    total_installed_mw: Number(m.total_installed_mw ?? m.total_capacity_mw ?? m.installed_capacity ?? 0),
    total_demand_mw: Number(m.total_demand_mw ?? m.demand_mw ?? 0),
    domain: String(m.domain || (m.name?.toLowerCase().includes('dynamic') ? 'Dynamic & Transient' : 'Static Power Flow')),
    converged: Boolean(m.converged ?? m.power_flow_converged ?? m.is_converged ?? true),
    is_default: Boolean(m.is_default ?? m.default ?? false),
    is_active: Boolean(m.is_active),
  };
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
    for (const base of BACKEND_URLS) {
      try {
        const cleanBase = base.replace(/\/+$/, '');
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const res = await fetch(`${cleanBase}${cleanPath}`, options);
        if (res.ok || res.status === 400 || res.status === 422) {
          return res;
        }
      } catch {
        // Fallback
      }
    }
    throw new Error('Connection to power simulation backend failed.');
  }, []);

  // Fetch only what exists in Supabase (Database tables or Storage) and backend
  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    let fetchedList: GridModelMeta[] = [];

    // 1. Query Supabase Database Table: 'models'
    if (supabase) {
      try {
        const { data, error } = await supabase.from('models').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          fetchedList = data.map(normalizeRawModel);
        }
      } catch (err) {
        console.warn('Supabase models table query:', err);
      }

      // 2. Query Supabase Database Table: 'grid_models'
      if (fetchedList.length === 0) {
        try {
          const { data, error } = await supabase.from('grid_models').select('*');
          if (!error && Array.isArray(data) && data.length > 0) {
            fetchedList = data.map(normalizeRawModel);
          }
        } catch (err) {
          console.warn('Supabase grid_models table query:', err);
        }
      }

      // 3. Query Supabase Storage Bucket: 'models'
      if (fetchedList.length === 0) {
        try {
          const { data, error } = await supabase.storage.from('models').list();
          if (!error && Array.isArray(data) && data.length > 0) {
            fetchedList = data
              .filter((f) => f.name && !f.name.startsWith('.'))
              .map((f) =>
                normalizeRawModel({
                  id: f.id || f.name,
                  name: f.name,
                })
              );
          }
        } catch (err) {
          console.warn('Supabase storage query:', err);
        }
      }
    }

    // 4. Fallback: Query backend API /api/models
    if (fetchedList.length === 0) {
      for (const base of BACKEND_URLS) {
        try {
          const cleanBase = base.replace(/\/+$/, '');
          const res = await fetch(`${cleanBase}/api/models`);
          if (res.ok) {
            const json = await res.json();
            const list = Array.isArray(json) ? json : json.models || json.data || [];
            if (list.length > 0) {
              fetchedList = list.map(normalizeRawModel);
              break;
            }
          }
        } catch {}
      }
    }

    setModels(fetchedList);

    if (fetchedList.length > 0) {
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('ml4ps_active_model_id') : null;
      const matched =
        fetchedList.find((m) => m.id === savedId) ||
        fetchedList.find((m) => m.is_active) ||
        fetchedList[0];

      if (matched) setActiveModel(matched);
    } else {
      setActiveModel(null);
    }

    setModelsLoading(false);
  }, []);

  // Run AC Power Flow
  const runSimulation = useCallback(
    async (customVars?: PowerFlowVariables, customTrips?: number[]) => {
      setLoading(true);
      setDivergedNotice(null);

      const varsToRun = customVars || pfVariables;
      const tripsToRun = customTrips !== undefined ? customTrips : trippedLines;

      try {
        let res: Response | null = null;
        try {
          res = await apiFetch('/api/simulations/power-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pf_variables: varsToRun,
              tripped_lines: tripsToRun,
            }),
          });
        } catch {
          res = await apiFetch('/simulations/power-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pf_variables: varsToRun,
              tripped_lines: tripsToRun,
            }),
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
    [pfVariables, trippedLines, apiFetch]
  );

  const activateModel = useCallback(
    async (id: string) => {
      setLoading(true);

      setModels((prev) =>
        prev.map((m) => ({
          ...m,
          is_active: m.id === id,
        }))
      );

      const match = models.find((m) => m.id === id);
      if (match) {
        setActiveModel({ ...match, is_active: true });
        if (typeof window !== 'undefined') {
          localStorage.setItem('ml4ps_active_model_id', id);
        }
      }

      try {
        let res: Response | null = null;
        try {
          res = await apiFetch(`/api/models/${id}/activate`, { method: 'POST' });
        } catch {
          res = await apiFetch(`/models/${id}/activate`, { method: 'POST' });
        }

        if (res && res.ok) {
          const data = await res.json();
          if (data.active_model) setActiveModel(data.active_model);
          setTrippedLines([]);
          setPfVariables(DEFAULT_VARIABLES);
          await runSimulation(DEFAULT_VARIABLES, []);
        }
      } catch {
        await runSimulation(DEFAULT_VARIABLES, []);
      } finally {
        setLoading(false);
      }
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
      let res: Response | null = null;
      try {
        res = await apiFetch('/api/simulations/cascade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initial_tripped_lines: initialTripped,
            overload_threshold_percent: threshold,
            max_cascade_steps: 8,
            load_multiplier: pfVariables.loadMultiplier,
            slack_voltage_pu: pfVariables.slackVoltagePu,
          }),
        });
      } catch {
        res = await apiFetch('/simulations/cascade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initial_tripped_lines: initialTripped,
            overload_threshold_percent: threshold,
            max_cascade_steps: 8,
            load_multiplier: pfVariables.loadMultiplier,
            slack_voltage_pu: pfVariables.slackVoltagePu,
          }),
        });
      }
      return await res.json();
    },
    [pfVariables, apiFetch]
  );

  const applyCascadeTrips = useCallback(
    (trippedList: number[]) => {
      setTrippedLines(trippedList);
      runSimulation(undefined, trippedList);
    },
    [runSimulation]
  );

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (activeModel) {
      runSimulation();
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