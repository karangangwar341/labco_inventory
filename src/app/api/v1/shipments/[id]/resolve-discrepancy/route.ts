import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { ResolveDiscrepancyDto } from '@/server/shipments/dto/resolve-discrepancy.dto';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(ResolveDiscrepancyDto, body);

    const data = await container.shipmentsService.resolveDiscrepancy(user, id, dto);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
