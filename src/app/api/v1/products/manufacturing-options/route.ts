import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.PROJECT_ADMIN, UserRole.SUPER_ADMIN]);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;

    const data = await container.productsService.getManufacturingOptions(user, projectId);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
