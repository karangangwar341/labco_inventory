import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectsService } from './projects.service';
import { WarehousesService } from './warehouses.service';
import { UserRole, OrganizationStatus, UserStatus } from '@prisma/client';
import { ConflictException, BadRequestException } from '@nestjs/common';

describe('Organization Services (Projects & Warehouses)', () => {
  let projectsService: ProjectsService;
  let warehousesService: WarehousesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
      project: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      projectWarehouseAssignment: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };

    projectsService = new ProjectsService(mockPrisma as any);
    warehousesService = new WarehousesService(mockPrisma as any);
  });

  describe('ProjectsService', () => {
    it('creates project with unique normalized name', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue({
        id: 'c-1',
        name: 'Metro Hospital',
        status: OrganizationStatus.ACTIVE,
      });

      const res = await projectsService.create({ name: ' Metro Hospital ' });
      expect(res.name).toBe('Metro Hospital');
      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Metro Hospital' }),
      });
    });

    it('throws ConflictException on duplicate project name', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'c-1', name: 'Metro Hospital' });

      await expect(projectsService.create({ name: 'Metro Hospital' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('assigns warehouse to project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'c-1' });
      mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'w-1' });
      mockPrisma.projectWarehouseAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.projectWarehouseAssignment.create.mockResolvedValue({
        id: 'a-1',
        projectId: 'c-1',
        warehouseId: 'w-1',
        isActive: true,
      });

      const res = await projectsService.assignWarehouse('c-1', 'w-1', 'admin-id');
      expect(res.isActive).toBe(true);
      expect(mockPrisma.projectWarehouseAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'c-1',
            warehouseId: 'w-1',
            isActive: true,
          }),
        }),
      );
    });

    it('deactivates warehouse assignment', async () => {
      mockPrisma.projectWarehouseAssignment.findFirst.mockResolvedValue({
        id: 'a-1',
        projectId: 'c-1',
        warehouseId: 'w-1',
        isActive: true,
      });
      mockPrisma.projectWarehouseAssignment.update.mockResolvedValue({
        id: 'a-1',
        isActive: false,
      });

      const res = await projectsService.deactivateWarehouseAssignment('c-1', 'w-1', 'admin-id');

      expect(res.isActive).toBe(false);
      expect(mockPrisma.projectWarehouseAssignment.update).toHaveBeenCalledWith({
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

    it('scopes warehouse list for Store Admin to assigned warehouses', async () => {
      const storeAdminUser = {
        id: 'u-store',
        username: 'store_mgr',
        role: UserRole.STORE_ADMIN,
        warehouseId: 'w-assigned-1',
        status: 'ACTIVE',
        sessionId: 's-1',
      };

      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'w-assigned-1' });
      mockPrisma.warehouse.findMany.mockResolvedValue([
        { id: 'w-assigned-1', name: 'Assigned Depot 1', storeAdminId: 'u-store' },
        { id: 'w-assigned-2', name: 'Assigned Depot 2', storeAdminId: 'u-store' },
      ]);

      const result = await warehousesService.findAll(storeAdminUser);

      expect(mockPrisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { storeAdminId: 'u-store' },
              { id: 'w-assigned-1' },
            ],
          },
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('allows Super Admin to assign warehouse to any active Store Admin', async () => {
      mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'w-1', name: 'Depot 1' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-store-2',
        username: 'store_admin_2',
        role: UserRole.STORE_ADMIN,
        status: UserStatus.ACTIVE,
      });
      mockPrisma.warehouse.update.mockResolvedValue({
        id: 'w-1',
        name: 'Depot 1',
        storeAdminId: 'u-store-2',
      });

      const updated = await warehousesService.update('w-1', { storeAdminId: 'u-store-2' });
      expect(mockPrisma.warehouse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'w-1' },
          data: expect.objectContaining({ storeAdminId: 'u-store-2' }),
        }),
      );
      expect(updated.storeAdminId).toBe('u-store-2');
    });

    it('rejects assigning a warehouse to a non-STORE_ADMIN user', async () => {
      mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'w-1', name: 'Depot 1' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-proj-admin',
        username: 'proj_admin',
        role: UserRole.PROJECT_ADMIN,
        status: UserStatus.ACTIVE,
      });

      await expect(
        warehousesService.update('w-1', { storeAdminId: 'u-proj-admin' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates projects in bulk for Super Admin', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.project.create.mockImplementation(({ data }: any) => ({
        id: 'proj-' + Math.random(),
        ...data,
      }));
      mockPrisma.projectWarehouseAssignment.create = vi.fn().mockResolvedValue({ id: 'pwa-1' });

      const res = await projectsService.createBulk({
        items: [
          { name: 'Apex Lab' },
          { name: 'Central Lab', warehouseIds: ['wh-1'] },
        ],
      }, superAdmin);

      expect(res.totalCreated).toBe(2);
      expect(mockPrisma.project.create).toHaveBeenCalledTimes(2);
    });
  });
});
