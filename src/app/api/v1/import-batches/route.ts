import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole, ImportType, ImportBatchStatus } from '@prisma/client';
import { CreateImportBatchDto } from '@/server/imports/dto/create-import-batch.dto';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN]);
    const { searchParams } = new URL(req.url);
    const importType = (searchParams.get('importType') as ImportType) || undefined;
    const status = (searchParams.get('status') as ImportBatchStatus) || undefined;

    const data = await container.importsService.getBatches({ importType, status }, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN]);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(CreateImportBatchDto, body);

    const data = await container.importsService.createBatch(dto, user);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
