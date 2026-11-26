'use client';

import React, { useState } from 'react';
import { useGrid } from '@/context/GridContext';
import { SingleLineDiagram } from '@/components/diagram/SingleLineDiagram';

export default function SldPage() {
  const { buses, lines, trippedLines, toggleLine, resetTrippedLines, activeModel } = useGrid();
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);

  return (
    <SingleLineDiagram
      buses={buses}
      lines={lines}
      trippedLines={trippedLines}
      toggleLine={toggleLine}
      resetTrippedLines={resetTrippedLines}
      selectedBusId={selectedBusId}
      setSelectedBusId={setSelectedBusId}
      modelName={activeModel?.name || 'Active Case'}
    />
  );
}
