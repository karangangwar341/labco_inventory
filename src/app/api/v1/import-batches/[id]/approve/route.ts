import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { ApproveImportBatchDto } from '@/server/imports/dto/decide-import-batch.dto';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(ApproveImportBatchDto, body);
    const idempotencyKey =
      req.headers.get('idempotency-key') || req.headers.get('Idempotency-Key') || dto?.idempotencyKey;

    const data = await container.importsService.approveBatch(
      id,
      { ...dto, idempotencyKey },
      user,
    );
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
