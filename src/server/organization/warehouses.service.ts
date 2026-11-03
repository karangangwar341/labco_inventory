import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { UserRole, OrganizationStatus, UserStatus, LocationType } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService?: InventoryService,
  ) {}

  private async validateStoreAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    if (user.role !== UserRole.STORE_ADMIN) {
      throw new BadRequestException(`User ${user.username} is not a STORE_ADMIN`);
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException(`Store Admin ${user.username} is not ACTIVE`);
    }
    return user;
  }

  async create(dto: CreateWarehouseDto) {
    const normalizedName = dto.name.trim();

    const existing = await this.prisma.warehouse.findUnique({
      where: { name: normalizedName },
    });

    if (existing) {
      throw new ConflictException(`Warehouse with name "${normalizedName}" already exists`);
    }

    if (dto.storeAdminId) {
      await this.validateStoreAdmin(dto.storeAdminId);
    }

    const warehouse = await this.prisma.warehouse.create({
      data: {
        name: normalizedName,
        locationDescription: dto.locationDescription?.trim() || null,
        status: OrganizationStatus.ACTIVE,
        storeAdminId: dto.storeAdminId || null,
      },
      include: {
        storeAdmin: { select: { id: true, username: true, status: true } },
      },
    });

    if (this.prisma.stockLocation?.upsert) {
      await this.prisma.stockLocation.upsert({
        where: { warehouseId: warehouse.id },
        create: { locationType: LocationType.WAREHOUSE, warehouseId: warehouse.id },
        update: {},
      });
    }

    return warehouse;
  }

  async findAll(currentUser: AuthenticatedUser) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return this.prisma.warehouse.findMany({
        orderBy: { name: 'asc' },
        include: {
          storeAdmin: { select: { id: true, username: true, status: true } },
          projectAssignments: {
            where: { isActive: true },
            include: { project: true },
          },
        },
      });
    }

    if (currentUser.role === UserRole.STORE_ADMIN) {
      const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } });
      return this.prisma.warehouse.findMany({
        where: {
          status: OrganizationStatus.ACTIVE,
          OR: [
            { storeAdminId: currentUser.id },
            ...(user?.warehouseId ? [{ id: user.warehouseId, storeAdminId: null }] : []),
          ],
        },
        include: {
          storeAdmin: { select: { id: true, username: true, status: true } },
          projectAssignments: {
            where: { isActive: true },
            include: { project: true },
          },
        },
        orderBy: { name: 'asc' },
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
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        storeAdmin: { select: { id: true, username: true, status: true } },
        projectAssignments: {
          where: { isActive: true },
          include: { project: true },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse not found`);
    }

    if (currentUser.role === UserRole.STORE_ADMIN) {
      const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } });
      const isAssigned =
        warehouse.storeAdminId === currentUser.id ||
        (user?.warehouseId === id && (warehouse.storeAdminId === null || warehouse.storeAdminId === currentUser.id));
      if (!isAssigned) {
        throw new ForbiddenException('Store Admin cannot view other warehouses');
      }
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

    if (dto.storeAdminId !== undefined && dto.storeAdminId !== null) {
      await this.validateStoreAdmin(dto.storeAdminId);
    }

    const previousStoreAdminId = warehouse.storeAdminId;

    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        locationDescription: dto.locationDescription?.trim(),
        status: dto.status,
        ...(dto.storeAdminId !== undefined ? { storeAdminId: dto.storeAdminId } : {}),
      },
      include: {
        storeAdmin: { select: { id: true, username: true, status: true } },
        projectAssignments: {
          where: { isActive: true },
          include: { project: true },
        },
      },
    });

    if (dto.storeAdminId !== undefined) {
      if (previousStoreAdminId && previousStoreAdminId !== dto.storeAdminId && this.prisma.user?.update) {
        const remainingWarehouse = this.prisma.warehouse?.findFirst ? await this.prisma.warehouse.findFirst({
          where: {
            storeAdminId: previousStoreAdminId,
            id: { not: id },
            status: OrganizationStatus.ACTIVE,
          },
        }) : null;
        await this.prisma.user.update({
          where: { id: previousStoreAdminId },
          data: { warehouseId: remainingWarehouse ? remainingWarehouse.id : null },
        });
      }

      if (this.prisma.user?.updateMany) {
        await this.prisma.user.updateMany({
          where: {
            warehouseId: id,
            id: { not: dto.storeAdminId ?? '' },
          },
          data: { warehouseId: null },
        });
      }

      if (dto.storeAdminId && this.prisma.user?.update) {
        await this.prisma.user.update({
          where: { id: dto.storeAdminId },
          data: { warehouseId: id },
        });
      }
    }

    this.inventoryService?.clearLocationsCache();

    return updated;
  }
}
