import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './decorators/current-user.decorator.js';

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
        : (await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { projectId: true },
          }))?.projectId;

      if (!projectId || projectId !== targetProjectId) {
        throw new ForbiddenException('Forbidden: cross-project access prohibited');
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

    throw new ForbiddenException('Forbidden: Project Admin cannot operate on warehouse scope directly');
  }

  async assertActiveWarehouseProjectAssignment(warehouseId: string, projectId: string): Promise<void> {
    const assignment = await this.prisma.projectWarehouseAssignment.findFirst({
      where: {
        warehouseId,
        projectId,
        isActive: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        `Warehouse is not actively assigned to this project. Operation blocked.`,
      );
    }
  }

  assertSuperAdminOnly(user: AuthenticatedUser, actionName: string): void {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(`Forbidden: ${actionName} requires Super Admin authorization`);
    }
  }
}
