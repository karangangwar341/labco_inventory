import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { id } = await params;

    const backup = await container.backupsService.getBackupById(id);
    const archive = await container.backupsService.exportFullReportsZip(user);
    const shortId = backup.id.slice(0, 8);
    const filename = `backup_${shortId}_${new Date().toISOString().slice(0, 10)}.zip`;

    return new NextResponse(archive.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(archive.buffer.length),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
