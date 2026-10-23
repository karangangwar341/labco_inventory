import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { UpdateImportRowDto } from '@/server/imports/dto/update-import-row.dto';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN]);
    const { id, rowId } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(UpdateImportRowDto, body);

    const data = await container.importsService.updateRow(id, rowId, dto, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
