'use client';

import React, { useState } from 'react';
import { useGrid } from '@/context/GridContext';
import { DynamicsTab } from '@/components/tabs/DynamicsTab';
import { DynamicSimResult } from '@/types/grid';

export default function DynamicsPage() {
  const { buses, activeModel } = useGrid();
  const [dynResult, setDynResult] = useState<DynamicSimResult | null>(null);
  const [dynLoading, setDynLoading] = useState(false);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-platform.onrender.com';

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
    try {
      const res = await fetch(`${apiBaseUrl}/api/simulations/dynamics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        const data = await res.json();
        setDynResult(data);
      }
    } finally {
      setDynLoading(false);
    }
  };

  const handleRunMultiMachine = async (params: { fault_bus_id: number; fault_duration_ms: number }) => {
    const res = await fetch(`${apiBaseUrl}/api/simulations/multi-machine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  };

  return (
    <DynamicsTab
      dynResult={dynResult}
      dynLoading={dynLoading}
      onRunSimulation={handleRunSimulation}
      buses={buses}
      onRunMultiMachine={handleRunMultiMachine}
    />
  );
}