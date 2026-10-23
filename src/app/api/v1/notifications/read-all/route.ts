import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    const data = await container.notificationsService.markAllAsRead(user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
