import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const data = await container.manufacturingService.getProductionCycles(user, projectId, {
      startDate,
      endDate,
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const { cycleKey, disabled } = body;
    if (!cycleKey) {
      return NextResponse.json({ error: 'cycleKey is required' }, { status: 400 });
    }
    const data = await container.manufacturingService.toggleCycleStatus(user, cycleKey, disabled);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await authenticateUser(req);
    const { searchParams } = new URL(req.url);
    const cycleKey = searchParams.get('cycleKey');
    if (!cycleKey) {
      return NextResponse.json({ error: 'cycleKey is required' }, { status: 400 });
    }
    const data = await container.manufacturingService.deleteProductionCycle(user, cycleKey);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
