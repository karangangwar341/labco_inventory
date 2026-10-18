import React, { Suspense } from 'react';
import { ApprovalsQueue } from '@/features/approvals/components/ApprovalsQueue';
import { RoleGuard } from '@/components/auth/RoleGuard';

export const metadata = {
  title: 'Approvals Queue | Labco Operations',
};

export default function ApprovalsPage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading approvals queue...</div>}>
        <ApprovalsQueue />
      </Suspense>
    </RoleGuard>
  );
}
