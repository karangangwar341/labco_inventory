import { DepartmentsView } from '@/features/departments/components/DepartmentsView';
import { RoleGuard } from '@/components/auth/RoleGuard';

export const metadata = {
  title: 'Departments & Internal Movements | Labco Operations',
};

export default function DepartmentsPage() {
  return (
    <RoleGuard allowedRoles={['CLIENT_ADMIN', 'SUPER_ADMIN']}>
      <DepartmentsView />
    </RoleGuard>
  );
}
