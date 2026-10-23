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
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN]);
    const { id } = await params;

    const result = await container.importsService.exportErrors(id, user);
    return new NextResponse(result.csvData, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename || `import-errors-${id}.csv`}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
