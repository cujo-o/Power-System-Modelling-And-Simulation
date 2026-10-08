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

const BACKEND_URLS = [
  process.env.NEXT_PUBLIC_API_URL,
  'https://national-power-backend.onrender.com',
].filter(Boolean) as string[];

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

const GridContext = createContext<GridContextType | null>(null);

export const GridProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<GridModelMeta[]>([]);
  const [activeModel, setActiveModel] = useState<GridModelMeta | null>(null);
  const [buses, setBuses] = useState<BusData[]>([]);
  const [lines, setLines] = useState<LineData[]>([]);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [pfVariables, setPfVariables] = useState<ExtendedPowerFlowVariables>(DEFAULT_VARIABLES);
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

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    let retrieved: GridModelMeta[] = [];

    if (supabase) {
      try {
        const { data, error } = await supabase.from('grid_models').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          retrieved = data.map(normalizeRawModel);
        }
      } catch (err) {
        console.warn('Supabase fetch notice:', err);
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

      if (matched) setActiveModel(matched);
    } else {
      setActiveModel(null);
    }

    setModelsLoading(false);
  }, []);

  const runSimulation = useCallback(
    async (customVars?: any, customTrips?: any) => {
      setLoading(true);
      setDivergedNotice(null);

      const isRealPfVar =
        customVars &&
        typeof customVars === 'object' &&
        !('nativeEvent' in customVars) &&
        !('target' in customVars) &&
        ('loadMultiplier' in customVars || 'slackVoltagePu' in customVars);

      const varsToRun = isRealPfVar ? customVars : pfVariables;
      let tripsToRun = Array.isArray(customTrips) ? customTrips : trippedLines;

      // Automatically trip all lines incident to decommissioned sandbox buses
      if (varsToRun?.disabledBuses && varsToRun.disabledBuses.length > 0) {
        const busSet = new Set(varsToRun.disabledBuses);
        const incidentLines = lines
          .filter((l) => busSet.has(l.from_bus) || busSet.has(l.to_bus))
          .map((l) => l.id);
        tripsToRun = Array.from(new Set([...tripsToRun, ...incidentLines]));
      }

      const payload = {
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
        const res = await apiFetch('/api/simulations/power-flow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

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
            setDivergedNotice(data.message || 'Continuation power flow approximation in service.');
          }
        }
      } catch (err: any) {
        setDivergedNotice(err.message || 'Connecting to AC solver...');
      } finally {
        setLoading(false);
      }
    },
    [pfVariables, trippedLines, lines, apiFetch]
  );

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

      let inMemory = false;
      try {
        const resName = await apiFetch(`/api/models/activate/${encodeURIComponent(modelName)}`, { method: 'POST' });
        if (resName && resName.ok) inMemory = true;
      } catch {}

      if (!inMemory) {
        try {
          const resId = await apiFetch(`/api/models/activate/${encodeURIComponent(modelIdentifier)}`, { method: 'POST' });
          if (resId && resId.ok) inMemory = true;
        } catch {}
      }

      // Re-hydrate from Supabase Storage bucket if backend restarted
      if (!inMemory && supabase) {
        try {
          let fileBlob: Blob | null = null;
          const { data: d1 } = await supabase.storage.from('models').download(modelName);
          if (d1) fileBlob = d1;
          else {
            const { data: d2 } = await supabase.storage.from('models').download(`${modelIdentifier}.m`);
            if (d2) fileBlob = d2;
          }

          if (fileBlob) {
            const formData = new FormData();
            formData.append('file', fileBlob, modelName.endsWith('.m') ? modelName : `${modelName}.m`);
            const uploadRes = await apiFetch('/api/models/upload', { method: 'POST', body: formData });
            if (uploadRes && uploadRes.ok) inMemory = true;
          }
        } catch (e) {
          console.warn('Storage hydration notice:', e);
        }
      }

      setTrippedLines([]);
      setPfVariables(DEFAULT_VARIABLES);
      await runSimulation(DEFAULT_VARIABLES, []);
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

  // In-memory bus decommissioning (Sandbox only: leaves base case in database unchanged)
  const toggleBusService = useCallback(
    (busId: number) => {
      setPfVariables((prev) => {
        const disabled = prev.disabledBuses || [];
        const nextDisabled = disabled.includes(busId)
          ? disabled.filter((id) => id !== busId)
          : [...disabled, busId];

        const updatedVars = { ...prev, disabledBuses: nextDisabled };
        runSimulation(updatedVars);
        return updatedVars;
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
    runSimulation(DEFAULT_VARIABLES, []);
  }, [runSimulation]);

  const triggerCascade = useCallback(
    async (initialTripped: number[], threshold: number): Promise<CascadeResult> => {
      const payload = {
        initial_tripped_lines: initialTripped,
        overload_threshold_percent: threshold,
        max_cascade_steps: 8,
        load_multiplier: pfVariables.loadMultiplier,
        slack_voltage_pu: pfVariables.slackVoltagePu,
      };

      const res = await apiFetch('/api/simulations/cascade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
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
    if (activeModel?.id && buses.length === 0) {
      activateModel(activeModel.id);
    }
  }, [activeModel?.id, buses.length]);

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