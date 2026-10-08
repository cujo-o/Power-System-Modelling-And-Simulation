'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGrid } from '@/context/GridContext';
import { GridStabilityTab } from '@/components/tabs/GridStabilityTab';

export default function StabilityPage() {
  const router = useRouter();
  const {
    activeModel,
    divergedNotice,
    pfVariables,
    setPfVariables,
    runSimulation,
    resetPfVariables,
    loading,
    modelsLoading,
    buses,
    lines,
    trippedLines,
    toggleLine,
    models,
    activateModel,
    triggerCascade,
    applyCascadeTrips,
    fetchModels,
  } = useGrid();

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleDeleteModel = async (id: string) => {
    try {
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com';
      const res = await fetch(`${apiBase}/api/models/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchModels();
      }
    } catch (err) {
      console.error('Failed to delete model:', err);
    }
  };

  return (
    <GridStabilityTab
      modelName={activeModel?.name || ''}
      divergedNotice={divergedNotice}
      pfVariables={pfVariables}
      setPfVariables={setPfVariables}
      runSimulation={runSimulation}
      onReset={resetPfVariables}
      loading={loading}
      modelsLoading={modelsLoading}
      buses={buses}
      lines={lines}
      trippedLines={trippedLines}
      toggleLine={toggleLine}
      models={models}
      onActivateModel={activateModel}
      onNavigateTab={(tab) => {
        const norm = (tab || '').toLowerCase();
        if (norm.includes('upload') || norm.includes('ingest')) {
          router.push('/upload');
        } else if (norm.includes('sld') || norm.includes('single')) {
          router.push('/sld');
        }
      }}
      onCascadeTrigger={triggerCascade}
      onApplyCascadeTrips={applyCascadeTrips}
      isAdmin={true}
      onDeleteModel={handleDeleteModel}
      onRefreshModels={fetchModels}
    />
  );
}