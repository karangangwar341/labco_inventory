import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthorizationService } from './authorization.service';
import { sanitizeShipmentPayload } from './interceptors/shipment-privacy.interceptor';
import { UserRole } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

describe('AuthorizationService (T-004: Tenancy & Role-Scoped Isolation)', () => {
  let authService: AuthorizationService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
      },
      projectWarehouseAssignment: {
        findFirst: vi.fn(),
      },
    };
    authService = new AuthorizationService(mockPrisma as any);
  });

  describe('assertProjectAccess', () => {
    it('allows Super Admin full access to any project', async () => {
      const superAdmin: any = { id: 'sa-1', role: UserRole.SUPER_ADMIN };
      await expect(authService.assertProjectAccess(superAdmin, 'project-999')).resolves.toBeUndefined();
    });

    it('allows Project Admin access to own project', async () => {
      const projectAdmin: any = { id: 'ca-1', role: UserRole.PROJECT_ADMIN };
      mockPrisma.user.findUnique.mockResolvedValue({ projectId: 'project-123' });

      await expect(authService.assertProjectAccess(projectAdmin, 'project-123')).resolves.toBeUndefined();
    });

    it('blocks Project Admin cross-project access with ForbiddenException', async () => {
      const projectAdmin: any = { id: 'ca-1', role: UserRole.PROJECT_ADMIN };
      mockPrisma.user.findUnique.mockResolvedValue({ projectId: 'project-123' });

      await expect(authService.assertProjectAccess(projectAdmin, 'other-project-456')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks Store Admin from accessing project tenant scope', async () => {
      const storeAdmin: any = { id: 'sm-1', role: UserRole.STORE_ADMIN };
      await expect(authService.assertProjectAccess(storeAdmin, 'project-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertWarehouseAccess', () => {
    it('allows Super Admin access to any warehouse', async () => {
      const superAdmin: any = { id: 'sa-1', role: UserRole.SUPER_ADMIN };
      await expect(authService.assertWarehouseAccess(superAdmin, 'wh-999')).resolves.toBeUndefined();
    });

    it('allows Store Admin access to own assigned warehouse', async () => {
      const storeAdmin: any = { id: 'sm-1', role: UserRole.STORE_ADMIN };
      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'wh-main' });

      await expect(authService.assertWarehouseAccess(storeAdmin, 'wh-main')).resolves.toBeUndefined();
    });

    it('blocks Store Admin operating outside assigned warehouse with ForbiddenException', async () => {
      const storeAdmin: any = { id: 'sm-1', role: UserRole.STORE_ADMIN };
      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'wh-main' });

      await expect(authService.assertWarehouseAccess(storeAdmin, 'other-wh')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks Project Admin operating directly on warehouse scope', async () => {
      const projectAdmin: any = { id: 'ca-1', role: UserRole.PROJECT_ADMIN };
      await expect(authService.assertWarehouseAccess(projectAdmin, 'wh-main')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertActiveWarehouseProjectAssignment', () => {
    it('passes when warehouse-to-project assignment is active', async () => {
      mockPrisma.projectWarehouseAssignment.findFirst.mockResolvedValue({ id: 'ass-1', isActive: true });

      await expect(
        authService.assertActiveWarehouseProjectAssignment('wh-1', 'project-1'),
      ).resolves.toBeUndefined();
    });

    it('blocks dispatch when assignment does not exist or is inactive', async () => {
      mockPrisma.projectWarehouseAssignment.findFirst.mockResolvedValue(null);

      await expect(
        authService.assertActiveWarehouseProjectAssignment('wh-1', 'project-unassigned'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Inbound Shipment Privacy (sanitizeShipmentPayload)', () => {
    it('redacts source warehouse identity for Project Admin', () => {
      const rawShipment = {
        id: 'shipment-001',
        trackingNumber: 'TRK-987',
        status: 'IN_TRANSIT',
        sourceWarehouseId: 'secret-wh-id-123',
        sourceWarehouse: { id: 'secret-wh-id-123', name: 'Internal Mega Warehouse Alpha' },
        items: [
          { productId: 'prod-1', quantity: 100 },
        ],
      };

      const sanitized = sanitizeShipmentPayload(rawShipment);

      expect(sanitized.id).toBe('shipment-001');
      expect(sanitized.sourceWarehouseId).toBeUndefined();
      expect(sanitized.sourceWarehouse).toBeUndefined();
      expect(sanitized.sourceDescription).toBe('Central Warehouse Dispatch');
      expect(sanitized.items[0].quantity).toBe(100);
    });
  });
});
