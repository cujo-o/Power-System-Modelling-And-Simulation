'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { UploadTab } from '@/components/tabs/UploadTab';
import { useGrid } from '@/context/GridContext';

export default function UploadPage() {
  const router = useRouter();
  const { fetchModels } = useGrid();

  return (
    <UploadTab
      onUploadSuccess={fetchModels}
      onNavigateToStability={() => router.push('/stability')}
      userName="Opeyemi Ibrahim Abubakar"
      userInstitution="FUT Minna"
    />
  );
}