import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { RejectDepartmentActionDto } from '@/server/departments/dto/decide-department-request.dto';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(RejectDepartmentActionDto, body);

    const data = await container.departmentsService.decideIssueBatch(id, false, dto.reason, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
