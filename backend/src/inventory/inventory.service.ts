import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole, LocationType, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { calculateProjectedQuantities, CalculatedBalanceView } from './inventory.types.js';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateLocationForWarehouse(warehouseId: string) {
    let location = await this.prisma.stockLocation.findUnique({
      where: { warehouseId },
    });

    if (!location) {
      location = await this.prisma.stockLocation.create({
        data: {
          locationType: LocationType.WAREHOUSE,
          warehouseId,
        },
      });
    }

    return location;
  }

  async getOrCreateLocationForClient(clientId: string) {
    let location = await this.prisma.stockLocation.findUnique({
      where: { clientId },
    });

    if (!location) {
      location = await this.prisma.stockLocation.create({
        data: {
          locationType: LocationType.CLIENT,
          clientId,
        },
      });
    }

    return location;
  }

  async getBalances(
    user: AuthenticatedUser,
    filters?: { locationId?: string; productId?: string },
  ): Promise<CalculatedBalanceView[]> {
    const where: Prisma.InventoryBalanceWhereInput = {};

    if (filters?.productId) {
      where.productId = filters.productId;
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      if (filters?.locationId) {
        where.locationId = filters.locationId;
      }
    } else if (user.role === UserRole.STORE_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.warehouseId) {
        return [];
      }
      const loc = await this.getOrCreateLocationForWarehouse(dbUser.warehouseId);
      where.locationId = loc.id;
    } else if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.clientId) {
        return [];
      }
      const loc = await this.getOrCreateLocationForClient(dbUser.clientId);
      where.locationId = loc.id;
    }

    const rawBalances = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, minQuantity: true, trackingMode: true } },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        location: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return rawBalances.map((b) => {
      const { physicalQty, availableQty } = calculateProjectedQuantities(b);
      return {
        id: b.id,
        locationId: b.locationId,
        productId: b.productId,
        batchId: b.batchId,
        usableQty: b.usableQty,
        reservedQty: b.reservedQty,
        damagedQty: b.damagedQty,
        expiredQty: b.expiredQty,
        physicalQty,
        availableQty,
        updatedAt: b.updatedAt,
      };
    });
  }

  async getTransactions(user: AuthenticatedUser, limit = 50) {
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.prisma.ledgerTransaction.findMany({
        take: limit,
        orderBy: { postedAt: 'desc' },
        include: {
          entries: {
            include: {
              product: { select: { id: true, name: true } },
              location: true,
            },
          },
          postedBy: { select: { id: true, username: true } },
        },
      });
    }

    if (user.role === UserRole.STORE_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.warehouseId) return [];
      const loc = await this.getOrCreateLocationForWarehouse(dbUser.warehouseId);

      return this.prisma.ledgerTransaction.findMany({
        where: {
          entries: {
            some: { locationId: loc.id },
          },
        },
        take: limit,
        orderBy: { postedAt: 'desc' },
        include: {
          entries: {
            where: { locationId: loc.id },
            include: { product: { select: { id: true, name: true } } },
          },
        },
      });
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.clientId) return [];
      const loc = await this.getOrCreateLocationForClient(dbUser.clientId);

      return this.prisma.ledgerTransaction.findMany({
        where: {
          entries: {
            some: { locationId: loc.id },
          },
        },
        take: limit,
        orderBy: { postedAt: 'desc' },
        include: {
          entries: {
            where: { locationId: loc.id },
            include: { product: { select: { id: true, name: true } } },
          },
        },
      });
    }

    return [];
  }
}
