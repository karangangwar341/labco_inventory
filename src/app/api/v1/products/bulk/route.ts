import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { CreateBulkProductsDto } from '@/server/catalog/dto/create-bulk-products.dto';

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN]);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(CreateBulkProductsDto, body);

    const data = await container.productsService.createBulk(dto, user);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
