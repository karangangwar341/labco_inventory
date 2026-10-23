import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { ReRunCycleDto } from '@/server/manufacturing/dto/re-run-cycle.dto';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = Object.keys(body).length > 0 ? await validateDto(ReRunCycleDto, body) : undefined;

    const data = await container.manufacturingService.reRunCycle(user, id, dto);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
