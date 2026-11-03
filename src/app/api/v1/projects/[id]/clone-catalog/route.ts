import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const productIds = Array.isArray(body.productIds) ? body.productIds : undefined;

    const result = await container.projectsService.cloneCompanyProductsToProject(id, productIds, user);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
