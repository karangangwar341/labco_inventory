import { Suspense } from 'react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ClientOperationsOverview } from '@/features/administration/components/ClientOperationsOverview';

export const metadata = { title: 'Client Operations | Labco Operations' };

export default async function ClientOperationsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <Suspense fallback={<LoadingState message="Loading client operations..." />}>
        <ClientOperationsOverview clientId={clientId} />
      </Suspense>
    </RoleGuard>
  );
}
