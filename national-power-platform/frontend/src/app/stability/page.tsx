'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGrid } from '@/context/GridContext';
import { useAuth } from '@/components/layout/AppShell';
import { GridStabilityTab } from '@/components/tabs/GridStabilityTab';

export default function StabilityPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
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
    toggleBusService,
    models,
    activateModel,
    triggerCascade,
    applyCascadeTrips,
    fetchModels,
    callWithHydration,
  } = useGrid();

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

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
      toggleBusService={toggleBusService}
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
      callWithHydration={callWithHydration}
      isAdmin={isAdmin}
      onRefreshModels={fetchModels}
    />
  );
}
