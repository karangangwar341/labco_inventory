import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { DecideProductionRunBatchDto } from '@/server/manufacturing/dto/batch-production-run.dto';

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(DecideProductionRunBatchDto, body);
    const idempotencyKey =
      req.headers.get('idempotency-key') || req.headers.get('Idempotency-Key') || dto?.idempotencyKey;

    const data = await container.manufacturingService.approveProductionRunBatch(user, {
      ...dto,
      idempotencyKey,
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
