import { NextResponse } from 'next/server';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    return NextResponse.json({
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      sessionId: user.sessionId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
