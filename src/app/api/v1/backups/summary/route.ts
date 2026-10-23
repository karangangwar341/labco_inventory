import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const data = await container.backupsService.getBackupStatusSummary();
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
