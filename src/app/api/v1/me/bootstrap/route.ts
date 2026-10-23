import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    const bootstrapData = await container.authService.getBootstrap(user);
    return NextResponse.json(bootstrapData);
  } catch (error) {
    return handleApiError(error);
  }
}
