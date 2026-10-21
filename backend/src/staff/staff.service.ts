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

  private async resolveClientId(
    user: AuthenticatedUser,
    requestedClientId?: string,
    requireExplicit = true,
  ): Promise<string | undefined> {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (requestedClientId) return requestedClientId;
      if (user.clientId) return user.clientId;
      if (requireExplicit) {
        const firstClient = await this.prisma.client.findFirst({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        });
        if (firstClient) return firstClient.id;
        throw new BadRequestException('Super Admin must specify clientId parameter when creating a staff member');
      }
      return undefined;
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      if (!user.clientId) {
        throw new ForbiddenException('Client Admin user is not associated with any client entity');
      }
      return user.clientId;
    }

    throw new ForbiddenException('Access denied. Client Admin or Super Admin role required');
  }

  async listStaffMembers(
    user: AuthenticatedUser,
    clientIdParam?: string,
    pagination?: { page?: number; limit?: number },
  ) {
    const clientId = await this.resolveClientId(user, clientIdParam, false);
    const where = clientId ? { clientId } : {};

    const take = pagination?.limit ? Math.min(Number(pagination.limit), 200) : undefined;
    const skip = pagination?.page && take ? (Math.max(Number(pagination.page), 1) - 1) * take : undefined;

    const members = await this.prisma.clientStaffMember.findMany({
      where,
      include: {
        client: {
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
      clientId: m.clientId,
      clientName: m.client?.name || 'Client Facility',
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
    const member = await this.prisma.clientStaffMember.findUnique({
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

    if (user.role !== UserRole.SUPER_ADMIN && member.clientId !== user.clientId) {
      throw new ForbiddenException('Cannot access staff member belonging to another client');
    }

    return member;
  }

  async createStaffMember(dto: CreateStaffMemberDto, user: AuthenticatedUser) {
    const clientId = (await this.resolveClientId(user, dto.clientId, true))!;

    // Check duplicate staffNumber within the same client
    const existing = await this.prisma.clientStaffMember.findUnique({
      where: {
        clientId_staffNumber: {
          clientId,
          staffNumber: dto.staffNumber.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Staff number "${dto.staffNumber.trim()}" is already assigned to another staff member in this client facility`,
      );
    }

    return this.prisma.clientStaffMember.create({
      data: {
        clientId,
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
      const duplicate = await this.prisma.clientStaffMember.findUnique({
        where: {
          clientId_staffNumber: {
            clientId: member.clientId,
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

    return this.prisma.clientStaffMember.update({
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

    await this.prisma.clientStaffMember.delete({
      where: { id },
    });

    return { success: true, message: 'Staff member and associated logs removed successfully' };
  }

  async createWorkLog(staffId: string, dto: CreateWorkLogDto, user: AuthenticatedUser) {
    const member = await this.getStaffMember(staffId, user);

    const logDate = dto.logDate ? new Date(dto.logDate) : new Date();

    return this.prisma.clientStaffWorkLog.create({
      data: {
        staffMemberId: member.id,
        clientId: member.clientId,
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

    return this.prisma.clientStaffWorkLog.findMany({
      where: { staffMemberId: member.id },
      orderBy: { logDate: 'desc' },
      take: 100,
    });
  }

  async listAllClientWorkLogs(
    user: AuthenticatedUser,
    clientIdParam?: string,
    pagination?: { page?: number; limit?: number },
  ) {
    const clientId = await this.resolveClientId(user, clientIdParam, false);
    const where = clientId ? { clientId } : {};

    const take = pagination?.limit ? Math.min(Number(pagination.limit), 500) : 200;
    const skip = pagination?.page ? (Math.max(Number(pagination.page), 1) - 1) * take : undefined;

    const logs = await this.prisma.clientStaffWorkLog.findMany({
      where,
      include: {
        staffMember: {
          select: {
            id: true,
            staffNumber: true,
            fullName: true,
            roleTitle: true,
            client: {
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
      clientName: log.staffMember?.client?.name || 'Client Facility',
    }));
  }
}
