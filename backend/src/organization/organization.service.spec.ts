import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientsService } from './clients.service.js';
import { WarehousesService } from './warehouses.service.js';
import { UserRole, OrganizationStatus } from '@prisma/client';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Organization Services (Clients & Warehouses)', () => {
  let clientsService: ClientsService;
  let warehousesService: WarehousesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      client: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      clientWarehouseAssignment: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };

    clientsService = new ClientsService(mockPrisma as any);
    warehousesService = new WarehousesService(mockPrisma as any);
  });

  describe('ClientsService', () => {
    it('creates client with unique normalized name', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);
      mockPrisma.client.create.mockResolvedValue({
        id: 'c-1',
        name: 'Apex Manufacturing',
        status: OrganizationStatus.ACTIVE,
      });

      const res = await clientsService.create({ name: '  Apex Manufacturing  ' });

      expect(mockPrisma.client.findUnique).toHaveBeenCalledWith({ where: { name: 'Apex Manufacturing' } });
      expect(res.name).toBe('Apex Manufacturing');
    });

    it('throws ConflictException on duplicate client name', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c-1', name: 'Apex Manufacturing' });

      await expect(clientsService.create({ name: 'Apex Manufacturing' })).rejects.toThrow(ConflictException);
    });

    it('assigns warehouse to client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c-1' });
      mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'w-1' });
      mockPrisma.clientWarehouseAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.clientWarehouseAssignment.create.mockResolvedValue({
        id: 'a-1',
        clientId: 'c-1',
        warehouseId: 'w-1',
        isActive: true,
      });

      const res = await clientsService.assignWarehouse('c-1', 'w-1', 'admin-id');

      expect(res.isActive).toBe(true);
      expect(mockPrisma.clientWarehouseAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'c-1',
            warehouseId: 'w-1',
            isActive: true,
          }),
        }),
      );
    });

    it('deactivates warehouse assignment', async () => {
      mockPrisma.clientWarehouseAssignment.findFirst.mockResolvedValue({
        id: 'a-1',
        clientId: 'c-1',
        warehouseId: 'w-1',
        isActive: true,
      });
      mockPrisma.clientWarehouseAssignment.update.mockResolvedValue({
        id: 'a-1',
        isActive: false,
      });

      const res = await clientsService.deactivateWarehouseAssignment('c-1', 'w-1', 'admin-id');

      expect(res.isActive).toBe(false);
      expect(mockPrisma.clientWarehouseAssignment.update).toHaveBeenCalledWith({
        where: { id: 'a-1' },
        data: expect.objectContaining({
          isActive: false,
          inactiveFrom: expect.any(Date),
        }),
      });
    });
  });

  describe('WarehousesService', () => {
    it('creates warehouse with unique name', async () => {
      mockPrisma.warehouse.findUnique.mockResolvedValue(null);
      mockPrisma.warehouse.create.mockResolvedValue({
        id: 'w-1',
        name: 'Main Depot',
        status: OrganizationStatus.ACTIVE,
      });

      const res = await warehousesService.create({ name: 'Main Depot' });
      expect(res.name).toBe('Main Depot');
    });

    it('scopes warehouse list for Store Admin to assigned warehouse only', async () => {
      const storeAdminUser = {
        id: 'u-store',
        username: 'store_mgr',
        role: UserRole.STORE_ADMIN,
        warehouseId: 'w-assigned-1',
        status: 'ACTIVE',
        sessionId: 's-1',
      };

      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'w-assigned-1' });
      mockPrisma.warehouse.findMany.mockResolvedValue([{ id: 'w-assigned-1', name: 'Assigned Depot' }]);

      const result = await warehousesService.findAll(storeAdminUser);

      expect(mockPrisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'w-assigned-1' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });
});
