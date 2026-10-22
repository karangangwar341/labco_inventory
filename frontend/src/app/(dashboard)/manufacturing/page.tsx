import React, { Suspense } from 'react';
import { ManufacturingView } from '@/features/manufacturing/components/ManufacturingView';
import { RoleGuard } from '@/components/auth/RoleGuard';

export const metadata = {
  title: 'Manufacturing & BOM | Labco Operations',
};

export default function ManufacturingPage() {
  return (
    <RoleGuard allowedRoles={['PROJECT_ADMIN', 'SUPER_ADMIN']}>
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading manufacturing jobs...</div>}>
        <ManufacturingView />
      </Suspense>
    </RoleGuard>
  );
}
