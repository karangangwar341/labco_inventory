import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole, LocationType, ProductKind, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { calculateProjectedQuantities, CalculatedBalanceView } from './inventory.types.js';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private locationsCache = new Map<string, { data: any[]; expiresAt: number }>();
  private lowStockCountCache = new Map<string, { count: number; expiresAt: number }>();

  async getAccessibleLocations(user: AuthenticatedUser) {
    const cacheKey = `${user.role}_${user.id}_${user.warehouseId || ''}_${user.clientId || ''}`;
    const cached = this.locationsCache.get(cacheKey);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

    let result: any[] = [];
    if (user.role === UserRole.SUPER_ADMIN) {
      const locations = await this.prisma.stockLocation.findMany({
        include: {
          warehouse: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      result = locations.map((location) => ({
        id: location.id,
        locationType: location.locationType,
        warehouseId: location.warehouseId,
        clientId: location.clientId,
        name: location.warehouse?.name || location.client?.name || 'Stock location',
      }));
    } else if (user.role === UserRole.STORE_ADMIN) {
      const warehouseId = user.warehouseId !== undefined
        ? user.warehouseId
        : (await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { warehouseId: true },
          }))?.warehouseId;
      if (!warehouseId) return [];

      const assignments = await this.prisma.clientWarehouseAssignment.findMany({
        where: { warehouseId, isActive: true },
        select: { clientId: true },
      });
      const allowedClientIds = assignments.map((assignment) => assignment.clientId);
      const locations = await this.prisma.stockLocation.findMany({
        where: {
          OR: [
            { warehouseId },
            ...(allowedClientIds.length ? [{ clientId: { in: allowedClientIds } }] : []),
          ],
        },
        include: {
          warehouse: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      });
      result = locations.map((location) => ({
        id: location.id,
        locationType: location.locationType,
        warehouseId: location.warehouseId,
        clientId: location.clientId,
        name: location.warehouse?.name || location.client?.name || 'Stock location',
      }));
    } else if (user.role === UserRole.CLIENT_ADMIN) {
      const clientId = user.clientId !== undefined
        ? user.clientId
        : (await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { clientId: true },
          }))?.clientId;
      if (!clientId) return [];
      const location = await this.prisma.stockLocation.findUnique({
        where: { clientId },
        include: { client: { select: { name: true } } },
      });
      if (!location) return [];
      result = [{
        id: location.id,
        locationType: location.locationType,
        clientId: location.clientId,
        name: location.client?.name || 'My location',
      }];
    }

    this.locationsCache.set(cacheKey, { data: result, expiresAt: now + 45_000 });
    return result;
  }

  async getLowStockCount(user: AuthenticatedUser): Promise<{ count: number }> {
    const cacheKey = `${user.role}_${user.warehouseId || ''}_${user.clientId || ''}_${user.id}`;
    const cached = this.lowStockCountCache.get(cacheKey);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      return { count: cached.count };
    }

    let count = 0;
    try {
      let locationId: string | undefined;
      if (user.role === UserRole.STORE_ADMIN) {
        const warehouseId =
          user.warehouseId ||
          (await this.prisma.user.findUnique({ where: { id: user.id } }))?.warehouseId;
        if (!warehouseId) return { count: 0 };
        const loc = await this.prisma.stockLocation.findUnique({ where: { warehouseId } });
        if (!loc) return { count: 0 };
        locationId = loc.id;
      } else if (user.role === UserRole.CLIENT_ADMIN) {
        const clientId =
          user.clientId ||
          (await this.prisma.user.findUnique({ where: { id: user.id } }))?.clientId;
        if (!clientId) return { count: 0 };
        const loc = await this.prisma.stockLocation.findUnique({ where: { clientId } });
        if (!loc) return { count: 0 };
        locationId = loc.id;
      }

      if (user.role === UserRole.SUPER_ADMIN) {
        const queryResult = await this.prisma.$queryRaw<{ count: bigint | number }[]>`
          SELECT COUNT(DISTINCT b.id)::int as count
          FROM inventory_balances b
          JOIN products p ON b.product_id = p.id
          WHERE p.min_quantity > 0
            AND (b.usable_qty - b.reserved_qty) <= p.min_quantity
        `;
        count = Number(queryResult[0]?.count ?? 0);
      } else if (locationId) {
        const queryResult = await this.prisma.$queryRaw<{ count: bigint | number }[]>`
          SELECT COUNT(DISTINCT b.id)::int as count
          FROM inventory_balances b
          JOIN products p ON b.product_id = p.id
          WHERE b.location_id = ${locationId}
            AND p.min_quantity > 0
            AND (b.usable_qty - b.reserved_qty) <= p.min_quantity
        `;
        count = Number(queryResult[0]?.count ?? 0);
      }
    } catch {
      count = 0;
    }

    this.lowStockCountCache.set(cacheKey, { count, expiresAt: now + 30_000 });
    return { count };
  }

  async getOrCreateLocationForWarehouse(warehouseId: string) {
    return this.prisma.stockLocation.upsert({
      where: { warehouseId },
      create: { locationType: LocationType.WAREHOUSE, warehouseId },
      update: {},
    });
  }

  async getOrCreateLocationForClient(clientId: string) {
    return this.prisma.stockLocation.upsert({
      where: { clientId },
      create: { locationType: LocationType.CLIENT, clientId },
      update: {},
    });
  }

  async getBalances(
    user: AuthenticatedUser,
    filters?: { locationId?: string; productId?: string; limit?: number; page?: number },
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
      const warehouseId = user.warehouseId !== undefined
        ? user.warehouseId
        : (await this.prisma.user.findUnique({ where: { id: user.id } }))?.warehouseId;
      if (!warehouseId) {
        return [];
      }
      const loc = await this.prisma.stockLocation.findUnique({ where: { warehouseId } });
      if (!loc) return [];
      where.locationId = loc.id;
      where.product = { kind: ProductKind.RAW_MATERIAL };
    } else if (user.role === UserRole.CLIENT_ADMIN) {
      const clientId = user.clientId !== undefined
        ? user.clientId
        : (await this.prisma.user.findUnique({ where: { id: user.id } }))?.clientId;
      if (!clientId) {
        return [];
      }
      const loc = await this.prisma.stockLocation.findUnique({ where: { clientId } });
      if (!loc) return [];
      where.locationId = loc.id;
    }

    const pageSize = filters?.limit ? Math.min(Number(filters.limit), 2000) : 1000;
    const pageNumber = filters?.page ? Math.max(Number(filters.page), 1) : 1;

    const rawBalances = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            kind: true,
            brand: true,
            minQuantity: true,
            trackingMode: true,
            category: { select: { id: true, name: true } },
            units: { where: { isBaseUnit: true }, select: { unitName: true } },
          },
        },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        location: {
          include: {
            warehouse: { select: { id: true, name: true } },
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: pageSize,
      skip: (pageNumber - 1) * pageSize,
    });

    return rawBalances.map((b) => {
      const { physicalQty, availableQty } = calculateProjectedQuantities(b);
      const product = (b as any).product;
      const location = (b as any).location;
      return {
        id: b.id,
        locationId: b.locationId,
        locationName:
          location?.warehouse?.name ||
          location?.client?.name ||
          'Stock Location',
        locationType: location?.locationType || (location?.warehouseId ? 'WAREHOUSE' : 'CLIENT'),
        warehouseId: location?.warehouseId || null,
        clientId: location?.clientId || null,
        productId: b.productId,
        productName: product?.name || 'Product',
        brand: product?.brand || null,
        categoryName: product?.category?.name || 'General',
        categoryId: product?.category?.id || null,
        unit: product?.units?.[0]?.unitName || 'units',
        minThreshold: product?.minQuantity ? Number(product.minQuantity) : 0,
        batchId: b.batchId,
        batchNumber: (b as any).batch?.batchNumber,
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
            some: { locationId: loc.id, product: { kind: ProductKind.RAW_MATERIAL } },
          },
        },
        take: limit,
        orderBy: { postedAt: 'desc' },
        include: {
          entries: {
            where: { locationId: loc.id, product: { kind: ProductKind.RAW_MATERIAL } },
            include: { product: { select: { id: true, name: true, kind: true } } },
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
