import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateUserDto) {
    const normalizedUsername = dto.username.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (existing) {
      throw new ConflictException(`User with username "${normalizedUsername}" already exists`);
    }

    // Role-scope integrity checks
    if (dto.role === UserRole.STORE_ADMIN) {
      if (!dto.warehouseId) {
        throw new BadRequestException('warehouseId is required for STORE_ADMIN accounts');
      }
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });
      if (!warehouse) {
        throw new NotFoundException(`Assigned warehouse not found`);
      }
    } else if (dto.role === UserRole.PROJECT_ADMIN) {
      if (!dto.projectId) {
        throw new BadRequestException('projectId is required for PROJECT_ADMIN accounts');
      }
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (!project) {
        throw new NotFoundException(`Assigned project organization not found`);
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: normalizedUsername,
        passwordHash,
        role: dto.role,
        status: UserStatus.ACTIVE,
        fullName: dto.fullName?.trim() || null,
        phoneNumber: dto.phoneNumber?.trim() || null,
        address: dto.address?.trim() || null,
        idImageUrl: dto.idImageUrl || null,
        warehouseId: dto.role === UserRole.STORE_ADMIN ? dto.warehouseId : null,
        projectId: dto.role === UserRole.PROJECT_ADMIN ? dto.projectId : null,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        phoneNumber: true,
        address: true,
        idImageUrl: true,
        role: true,
        status: true,
        warehouseId: true,
        projectId: true,
        createdAt: true,
      },
    });

    if (dto.role === UserRole.STORE_ADMIN && dto.warehouseId) {
      await this.prisma.warehouse.update({
        where: { id: dto.warehouseId },
        data: { storeAdminId: user.id },
      });
    }

    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        phoneNumber: true,
        address: true,
        idImageUrl: true,
        role: true,
        status: true,
        warehouseId: true,
        projectId: true,
        lockoutUntil: true,
        lockoutCount: true,
        createdAt: true,
        disabledAt: true,
        warehouse: { select: { id: true, name: true } },
        managedWarehouses: { select: { id: true, name: true, status: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        phoneNumber: true,
        address: true,
        idImageUrl: true,
        role: true,
        status: true,
        warehouseId: true,
        projectId: true,
        lockoutUntil: true,
        lockoutCount: true,
        createdAt: true,
        disabledAt: true,
        warehouse: { select: { id: true, name: true } },
        managedWarehouses: { select: { id: true, name: true, status: true } },
        project: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: any = {};
    if (dto.fullName !== undefined) updateData.fullName = dto.fullName?.trim() || null;
    if (dto.phoneNumber !== undefined) updateData.phoneNumber = dto.phoneNumber?.trim() || null;
    if (dto.address !== undefined) updateData.address = dto.address?.trim() || null;
    if (dto.idImageUrl !== undefined) updateData.idImageUrl = dto.idImageUrl || null;
    if (dto.role !== undefined) updateData.role = dto.role;

    if (dto.warehouseId !== undefined) {
      if (dto.warehouseId) {
        const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
        if (!warehouse) throw new NotFoundException('Assigned warehouse not found');
        updateData.warehouseId = dto.warehouseId;
        await this.prisma.warehouse.update({
          where: { id: dto.warehouseId },
          data: { storeAdminId: user.id },
        });
      } else {
        updateData.warehouseId = null;
      }
    }

    if (dto.projectId !== undefined) {
      if (dto.projectId) {
        const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
        if (!project) throw new NotFoundException('Assigned project not found');
        updateData.projectId = dto.projectId;
      } else {
        updateData.projectId = null;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        fullName: true,
        phoneNumber: true,
        address: true,
        idImageUrl: true,
        role: true,
        status: true,
        warehouseId: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async enable(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.ACTIVE,
        disabledAt: null,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        phoneNumber: true,
        address: true,
        idImageUrl: true,
        role: true,
        status: true,
        disabledAt: true,
      },
    });

    return updated;
  }

  async disable(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.DISABLED,
        disabledAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        disabledAt: true,
      },
    });

    // Invariant: Immediately revoke all active sessions for disabled user
    await this.authService.revokeAllUserSessions(id);

    return updated;
  }

  async resetPassword(id: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordHash = await bcrypt.hash(newPass, 10);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
      },
    });

    // Invariant: Immediately revoke all active sessions when password is reset
    await this.authService.revokeAllUserSessions(id);

    return updated;
  }
}
