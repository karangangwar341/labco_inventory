import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole, BackupStatus } from '@prisma/client';
import { CreateBackupDto } from '@/server/backups/dto/create-backup.dto';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as BackupStatus) || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;

    const data = await container.backupsService.getBackups({ status, limit });
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
    const dto = await validateDto(CreateBackupDto, body);

    const data = await container.backupsService.triggerBackup(dto, user);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
