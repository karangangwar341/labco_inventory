import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'zip';

    if (type === 'database') {
      const dbDump = await container.backupsService.exportFullDatabase(user);
      return new NextResponse(dbDump.jsonString, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${dbDump.filename}"`,
        },
      });
    }

    // Default: Comprehensive ZIP archive containing all Excel operational reports + database dump
    const archive = await container.backupsService.exportFullReportsZip(user);
    return new NextResponse(archive.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${archive.filename}"`,
        'Content-Length': String(archive.buffer.length),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
