'use client';
import { useGrid } from '@/context/GridContext';
import { SingleLineDiagram } from '@/components/diagram/SingleLineDiagram';

export default function SldPage() {
  const { buses, lines, trippedLines, toggleLine, activeModel } = useGrid();
  return (
    <SingleLineDiagram
      buses={buses}
      lines={lines}
      trippedLines={trippedLines}
      toggleLine={toggleLine}
      selectedBus={null}
      setSelectedBus={() => {}}
      onReset={() => {}}
      modelName={activeModel?.name || ''}
    />
  );
}