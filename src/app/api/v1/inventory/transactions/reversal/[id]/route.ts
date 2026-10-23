import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || 'Reversal requested';

    const data = await container.ledgerService.reverseTransaction(id, user.id, reason);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
