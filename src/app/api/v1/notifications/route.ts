import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';
import { QueryNotificationsDto } from '@/server/notifications/dto/query-notifications.dto';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    const { searchParams } = new URL(req.url);
    const readParam = searchParams.get('read');
    const unreadOnlyParam = searchParams.get('unreadOnly');
    const limitParam = searchParams.get('limit');
    const query: QueryNotificationsDto = {
      unreadOnly:
        unreadOnlyParam !== null
          ? unreadOnlyParam === 'true'
          : readParam !== null
            ? readParam === 'false'
            : undefined,
      limit: limitParam ? Number(limitParam) : undefined,
    };

    const data = await container.notificationsService.getNotifications(user, query);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
