import { RoleGuard } from '@/components/auth/RoleGuard';
import { WarehousesManagement } from '@/features/administration/components/WarehousesManagement';

export const metadata = { title: 'Distribution Warehouses | Labco Operations' };

export default function AdminWarehousesPage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <WarehousesManagement />
    </RoleGuard>
  );
}
