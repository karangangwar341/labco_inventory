import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { CreateBulkProjectsDto } from '@/server/organization/dto/create-bulk-projects.dto';

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN]);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(CreateBulkProjectsDto, body);

    const data = await container.projectsService.createBulk(dto, user);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
