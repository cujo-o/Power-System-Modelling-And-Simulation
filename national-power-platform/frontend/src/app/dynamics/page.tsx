'use client';

import React from 'react';
import { DynamicsTab } from '@/components/tabs/DynamicsTab';
import { useGrid } from '@/context/GridContext';

export default function DynamicsPage() {
  const { buses, activeModel } = useGrid();

  return (
    <DynamicsTab
      buses={buses}
      modelName={activeModel?.name || ''}
    />
  );
}