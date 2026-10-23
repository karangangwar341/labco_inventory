import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    const result = await container.authService.logout(user.id, user.sessionId);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
