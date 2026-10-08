'use client';
import { useGrid } from '@/context/GridContext';
import { GridStabilityTab } from '@/components/tabs/GridStabilityTab';

export default function StabilityPage() {
  const grid = useGrid();
  return (
    <GridStabilityTab
      modelName={grid.activeModel?.name || ''}
      divergedNotice={null}
      pfVariables={grid.pfVariables}
      setPfVariables={grid.setPfVariables}
      runSimulation={grid.runSimulation}
      onReset={() => {}}
      loading={grid.loading}
      buses={grid.buses}
      lines={grid.lines}
      trippedLines={grid.trippedLines}
      toggleLine={grid.toggleLine}
      models={grid.models}
      onActivateModel={grid.activateModel}
      onNavigateTab={() => {}}
      onCascadeTrigger={async () => ({} as any)}
      onApplyCascadeTrips={() => {}}
    />
  );
}