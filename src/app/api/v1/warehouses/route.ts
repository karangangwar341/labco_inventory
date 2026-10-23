import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { CreateWarehouseDto } from '@/server/organization/dto/create-warehouse.dto';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN]);
    const data = await container.warehousesService.findAll(user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(CreateWarehouseDto, body);

    const data = await container.warehousesService.create(dto);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
