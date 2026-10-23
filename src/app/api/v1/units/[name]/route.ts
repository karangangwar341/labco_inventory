import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { name } = await params;

    const data = await container.unitsService.delete(decodeURIComponent(name), user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
