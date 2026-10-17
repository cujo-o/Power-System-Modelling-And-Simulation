'use client';

import React, { useState } from 'react';
import { SingleLineDiagram } from '@/components/diagram/SingleLineDiagram';
import { useGrid } from '@/context/GridContext';
import { BusData } from '@/types/grid';

export default function SldPage() {
  const {
    buses,
    lines,
    trippedLines,
    toggleLine,
    resetTrippedLines,
    activeModel,
  } = useGrid();

  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);

  return (
    <SingleLineDiagram
      buses={buses}
      lines={lines}
      trippedLines={trippedLines}
      toggleLine={toggleLine}
      selectedBus={selectedBus}
      setSelectedBus={setSelectedBus}
      onReset={resetTrippedLines}
      modelName={activeModel?.name || 'Active Grid'}
    />
  );
}