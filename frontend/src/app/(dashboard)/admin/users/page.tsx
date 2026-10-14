import { UsersManagement } from '@/features/administration/components/UsersManagement';
import { RoleGuard } from '@/components/auth/RoleGuard';

export const metadata = {
  title: 'User Access Administration | Labco Operations',
};

export default function AdminUsersPage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <UsersManagement />
    </RoleGuard>
  );
}
