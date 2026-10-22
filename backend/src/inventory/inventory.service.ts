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
    const cacheKey = `${user.role}_${user.id}_${user.warehouseId || ''}_${user.projectId || ''}`;
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
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      result = locations.map((location) => ({
        id: location.id,
        locationType: location.locationType,
        warehouseId: location.warehouseId,
        projectId: location.projectId,
        name: location.warehouse?.name || location.project?.name || 'Stock location',
      }));
    } else if (user.role === UserRole.STORE_ADMIN) {
      const warehouseId = user.warehouseId !== undefined
        ? user.warehouseId
        : (await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { warehouseId: true },
          }))?.warehouseId;
      if (!warehouseId) return [];

      const assignments = await this.prisma.projectWarehouseAssignment.findMany({
        where: { warehouseId, isActive: true },
        select: { projectId: true },
      });
      const allowedProjectIds = assignments.map((assignment) => assignment.projectId);
      const locations = await this.prisma.stockLocation.findMany({
        where: {
          OR: [
            { warehouseId },
            ...(allowedProjectIds.length ? [{ projectId: { in: allowedProjectIds } }] : []),
          ],
        },
        include: {
          warehouse: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      });
      result = locations.map((location) => ({
        id: location.id,
        locationType: location.locationType,
        warehouseId: location.warehouseId,
        projectId: location.projectId,
        name: location.warehouse?.name || location.project?.name || 'Stock location',
      }));
    } else if (user.role === UserRole.PROJECT_ADMIN) {
      const projectId = user.projectId !== undefined
        ? user.projectId
        : (await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { projectId: true },
          }))?.projectId;
      if (!projectId) return [];
      const location = await this.prisma.stockLocation.findUnique({
        where: { projectId },
        include: { project: { select: { name: true } } },
      });
      if (!location) return [];
      result = [{
        id: location.id,
        locationType: location.locationType,
        projectId: location.projectId,
        name: location.project?.name || 'My location',
      }];
    }

    this.locationsCache.set(cacheKey, { data: result, expiresAt: now + 45_000 });
    return result;
  }

  async getLowStockCount(user: AuthenticatedUser): Promise<{ count: number }> {
    const cacheKey = `${user.role}_${user.warehouseId || ''}_${user.projectId || ''}_${user.id}`;
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
      } else if (user.role === UserRole.PROJECT_ADMIN) {
        const projectId =
          user.projectId ||
          (await this.prisma.user.findUnique({ where: { id: user.id } }))?.projectId;
        if (!projectId) return { count: 0 };
        const loc = await this.prisma.stockLocation.findUnique({ where: { projectId } });
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

  async getOrCreateLocationForProject(projectId: string) {
    return this.prisma.stockLocation.upsert({
      where: { projectId },
      create: { locationType: LocationType.PROJECT, projectId },
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
    } else if (user.role === UserRole.PROJECT_ADMIN) {
      const projectId = user.projectId !== undefined
        ? user.projectId
        : (await this.prisma.user.findUnique({ where: { id: user.id } }))?.projectId;
      if (!projectId) {
        return [];
      }
      const loc = await this.prisma.stockLocation.findUnique({ where: { projectId } });
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
            category: { select: { id: true, name: true } },
            units: { where: { isBaseUnit: true }, select: { unitName: true } },
          },
        },
        location: {
          include: {
            warehouse: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
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
          location?.project?.name ||
          'Stock Location',
        locationType: location?.locationType || (location?.warehouseId ? 'WAREHOUSE' : 'PROJECT'),
        warehouseId: location?.warehouseId || null,
        projectId: location?.projectId || null,
        productId: b.productId,
        productName: product?.name || 'Product',
        brand: product?.brand || null,
        categoryName: product?.category?.name || 'General',
        categoryId: product?.category?.id || null,
        unit: product?.units?.[0]?.unitName || 'units',
        minThreshold: product?.minQuantity ? Number(product.minQuantity) : 0,
        usableQty: b.usableQty,
        reservedQty: b.reservedQty,
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

    if (user.role === UserRole.PROJECT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.projectId) return [];
      const loc = await this.getOrCreateLocationForProject(dbUser.projectId);

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
