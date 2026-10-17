import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './decorators/current-user.decorator.js';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertClientAccess(user: AuthenticatedUser, targetClientId: string): Promise<void> {
    if (user.role === UserRole.SUPER_ADMIN) {
      return; // Global access
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const clientId = user.clientId !== undefined
        ? user.clientId
        : (await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { clientId: true },
          }))?.clientId;

      if (!clientId || clientId !== targetClientId) {
        throw new ForbiddenException('Forbidden: cross-client access prohibited');
      }
      return;
    }

    throw new ForbiddenException('Forbidden: Store Admin cannot access client scope');
  }

  async assertWarehouseAccess(user: AuthenticatedUser, targetWarehouseId: string): Promise<void> {
    if (user.role === UserRole.SUPER_ADMIN) {
      return; // Global access
    }

    if (user.role === UserRole.STORE_ADMIN) {
      const warehouseId = user.warehouseId !== undefined
        ? user.warehouseId
        : (await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { warehouseId: true },
          }))?.warehouseId;

      if (!warehouseId || warehouseId !== targetWarehouseId) {
        throw new ForbiddenException('Forbidden: Store Admin can only operate within assigned warehouse');
      }
      return;
    }

    throw new ForbiddenException('Forbidden: Client Admin cannot operate on warehouse scope directly');
  }

  async assertActiveWarehouseClientAssignment(warehouseId: string, clientId: string): Promise<void> {
    const assignment = await this.prisma.clientWarehouseAssignment.findFirst({
      where: {
        warehouseId,
        clientId,
        isActive: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        `Warehouse is not actively assigned to this client. Operation blocked.`,
      );
    }
  }

  assertSuperAdminOnly(user: AuthenticatedUser, actionName: string): void {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(`Forbidden: ${actionName} requires Super Admin authorization`);
    }
  }
}
