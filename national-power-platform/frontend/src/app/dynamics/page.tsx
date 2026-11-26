'use client';

import React, { useState } from 'react';
import { useGrid } from '@/context/GridContext';
import { DynamicsTab } from '@/components/tabs/DynamicsTab';
import { DynamicSimResult, MultiMachineResult } from '@/types/grid';
import { describeNetworkError } from '@/lib/apiClient';

export default function DynamicsPage() {
  const { buses, activeModel, callWithHydration } = useGrid();
  const modelKey = activeModel?.id || '';
  const [dynState, setDynState] = useState<{
    modelId: string;
    result: DynamicSimResult | null;
    error: string | null;
  }>({ modelId: '', result: null, error: null });
  const [dynLoading, setDynLoading] = useState(false);

  const dynResult = dynState.modelId === modelKey ? dynState.result : null;
  const dynError = dynState.modelId === modelKey ? dynState.error : null;

  const handleRunSimulation = async (params: {
    disturbance_mw: number;
    inertia_constant_H: number;
    enable_governor: boolean;
    droop_R: number;
    enable_pss: boolean;
    pss_gain_K: number;
    enable_ufls: boolean;
  }) => {
    setDynLoading(true);
    setDynState({ modelId: modelKey, result: dynResult, error: null });
    try {
      const res = await callWithHydration<DynamicSimResult>('/api/simulations/dynamics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        setDynState({
          modelId: modelKey,
          result: null,
          error: res.message || `Dynamics solver failed (HTTP ${res.status}).`,
        });
        return;
      }
      setDynState({ modelId: modelKey, result: res.body, error: null });
    } catch (err) {
      setDynState({ modelId: modelKey, result: null, error: describeNetworkError(err) });
    } finally {
      setDynLoading(false);
    }
  };

  const handleRunMultiMachine = async (params: {
    fault_bus_id: number;
    fault_duration_ms: number;
  }): Promise<MultiMachineResult> => {
    const res = await callWithHydration<MultiMachineResult>('/api/simulations/multi-machine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(res.message || `Multi-machine solver failed (HTTP ${res.status}).`);
    }
    return res.body;
  };

  return (
    <DynamicsTab
      key={modelKey}
      dynResult={dynResult}
      dynLoading={dynLoading}
      dynError={dynError}
      onRunSimulation={handleRunSimulation}
      buses={buses}
      onRunMultiMachine={handleRunMultiMachine}
    />
  );
}
