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
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { clientId: true },
      });

      if (!dbUser?.clientId || dbUser.clientId !== targetClientId) {
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
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { warehouseId: true },
      });

      if (!dbUser?.warehouseId || dbUser.warehouseId !== targetWarehouseId) {
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
