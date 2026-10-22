import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '@prisma/client';
import { CreateStaffMemberDto } from './dto/create-staff.dto.js';
import { UpdateStaffMemberDto } from './dto/update-staff.dto.js';
import { CreateWorkLogDto } from './dto/create-work-log.dto.js';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveProjectId(
    user: AuthenticatedUser,
    requestedProjectId?: string,
    requireExplicit = true,
  ): Promise<string | undefined> {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (requestedProjectId) return requestedProjectId;
      if (user.projectId) return user.projectId;
      if (requireExplicit) {
        const firstProject = await this.prisma.project.findFirst({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        });
        if (firstProject) return firstProject.id;
        throw new BadRequestException('Super Admin must specify projectId parameter when creating a staff member');
      }
      return undefined;
    }

    if (user.role === UserRole.PROJECT_ADMIN) {
      if (!user.projectId) {
        throw new ForbiddenException('Project Admin user is not associated with any project entity');
      }
      return user.projectId;
    }

    throw new ForbiddenException('Access denied. Project Admin or Super Admin role required');
  }

  async listStaffMembers(
    user: AuthenticatedUser,
    projectIdParam?: string,
    pagination?: { page?: number; limit?: number },
  ) {
    const projectId = await this.resolveProjectId(user, projectIdParam, false);
    const where = projectId ? { projectId } : {};

    const take = pagination?.limit ? Math.min(Number(pagination.limit), 200) : undefined;
    const skip = pagination?.page && take ? (Math.max(Number(pagination.page), 1) - 1) * take : undefined;

    const members = await this.prisma.projectStaffMember.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true },
        },
        _count: {
          select: { workLogs: true },
        },
        workLogs: {
          orderBy: { logDate: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(take ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
    });

    return members.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      projectName: m.project?.name || 'Project Facility',
      staffNumber: m.staffNumber,
      fullName: m.fullName,
      roleTitle: m.roleTitle,
      contact: m.contact,
      status: m.status,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      totalLogsCount: m._count.workLogs,
      latestLog: m.workLogs[0] || null,
    }));
  }

  async getStaffMember(id: string, user: AuthenticatedUser) {
    const member = await this.prisma.projectStaffMember.findUnique({
      where: { id },
      include: {
        workLogs: {
          orderBy: { logDate: 'desc' },
          take: 50,
        },
      },
    });

    if (!member) {
      throw new NotFoundException(`Staff member with ID "${id}" not found`);
    }

    if (user.role !== UserRole.SUPER_ADMIN && member.projectId !== user.projectId) {
      throw new ForbiddenException('Cannot access staff member belonging to another project');
    }

    return member;
  }

  async createStaffMember(dto: CreateStaffMemberDto, user: AuthenticatedUser) {
    const projectId = (await this.resolveProjectId(user, dto.projectId, true))!;

    // Check duplicate staffNumber within the same project
    const existing = await this.prisma.projectStaffMember.findUnique({
      where: {
        projectId_staffNumber: {
          projectId,
          staffNumber: dto.staffNumber.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Staff number "${dto.staffNumber.trim()}" is already assigned to another staff member in this project facility`,
      );
    }

    return this.prisma.projectStaffMember.create({
      data: {
        projectId,
        staffNumber: dto.staffNumber.trim(),
        fullName: dto.fullName.trim(),
        roleTitle: dto.roleTitle?.trim() || null,
        contact: dto.contact?.trim() || null,
      },
    });
  }

  async updateStaffMember(id: string, dto: UpdateStaffMemberDto, user: AuthenticatedUser) {
    const member = await this.getStaffMember(id, user);

    if (dto.staffNumber && dto.staffNumber.trim() !== member.staffNumber) {
      const duplicate = await this.prisma.projectStaffMember.findUnique({
        where: {
          projectId_staffNumber: {
            projectId: member.projectId,
            staffNumber: dto.staffNumber.trim(),
          },
        },
      });

      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(
          `Staff number "${dto.staffNumber.trim()}" is already in use by another team member`,
        );
      }
    }

    return this.prisma.projectStaffMember.update({
      where: { id },
      data: {
        ...(dto.staffNumber ? { staffNumber: dto.staffNumber.trim() } : {}),
        ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.roleTitle !== undefined ? { roleTitle: dto.roleTitle?.trim() || null } : {}),
        ...(dto.contact !== undefined ? { contact: dto.contact?.trim() || null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
  }

  async deleteStaffMember(id: string, user: AuthenticatedUser) {
    await this.getStaffMember(id, user);

    await this.prisma.projectStaffMember.delete({
      where: { id },
    });

    return { success: true, message: 'Staff member and associated logs removed successfully' };
  }

  async createWorkLog(staffId: string, dto: CreateWorkLogDto, user: AuthenticatedUser) {
    const member = await this.getStaffMember(staffId, user);

    const logDate = dto.logDate ? new Date(dto.logDate) : new Date();

    return this.prisma.projectStaffWorkLog.create({
      data: {
        staffMemberId: member.id,
        projectId: member.projectId,
        logDate,
        shiftType: dto.shiftType?.trim() || 'GENERAL',
        hoursWorked: dto.hoursWorked !== undefined ? new Decimal(dto.hoursWorked) : new Decimal(8),
        tasksCompleted: dto.tasksCompleted.trim(),
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async listWorkLogsForStaff(staffId: string, user: AuthenticatedUser) {
    const member = await this.getStaffMember(staffId, user);

    return this.prisma.projectStaffWorkLog.findMany({
      where: { staffMemberId: member.id },
      orderBy: { logDate: 'desc' },
      take: 100,
    });
  }

  async listAllProjectWorkLogs(
    user: AuthenticatedUser,
    projectIdParam?: string,
    pagination?: { page?: number; limit?: number },
  ) {
    const projectId = await this.resolveProjectId(user, projectIdParam, false);
    const where = projectId ? { projectId } : {};

    const take = pagination?.limit ? Math.min(Number(pagination.limit), 500) : 200;
    const skip = pagination?.page ? (Math.max(Number(pagination.page), 1) - 1) * take : undefined;

    const logs = await this.prisma.projectStaffWorkLog.findMany({
      where,
      include: {
        staffMember: {
          select: {
            id: true,
            staffNumber: true,
            fullName: true,
            roleTitle: true,
            project: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { logDate: 'desc' },
      take,
      ...(skip !== undefined ? { skip } : {}),
    });

    return logs.map((log) => ({
      ...log,
      projectName: log.staffMember?.project?.name || 'Project Facility',
    }));
  }
}
