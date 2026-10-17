'use client';

import React from 'react';
import { MarketTab } from '@/components/tabs/MarketTab';
import { useGrid } from '@/context/GridContext';

export default function MarketPage() {
  const { buses, lines, activeModel } = useGrid();

  return (
    <MarketTab
      buses={buses}
      lines={lines}
      modelName={activeModel?.name || ''}
    />
  );
}