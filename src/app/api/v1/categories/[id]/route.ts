import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { UpdateCategoryDto } from '@/server/catalog/dto/update-category.dto';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(UpdateCategoryDto, body);

    const data = await container.categoriesService.update(id, dto, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN]);
    const { id } = await params;

    const data = await container.categoriesService.delete(id, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
