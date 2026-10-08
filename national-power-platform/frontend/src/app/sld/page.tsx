'use client';

import React, { useState } from 'react';
import { useGrid } from '@/context/GridContext';
import { SingleLineDiagram } from '@/components/diagram/SingleLineDiagram';
import { BusData } from '@/types/grid';

export default function SldPage() {
  const { buses, lines, trippedLines, toggleLine, runSimulation, activeModel } = useGrid();
  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);

  return (
    <SingleLineDiagram
      buses={buses}
      lines={lines}
      trippedLines={trippedLines}
      toggleLine={toggleLine}
      selectedBus={selectedBus}
      setSelectedBus={setSelectedBus}
      onReset={() => runSimulation()}
      modelName={activeModel?.name || 'Active Case'}
    />
  );
}