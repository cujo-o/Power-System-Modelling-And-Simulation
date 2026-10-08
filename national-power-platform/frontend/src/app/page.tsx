'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { HomeTab } from '@/components/tabs/HomeTab';

export default function DashboardPage() {
  const router = useRouter();

  const handleNavigate = (tab: string) => {
    switch (tab) {
      case 'Grid Models':
        router.push('/stability');
        break;
      case 'Market Simulations':
        router.push('/market');
        break;
      case 'Data Upload':
        router.push('/upload');
        break;
      case 'Visualization':
        router.push('/sld');
        break;
      default:
        router.push('/stability');
    }
  };

  return <HomeTab onNavigate={handleNavigate} />;
}