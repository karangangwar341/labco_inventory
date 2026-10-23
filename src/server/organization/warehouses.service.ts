import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { UserRole, OrganizationStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWarehouseDto) {
    const normalizedName = dto.name.trim();

    const existing = await this.prisma.warehouse.findUnique({
      where: { name: normalizedName },
    });

    if (existing) {
      throw new ConflictException(`Warehouse with name "${normalizedName}" already exists`);
    }

    return this.prisma.warehouse.create({
      data: {
        name: normalizedName,
        locationDescription: dto.locationDescription?.trim() || null,
        status: OrganizationStatus.ACTIVE,
      },
    });
  }

  async findAll(currentUser: AuthenticatedUser) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return this.prisma.warehouse.findMany({
        orderBy: { name: 'asc' },
        include: {
          projectAssignments: {
            where: { isActive: true },
            include: { project: true },
          },
        },
      });
    }

    if (currentUser.role === UserRole.STORE_ADMIN) {
      const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } });
      if (!user?.warehouseId) {
        return [];
      }
      return this.prisma.warehouse.findMany({
        where: { id: user.warehouseId },
        include: {
          projectAssignments: {
            where: { isActive: true },
            include: { project: true },
          },
        },
      });
    }

    if (currentUser.role === UserRole.PROJECT_ADMIN) {
      // Any warehouse can transfer to any project; warehouse-project mapping is not required.
      return this.prisma.warehouse.findMany({
        where: { status: OrganizationStatus.ACTIVE },
        orderBy: { name: 'asc' },
      });
    }

    return [];
  }

  async findById(id: string, currentUser: AuthenticatedUser) {
    if (currentUser.role === UserRole.STORE_ADMIN) {
      const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } });
      if (user?.warehouseId !== id) {
        throw new ForbiddenException('Store Admin cannot view other warehouses');
      }
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        projectAssignments: {
          where: { isActive: true },
          include: { project: true },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse not found`);
    }

    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse not found`);
    }

    if (dto.name) {
      const normalizedName = dto.name.trim();
      const existing = await this.prisma.warehouse.findUnique({ where: { name: normalizedName } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Warehouse name "${normalizedName}" is already taken`);
      }
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        locationDescription: dto.locationDescription?.trim(),
        status: dto.status,
      },
    });
  }
}
