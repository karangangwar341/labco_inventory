import { BackupsView } from '@/features/backups/components/BackupsView';
import { RoleGuard } from '@/components/auth/RoleGuard';

export const metadata = {
  title: 'Resiliency & Disaster Recovery | Labco Operations',
};

export default function BackupsPage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <BackupsView />
    </RoleGuard>
  );
}
