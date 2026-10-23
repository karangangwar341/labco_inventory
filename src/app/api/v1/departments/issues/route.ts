import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, requireRoles, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UserRole, DepartmentIssueStatus } from '@prisma/client';
import { CreateDepartmentIssueDto } from '@/server/departments/dto/create-department-issue.dto';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN]);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const status = (searchParams.get('status') as DepartmentIssueStatus) || undefined;

    const data = await container.departmentsService.getIssues({ projectId, departmentId, status }, user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    requireRoles(user, [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN]);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(CreateDepartmentIssueDto, body);

    const data = await container.departmentsService.createIssue(dto, user);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
