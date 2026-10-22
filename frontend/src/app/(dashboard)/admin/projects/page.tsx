import { RoleGuard } from '@/components/auth/RoleGuard';
import { ProjectsManagement } from '@/features/administration/components/ProjectsManagement';

export const metadata = { title: 'Project Organizations | Labco Operations' };

export default function AdminProjectsPage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <ProjectsManagement />
    </RoleGuard>
  );
}
