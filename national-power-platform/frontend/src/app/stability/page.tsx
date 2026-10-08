'use client';

import React from 'react';
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

  const handleDeleteModel = async (id: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://national-power-platform.onrender.com'}/api/models/${id}`, {
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
      buses={buses}
      lines={lines}
      trippedLines={trippedLines}
      toggleLine={toggleLine}
      models={models}
      onActivateModel={activateModel}
      onNavigateTab={(tab) => {
        if (tab.toLowerCase().includes('sld') || tab.toLowerCase().includes('single')) {
          router.push('/sld');
        }
      }}
      onCascadeTrigger={triggerCascade}
      onApplyCascadeTrips={applyCascadeTrips}
      isAdmin={true}
      onDeleteModel={handleDeleteModel}
    />
  );
}