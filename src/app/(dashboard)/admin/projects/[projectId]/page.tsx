'use client';

import { use, Suspense } from 'react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { ProjectOperationsOverview } from '@/features/administration/components/ProjectOperationsOverview';

export default function ProjectOperationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <ErrorBoundary title="Project Operations">
        <Suspense fallback={<LoadingState message="Loading project operations..." />}>
          <ProjectOperationsOverview projectId={projectId} />
        </Suspense>
      </ErrorBoundary>
    </RoleGuard>
  );
}
