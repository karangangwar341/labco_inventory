import { ManufacturingView } from '@/features/manufacturing/components/ManufacturingView';
import { RoleGuard } from '@/components/auth/RoleGuard';

export const metadata = {
  title: 'Manufacturing & BOM | Labco Operations',
};

export default function ManufacturingPage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'CLIENT_ADMIN']}>
      <ManufacturingView />
    </RoleGuard>
  );
}
