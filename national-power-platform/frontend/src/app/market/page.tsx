'use client';

import React from 'react';
import { useGrid } from '@/context/GridContext';
import { MarketTab } from '@/components/tabs/MarketTab';

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