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
        findFirst: vi.fn(),
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
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      category: {
        findMany: vi.fn(),
      },
      product: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
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

    it('clones company catalog products to a project', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', name: 'Apollo Project' });
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-co-1',
          name: 'N95 Mask',
          brand: '3M',
          description: 'Protective mask',
          categoryId: 'cat-1',
          quantityPrecision: 0,
          allowFractional: false,
          minQuantity: 10,
          units: [{ unitName: 'Box', isBaseUnit: true, conversionToBase: 1 }],
          attributes: [{ attributeName: 'Color', value: 'White', sortOrder: 0 }],
        },
      ]);
      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockPrisma.product.findFirst.mockResolvedValue(null);
      mockPrisma.product.create.mockResolvedValue({ id: 'prod-cloned-1' });

      const res = await projectsService.cloneCompanyProductsToProject('proj-1', ['prod-co-1'], superAdmin);
      expect(res.success).toBe(true);
      expect(res.clonedCount).toBe(1);
      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'N95 Mask',
            kind: 'MANUFACTURED_PRODUCT',
            ownerScope: 'PROJECT',
            projectId: 'proj-1',
          }),
        }),
      );
    });

    it('clones company catalog products by category IDs to a project', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', name: 'Apollo Project' });
      mockPrisma.category.findMany.mockResolvedValue([{ id: 'cat-cotton' }, { id: 'sub-cotton' }]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-co-cotton',
          name: 'Cotton Roll',
          brand: 'Labco',
          description: 'Medical cotton',
          categoryId: 'cat-cotton',
          quantityPrecision: 0,
          allowFractional: false,
          minQuantity: 10,
          units: [{ unitName: 'Roll', isBaseUnit: true, conversionToBase: 1 }],
          attributes: [],
        },
      ]);
      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockPrisma.product.create.mockResolvedValue({ id: 'prod-cloned-cotton' });

      const res = await projectsService.cloneCompanyProductsToProject(
        'proj-1',
        { categoryIds: ['cat-cotton'] },
        superAdmin,
      );
      expect(res.success).toBe(true);
      expect(res.clonedCount).toBe(1);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: { in: ['cat-cotton', 'sub-cotton'] },
          }),
        }),
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
            status: OrganizationStatus.ACTIVE,
            OR: [
              { storeAdminId: 'u-store' },
              { id: 'w-assigned-1', storeAdminId: null },
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

    it('revokes store admin assignment and cleans up user warehouseId pointers', async () => {
      mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'w-1', name: 'Depot 1', storeAdminId: 'u-store-1' });
      mockPrisma.warehouse.findFirst.mockResolvedValue(null);
      mockPrisma.warehouse.update.mockResolvedValue({ id: 'w-1', name: 'Depot 1', storeAdminId: null });

      const updated = await warehousesService.update('w-1', { storeAdminId: null });
      expect(mockPrisma.warehouse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'w-1' },
          data: expect.objectContaining({ storeAdminId: null }),
        }),
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-store-1' },
          data: { warehouseId: null },
        }),
      );
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { warehouseId: 'w-1', id: { not: '' } },
          data: { warehouseId: null },
        }),
      );
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
