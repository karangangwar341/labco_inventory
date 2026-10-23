import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { ResetPasswordDto } from '@/server/users/dto/reset-password.dto';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(ResetPasswordDto, body);

    const data = await container.usersService.resetPassword(id, dto.newPassword);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
