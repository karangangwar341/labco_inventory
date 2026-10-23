import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    const result = await container.authService.logout(user.id, user.sessionId);
    const response = NextResponse.json(result);
    response.cookies.delete('session_token');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
