import { ApprovalsQueue } from '@/features/approvals/components/ApprovalsQueue';
import { RoleGuard } from '@/components/auth/RoleGuard';

export const metadata = {
  title: 'Approvals Queue | Labco Operations',
};

export default function ApprovalsPage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <ApprovalsQueue />
    </RoleGuard>
  );
}
