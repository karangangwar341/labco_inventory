import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { UpdateNotificationSettingsDto } from '@/server/notifications/dto/update-notification-settings.dto';

export async function GET(req: Request) {
  try {
    await authenticateUser(req);
    const data = await container.notificationsService.getSettings();
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(UpdateNotificationSettingsDto, body);

    const data = await container.notificationsService.updateSettings(dto, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request) {
  return PATCH(req);
}
