import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole, DepartmentIssueBatchStatus } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN]);
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as DepartmentIssueBatchStatus) || undefined;

    const data = await container.departmentsService.getIssueBatches(status, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
