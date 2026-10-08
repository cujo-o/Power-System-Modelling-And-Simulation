'use client';

import React from 'react';
import { useGrid } from '@/context/GridContext';
import { ReportsTab } from '@/components/tabs/ReportsTab';

export default function ReportsPage() {
  const { buses, lines, activeModel, trippedLines } = useGrid();

  return (
    <ReportsTab
      buses={buses}
      lines={lines}
      activeModel={activeModel}
      trippedLines={trippedLines}
    />
  );
}