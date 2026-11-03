import { Suspense } from 'react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { ProjectOperationsOverview } from '@/features/administration/components/ProjectOperationsOverview';

export const metadata = { title: 'Project Operations | Labco Operations' };

export default async function ProjectOperationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
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
