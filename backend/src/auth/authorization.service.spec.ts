import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthorizationService } from './authorization.service.js';
import { sanitizeShipmentPayload } from './interceptors/shipment-privacy.interceptor.js';
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
      clientWarehouseAssignment: {
        findFirst: vi.fn(),
      },
    };
    authService = new AuthorizationService(mockPrisma as any);
  });

  describe('assertClientAccess', () => {
    it('allows Super Admin full access to any client', async () => {
      const superAdmin: any = { id: 'sa-1', role: UserRole.SUPER_ADMIN };
      await expect(authService.assertClientAccess(superAdmin, 'client-999')).resolves.toBeUndefined();
    });

    it('allows Client Admin access to own client', async () => {
      const clientAdmin: any = { id: 'ca-1', role: UserRole.CLIENT_ADMIN };
      mockPrisma.user.findUnique.mockResolvedValue({ clientId: 'client-123' });

      await expect(authService.assertClientAccess(clientAdmin, 'client-123')).resolves.toBeUndefined();
    });

    it('blocks Client Admin cross-client access with ForbiddenException', async () => {
      const clientAdmin: any = { id: 'ca-1', role: UserRole.CLIENT_ADMIN };
      mockPrisma.user.findUnique.mockResolvedValue({ clientId: 'client-123' });

      await expect(authService.assertClientAccess(clientAdmin, 'other-client-456')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks Store Admin from accessing client tenant scope', async () => {
      const storeAdmin: any = { id: 'sm-1', role: UserRole.STORE_ADMIN };
      await expect(authService.assertClientAccess(storeAdmin, 'client-123')).rejects.toThrow(
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

    it('blocks Client Admin operating directly on warehouse scope', async () => {
      const clientAdmin: any = { id: 'ca-1', role: UserRole.CLIENT_ADMIN };
      await expect(authService.assertWarehouseAccess(clientAdmin, 'wh-main')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertActiveWarehouseClientAssignment', () => {
    it('passes when warehouse-to-client assignment is active', async () => {
      mockPrisma.clientWarehouseAssignment.findFirst.mockResolvedValue({ id: 'ass-1', isActive: true });

      await expect(
        authService.assertActiveWarehouseClientAssignment('wh-1', 'client-1'),
      ).resolves.toBeUndefined();
    });

    it('blocks dispatch when assignment does not exist or is inactive', async () => {
      mockPrisma.clientWarehouseAssignment.findFirst.mockResolvedValue(null);

      await expect(
        authService.assertActiveWarehouseClientAssignment('wh-1', 'client-unassigned'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Inbound Shipment Privacy (sanitizeShipmentPayload)', () => {
    it('redacts source warehouse identity for Client Admin', () => {
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
