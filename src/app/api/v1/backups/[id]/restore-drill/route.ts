import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { RunRestoreDrillDto } from '@/server/backups/dto/run-restore-drill.dto';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(RunRestoreDrillDto, body);

    const data = await container.backupsService.runRestoreDrill(id, dto, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
