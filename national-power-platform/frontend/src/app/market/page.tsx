'use client';

import React from 'react';
import { MarketTab } from '@/components/tabs/MarketTab';
import { useGrid } from '@/context/GridContext';

export default function MarketPage() {
  const { buses, activeModel, callWithHydration } = useGrid();

  return (
    <MarketTab
      buses={buses}
      modelName={activeModel?.name || ''}
      callWithHydration={callWithHydration}
    />
  );
}
