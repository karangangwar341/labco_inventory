import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { handleApiError } from '@/server/auth/auth-guard';

export async function GET() {
  try {
    const health = await container.backupsService.getHealth();
    return NextResponse.json(
      {
        status: health.ready ? 'READY' : 'NOT_READY',
        timestamp: health.timestamp,
        ...health,
      },
      { status: health.ready ? 200 : 503 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
