import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; warehouseId: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { id, warehouseId } = await params;

    const data = await container.projectsService.deactivateWarehouseAssignment(id, warehouseId, user.id);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
