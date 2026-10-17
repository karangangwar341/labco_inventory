import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CategoriesService } from './categories.service.js';
import { ProductsService, computeDuplicateKey } from './products.service.js';
import { ApprovalDecision } from './dto/approve-product.dto.js';
import { UserRole, CatalogScope, ProductKind, ProductStatus, TrackingMode } from '@prisma/client';
import {
  ForbiddenException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

describe('Catalog Services (T-005: Categories, Products, Units & Duplicate Detection)', () => {
  let categoriesService: CategoriesService;
  let productsService: ProductsService;
  let mockPrisma: any;
  let mockNotificationsService: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
      category: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      productVersion: {
        updateMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };
    mockNotificationsService = {
      notifySuperAdmins: vi.fn(),
      notifyClientAdmins: vi.fn(),
    };

    categoriesService = new CategoriesService(mockPrisma as any);
    productsService = new ProductsService(mockPrisma as any, mockNotificationsService as any);
  });

  describe('CategoriesService', () => {
    it('blocks Store Admin from creating categories', async () => {
      const storeAdmin: any = { id: 'sa-1', role: UserRole.STORE_ADMIN };
      await expect(
        categoriesService.create({ name: 'Glassware' }, storeAdmin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates company category for Super Admin', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue({
        id: 'cat-1',
        name: 'Chemicals',
        ownerScope: CatalogScope.COMPANY,
      });

      const res = await categoriesService.create({ name: 'Chemicals' }, superAdmin);

      expect(res.name).toBe('Chemicals');
      expect(mockPrisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerScope: CatalogScope.COMPANY,
            clientId: null,
          }),
        }),
      );
    });

    it('creates client category for Client Admin', async () => {
      const clientAdmin: any = { id: 'ca-1', role: UserRole.CLIENT_ADMIN };
      mockPrisma.user.findUnique.mockResolvedValue({ clientId: 'client-apex' });
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue({
        id: 'cat-c1',
        name: 'Custom Reagents',
        ownerScope: CatalogScope.CLIENT,
        clientId: 'client-apex',
      });

      const res = await categoriesService.create({ name: 'Custom Reagents' }, clientAdmin);

      expect(res.name).toBe('Custom Reagents');
      expect(mockPrisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerScope: CatalogScope.CLIENT,
            clientId: 'client-apex',
          }),
        }),
      );
    });
  });

  describe('ProductsService & Duplicate Detection', () => {
    const validProductDto = {
      kind: ProductKind.RAW_MATERIAL,
      name: 'Beaker 250ml',
      brand: 'Borosil',
      categoryId: 'cat-glass',
      quantityPrecision: 0,
      allowFractional: false,
      trackingMode: TrackingMode.NONE,
      attributes: [
        { attributeName: 'Volume', value: '250', unit: 'ml' },
        { attributeName: 'Material', value: 'Borosilicate Glass' },
      ],
      units: [
        { unitName: 'Piece', isBaseUnit: true, conversionToBase: 1 },
        { unitName: 'Box of 10', isBaseUnit: false, conversionToBase: 10 },
      ],
    };

    it('limits Store Admin catalog results to approved company raw materials', async () => {
      const storeAdmin: any = { id: 'store-list-user', role: UserRole.STORE_ADMIN };
      mockPrisma.product.findMany.mockResolvedValue([]);

      await productsService.findAll(storeAdmin);

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          ownerScope: CatalogScope.COMPANY,
          kind: ProductKind.RAW_MATERIAL,
          status: ProductStatus.APPROVED,
        }),
      }));
    });

    it('blocks Store Admin from creating products', async () => {
      const storeAdmin: any = { id: 'sm-1', role: UserRole.STORE_ADMIN };
      await expect(productsService.create(validProductDto as any, storeAdmin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects whole-unit product with nonzero decimal precision (REQ-011)', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      const invalidPrecisionDto = {
        ...validProductDto,
        allowFractional: false,
        quantityPrecision: 2, // invalid
      };

      await expect(
        productsService.create(invalidPrecisionDto as any, superAdmin),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects product without a base unit (REQ-010)', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      const noBaseUnitDto = {
        ...validProductDto,
        units: [{ unitName: 'Box of 10', isBaseUnit: false, conversionToBase: 10 }],
      };

      await expect(productsService.create(noBaseUnitDto as any, superAdmin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('computes identical duplicate keys for normalized specifications (D-003)', () => {
      const key1 = computeDuplicateKey({
        ownerScope: CatalogScope.COMPANY,
        name: '  Beaker 250ml  ',
        categoryId: 'cat-1',
        brand: 'Pyrex',
        attributes: [
          { attributeName: 'Volume', value: '250ml' },
          { attributeName: 'Material', value: 'Glass' },
        ],
      });

      const key2 = computeDuplicateKey({
        ownerScope: CatalogScope.COMPANY,
        name: 'beaker 250ml',
        categoryId: 'cat-1',
        brand: 'PYREX',
        attributes: [
          // Order reversed
          { attributeName: 'Material', value: 'glass' },
          { attributeName: 'Volume', value: '250ml' },
        ],
      });

      expect(key1).toBe(key2);
    });

    it('blocks exact duplicate product creation with ConflictException', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-glass', ownerScope: CatalogScope.COMPANY });
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'existing-p-1' });

      await expect(
        productsService.create(validProductDto as any, superAdmin),
      ).rejects.toThrow(ConflictException);
    });

    it('creates client product in PENDING_APPROVAL status', async () => {
      const clientAdmin: any = { id: 'ca-1', role: UserRole.CLIENT_ADMIN };
      const clientProductDto = { ...validProductDto, kind: ProductKind.MANUFACTURED_PRODUCT };
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-glass', ownerScope: CatalogScope.CLIENT, clientId: 'client-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ clientId: 'client-1' });
      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockPrisma.product.create.mockResolvedValue({
        id: 'new-prod-1',
        name: 'Beaker 250ml',
        ownerScope: CatalogScope.CLIENT,
        clientId: 'client-1',
        status: ProductStatus.PENDING_APPROVAL,
      });

      const res = await productsService.create(clientProductDto as any, clientAdmin);

      expect(res.status).toBe(ProductStatus.PENDING_APPROVAL);
      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ProductStatus.PENDING_APPROVAL,
            ownerScope: CatalogScope.CLIENT,
          }),
        }),
      );
    });

    it('approves pending product when reviewed by Super Admin', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p-1',
        status: ProductStatus.PENDING_APPROVAL,
      });
      mockPrisma.product.update.mockResolvedValue({
        id: 'p-1',
        status: ProductStatus.APPROVED,
        approvedById: 'su-1',
      });

      const res = await productsService.reviewProduct(
        'p-1',
        { decision: ApprovalDecision.APPROVE },
        superAdmin,
      );

      expect(res.status).toBe(ProductStatus.APPROVED);
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p-1' },
          data: expect.objectContaining({
            status: ProductStatus.APPROVED,
            approvedById: 'su-1',
          }),
        }),
      );
    });

    it('rejects pending product with reason', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p-1',
        status: ProductStatus.PENDING_APPROVAL,
      });
      mockPrisma.product.update.mockResolvedValue({
        id: 'p-1',
        status: ProductStatus.REJECTED,
        rejectionReason: 'Substandard grade',
      });

      const res = await productsService.reviewProduct(
        'p-1',
        { decision: ApprovalDecision.REJECT, reason: 'Substandard grade' },
        superAdmin,
      );

      expect(res.status).toBe(ProductStatus.REJECTED);
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p-1' },
          data: expect.objectContaining({
            status: ProductStatus.REJECTED,
            rejectionReason: 'Substandard grade',
          }),
        }),
      );
    });
  });
});
