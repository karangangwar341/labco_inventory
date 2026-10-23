import { NextResponse } from 'next/server';
import { container } from '@/server/container';

export async function GET() {
  const health = await container.backupsService.getHealth();
  return NextResponse.json(
    {
      status: health.ready ? 'READY' : 'NOT_READY',
      timestamp: health.timestamp,
    },
    { status: health.ready ? 200 : 503 },
  );
}
