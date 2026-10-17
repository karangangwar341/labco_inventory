import { RoleGuard } from '@/components/auth/RoleGuard';
import { ClientOperationsOverview } from '@/features/administration/components/ClientOperationsOverview';

export const metadata = { title: 'Client Operations | Labco Operations' };

export default async function ClientOperationsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <RoleGuard allowedRoles={['SUPER_ADMIN']}><ClientOperationsOverview clientId={clientId} /></RoleGuard>;
}
