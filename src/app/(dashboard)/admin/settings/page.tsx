import { SystemSettingsForm } from '@/features/administration/components/SystemSettingsForm';
import { RoleGuard } from '@/components/auth/RoleGuard';

export const metadata = {
  title: 'System Settings | Labco Operations',
};

export default function AdminSettingsPage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <SystemSettingsForm />
    </RoleGuard>
  );
}
