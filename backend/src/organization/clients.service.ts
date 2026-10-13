import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { UserRole, OrganizationStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClientDto) {
    const normalizedName = dto.name.trim();

    const existing = await this.prisma.client.findUnique({
      where: { name: normalizedName },
    });

    if (existing) {
      throw new ConflictException(`Client with name "${normalizedName}" already exists`);
    }

    return this.prisma.client.create({
      data: {
        name: normalizedName,
        status: OrganizationStatus.ACTIVE,
      },
    });
  }

  async findAll(currentUser: AuthenticatedUser) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return this.prisma.client.findMany({
        orderBy: { name: 'asc' },
        include: {
          warehouseAssignments: {
            where: { isActive: true },
            include: { warehouse: true },
          },
        },
      });
    }

    if (currentUser.role === UserRole.CLIENT_ADMIN) {
      // Find client assigned to this client admin
      const user = await this.prisma.user.findUnique({
        where: { id: currentUser.id },
      });

      if (!user?.clientId) {
        return [];
      }

      return this.prisma.client.findMany({
        where: { id: user.clientId },
        include: {
          warehouseAssignments: {
            where: { isActive: true },
            // Note REQ: Client Admin inbound views hide warehouse identity, but allowed warehouses metadata can be scoped
          },
        },
      });
    }

    throw new ForbiddenException('Store Admin cannot list client directory');
  }

  async findById(id: string, currentUser: AuthenticatedUser) {
    if (currentUser.role === UserRole.CLIENT_ADMIN) {
      const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } });
      if (user?.clientId !== id) {
        throw new ForbiddenException('Access denied to other client organization data');
      }
    } else if (currentUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Store Admin cannot view client organization');
    }

    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        warehouseAssignments: {
          where: { isActive: true },
          include: { warehouse: true },
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Client not found`);
    }

    return client;
  }

  async update(id: string, dto: UpdateClientDto) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Client not found`);
    }

    if (dto.name) {
      const normalizedName = dto.name.trim();
      const existing = await this.prisma.client.findUnique({ where: { name: normalizedName } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Client name "${normalizedName}" is already taken`);
      }
    }

    return this.prisma.client.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        status: dto.status,
      },
    });
  }

  async assignWarehouse(clientId: string, warehouseId: string, changedById: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found');

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const existingActive = await this.prisma.clientWarehouseAssignment.findFirst({
      where: {
        clientId,
        warehouseId,
        isActive: true,
      },
    });

    if (existingActive) {
      throw new ConflictException('Warehouse is already actively assigned to this client');
    }

    return this.prisma.clientWarehouseAssignment.create({
      data: {
        clientId,
        warehouseId,
        isActive: true,
        activeFrom: new Date(),
        changedById,
      },
      include: {
        warehouse: true,
      },
    });
  }

  async deactivateWarehouseAssignment(clientId: string, warehouseId: string, changedById: string) {
    const existingActive = await this.prisma.clientWarehouseAssignment.findFirst({
      where: {
        clientId,
        warehouseId,
        isActive: true,
      },
    });

    if (!existingActive) {
      throw new NotFoundException('Active warehouse assignment not found');
    }

    return this.prisma.clientWarehouseAssignment.update({
      where: { id: existingActive.id },
      data: {
        isActive: false,
        inactiveFrom: new Date(),
        changedById,
      },
    });
  }
}
