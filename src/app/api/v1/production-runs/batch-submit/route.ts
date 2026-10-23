import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { SubmitProductionRunBatchDto } from '@/server/manufacturing/dto/batch-production-run.dto';

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.PROJECT_ADMIN, UserRole.SUPER_ADMIN]);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(SubmitProductionRunBatchDto, body);

    const data = await container.manufacturingService.submitProductionRunBatch(user, dto);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
