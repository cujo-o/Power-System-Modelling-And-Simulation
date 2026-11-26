'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/layout/AppShell';
import { HomeTab } from '@/components/tabs/HomeTab';

export default function DashboardPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  return <HomeTab isAdmin={isAdmin} onNavigate={(href) => router.push(href)} />;
}
