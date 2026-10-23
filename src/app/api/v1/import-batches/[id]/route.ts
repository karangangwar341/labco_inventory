import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN]);
    const { id } = await params;

    const data = await container.importsService.getBatch(id, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
