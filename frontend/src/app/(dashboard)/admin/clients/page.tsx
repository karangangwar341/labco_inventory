import { RoleGuard } from '@/components/auth/RoleGuard';
import { ClientsManagement } from '@/features/administration/components/ClientsManagement';

export const metadata = { title: 'Client Organizations | Labco Operations' };

export default function AdminClientsPage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <ClientsManagement />
    </RoleGuard>
  );
}
