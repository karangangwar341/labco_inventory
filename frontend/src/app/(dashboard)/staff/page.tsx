import { StaffManagementView } from '@/features/staff/components/StaffManagementView';
import { RoleGuard } from '@/components/auth/RoleGuard';

export const metadata = {
  title: 'Staff & Workforce Portal | Labco Operations',
  description: 'Manage facility staff roster, badge IDs, and record daily work activities.',
};

export default function StaffPage() {
  return (
    <RoleGuard allowedRoles={['CLIENT_ADMIN', 'SUPER_ADMIN']}>
      <StaffManagementView />
    </RoleGuard>
  );
}
