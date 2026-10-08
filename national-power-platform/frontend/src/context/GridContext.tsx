'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  BusData,
  LineData,
  GridModelMeta,
  PowerFlowVariables,
  CascadeResult,
} from '@/types/grid';

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

const GridContext = createContext<GridContextType | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-platform.onrender.com';

export const GridProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<GridModelMeta[]>([]);
  const [activeModel, setActiveModel] = useState<GridModelMeta | null>(null);
  const [buses, setBuses] = useState<BusData[]>([]);
  const [lines, setLines] = useState<LineData[]>([]);
  const [trippedLines, setTrippedLines] = useState<number[]>([]);
  const [pfVariables, setPfVariables] = useState<PowerFlowVariables>(DEFAULT_VARIABLES);
  const [loading, setLoading] = useState<boolean>(false);
  const [divergedNotice, setDivergedNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<PowerFlowSummary>({
    converged: true,
    frequency: 50.0,
    total_gen_mw: 0.0,
    total_load_mw: 0.0,
    total_losses_mw: 0.0,
  });

  // 1. Fetch available grid models from backend
  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models`);
      if (res.ok) {
        const data: GridModelMeta[] = await res.json();
        setModels(data);

        // Resolve active model from localStorage or default to first model
        const savedId = typeof window !== 'undefined' ? localStorage.getItem('ml4ps_active_model_id') : null;
        const matching = data.find((m) => m.id === savedId) || data.find((m) => m.is_active) || data[0];

        if (matching && (!activeModel || activeModel.id !== matching.id)) {
          setActiveModel(matching);
        }
      }
    } catch (err) {
      console.error('Failed to fetch grid models:', err);
    }
  }, [activeModel]);

  // 2. Run AC Power Flow solver
  const runSimulation = useCallback(
    async (customVars?: PowerFlowVariables, customTrips?: number[]) => {
      setLoading(true);
      setDivergedNotice(null);

      const varsToRun = customVars || pfVariables;
      const tripsToRun = customTrips !== undefined ? customTrips : trippedLines;

      try {
        const res = await fetch(`${API_BASE}/api/simulations/power-flow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pf_variables: varsToRun,
            tripped_lines: tripsToRun,
          }),
        });

        if (res.ok) {
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
            setDivergedNotice(data.message || 'Power flow diverged. Using continuation fallback approximation.');
          }
        }
      } catch (err: any) {
        setDivergedNotice(err.message || 'Connection to AC power flow solver failed.');
      } finally {
        setLoading(false);
      }
    },
    [pfVariables, trippedLines]
  );

  // 3. Activate model in memory
  const activateModel = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/models/${id}/activate`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.active_model) {
            setActiveModel(data.active_model);
            if (typeof window !== 'undefined') {
              localStorage.setItem('ml4ps_active_model_id', id);
            }
          }
          setTrippedLines([]);
          setPfVariables(DEFAULT_VARIABLES);
          await runSimulation(DEFAULT_VARIABLES, []);
          await fetchModels();
        }
      } catch (err) {
        console.error('Model activation failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [runSimulation, fetchModels]
  );

  // 4. Toggle N-1 Breaker
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

  // 5. Trigger Cascading Failure Sequence
  const triggerCascade = useCallback(
    async (initialTripped: number[], threshold: number): Promise<CascadeResult> => {
      const res = await fetch(`${API_BASE}/api/simulations/cascade`, {
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
      return await res.json();
    },
    [pfVariables]
  );

  const applyCascadeTrips = useCallback(
    (trippedList: number[]) => {
      setTrippedLines(trippedList);
      runSimulation(undefined, trippedList);
    },
    [runSimulation]
  );

  // Initial load
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
  if (!context) {
    throw new Error('useGrid must be used within a GridProvider');
  }
  return context;
};