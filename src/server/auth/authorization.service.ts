import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './decorators/current-user.decorator';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertProjectAccess(user: AuthenticatedUser, targetProjectId: string): Promise<void> {
    if (user.role === UserRole.SUPER_ADMIN) {
      return; // Global access
    }

    if (user.role === UserRole.PROJECT_ADMIN) {
      const projectId = user.projectId !== undefined
        ? user.projectId
        : (await this.prisma.user?.findUnique?.({
            where: { id: user.id },
            select: { projectId: true },
          }))?.projectId;

      if (!projectId || projectId !== targetProjectId) {
        throw new ForbiddenException('Forbidden: Cross-project access denied');
      }
      return;
    }

    throw new ForbiddenException('Forbidden: Store Admin cannot access project scope');
  }

  async assertWarehouseAccess(user: AuthenticatedUser, targetWarehouseId: string): Promise<void> {
    if (user.role === UserRole.SUPER_ADMIN) {
      return; // Global access
    }

    if (user.role === UserRole.STORE_ADMIN) {
      if (user.warehouseId && user.warehouseId === targetWarehouseId) {
        return;
      }

      if (this.prisma.warehouse?.findUnique) {
        const warehouse = await this.prisma.warehouse.findUnique({
          where: { id: targetWarehouseId },
          select: { storeAdminId: true },
        });

        if (warehouse?.storeAdminId === user.id) {
          return;
        }
      }

      if (this.prisma.user?.findUnique) {
        const dbUser = await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { warehouseId: true },
        });
        if (dbUser?.warehouseId === targetWarehouseId) {
          return;
        }
      }

      throw new ForbiddenException('Forbidden: Store Admin can only operate within assigned warehouse');
    }

    throw new ForbiddenException('Forbidden: Project Admin cannot operate on warehouse scope directly');
  }

  async assertActiveWarehouseProjectAssignment(warehouseId: string, projectId: string): Promise<void> {
    const assignment = await this.prisma.projectWarehouseAssignment?.findFirst?.({
      where: {
        warehouseId,
        projectId,
        isActive: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException(`Warehouse ${warehouseId} is not actively assigned to project ${projectId}`);
    }
  }

  sanitizeInboundShipmentForProject<T extends { sourceLocation?: { warehouse?: { name?: string; locationDescription?: string } | null; warehouseId?: string | null } | null; sourceWarehouseId?: string; sourceWarehouseName?: string }>(shipment: T): T {
    const clone = { ...shipment };
    if (clone.sourceLocation) {
      clone.sourceLocation = {
        ...clone.sourceLocation,
        warehouse: null,
        warehouseId: null,
      };
    }
    delete clone.sourceWarehouseId;
    delete clone.sourceWarehouseName;
    return clone;
  }
}
