import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManufacturingService } from './manufacturing.service.js';
import {
  UserRole,
  ProductionStatus,
  ProductionMode,
  ProductStatus,
  ProductKind,
  CatalogScope,
  TransactionType,
  Prisma,
} from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

describe('Manufacturing Service (T-010: Client Manufacturing Linked & Separate Workflows)', () => {
  let manufacturingService: ManufacturingService;
  let mockPrisma: any;
  let mockLedgerService: any;
  let mockNotificationsService: any;

  const superAdminUser = { id: 'sa-1', username: 'superadmin', role: UserRole.SUPER_ADMIN };
  const clientAdminUser = { id: 'ca-1', username: 'clientadmin', role: UserRole.CLIENT_ADMIN };
  const storeAdminUser = { id: 'sm-1', username: 'storeadmin', role: UserRole.STORE_ADMIN };

  const rawMaterialProduct = {
    id: 'prod-raw',
    name: 'Chemical Reagent A',
    kind: ProductKind.RAW_MATERIAL,
    ownerScope: CatalogScope.COMPANY,
    status: ProductStatus.APPROVED,
    quantityPrecision: 0,
    trackingMode: 'NONE',
    units: [
      {
        id: 'unit-liters',
        unitName: 'LITER',
        conversionToBase: new Prisma.Decimal(1),
        status: 'ACTIVE',
      },
    ],
  };

  const finishedGoodProduct = {
    id: 'prod-finished',
    name: 'Diagnostic Assay Kit',
    kind: ProductKind.MANUFACTURED_PRODUCT,
    ownerScope: CatalogScope.CLIENT,
    clientId: 'client-123',
    status: ProductStatus.APPROVED,
    quantityPrecision: 0,
    trackingMode: 'BATCH_ONLY',
    units: [
      {
        id: 'unit-kits',
        unitName: 'KIT',
        conversionToBase: new Prisma.Decimal(1),
        status: 'ACTIVE',
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
      productionRun: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      stockLocation: {
        findUnique: vi.fn(),
      },
      inventoryBalance: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      ledgerEntry: {
        findMany: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      stockBatch: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };

    mockLedgerService = {
      postTransaction: vi.fn(),
    };
    mockNotificationsService = {
      notifySuperAdmins: vi.fn(),
      notifyClientAdmins: vi.fn(),
      notifyUser: vi.fn(),
    };

    manufacturingService = new ManufacturingService(mockPrisma as any, mockLedgerService as any, mockNotificationsService as any);
  });

  describe('1. Production Run Draft Creation', () => {
    it('creates draft production run without affecting stock', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ clientId: 'client-123' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-client-1' });
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([{ productId: 'prod-raw' }]);
      mockPrisma.ledgerEntry.findMany.mockResolvedValue([]);
      mockPrisma.product.findUnique
        .mockResolvedValueOnce(rawMaterialProduct)
        .mockResolvedValueOnce(finishedGoodProduct);

      const createdRun = {
        id: 'run-1',
        clientId: 'client-123',
        status: ProductionStatus.DRAFT,
      };
      mockPrisma.productionRun.create.mockResolvedValue(createdRun);

      const result = await manufacturingService.createProductionRun(clientAdminUser, {
        mode: ProductionMode.LINKED,
        productionReference: 'BATCH-2026-001',
        plannedOutput: 10,
        inputs: [
          {
            productId: 'prod-raw',
            quantity: 5,
            unitId: 'unit-liters',
          },
        ],
        outputs: [
          {
            productId: 'prod-finished',
            quantity: 10,
            unitId: 'unit-kits',
            batchNumber: 'LOT-KIT-01',
          },
        ],
      });

      expect(result).toBe(createdRun);
      expect(mockLedgerService.postTransaction).not.toHaveBeenCalled();
      expect(mockPrisma.productionRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'client-123',
            status: ProductionStatus.DRAFT,
          }),
        }),
      );
    });

    it('blocks Store Admin from creating client production runs', async () => {
      await expect(
        manufacturingService.createProductionRun(storeAdminUser, {
          inputs: [],
          outputs: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Submission & Raw Material Validation', () => {
    it('rejects submission if raw material available stock at client location is insufficient', async () => {
      const draftRun = {
        id: 'run-1',
        clientId: 'client-123',
        status: ProductionStatus.DRAFT,
        submittedById: clientAdminUser.id,
        inputs: [
          {
            productId: 'prod-raw',
            batchId: null,
            baseQuantity: new Prisma.Decimal(50),
          },
        ],
      };
      mockPrisma.productionRun.findUnique.mockResolvedValue(draftRun);
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-client-1' });

      // Only 30 available usable stock
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        usableQty: new Prisma.Decimal(30),
        reservedQty: new Prisma.Decimal(0),
      });

      await expect(
        manufacturingService.submitProductionRun(clientAdminUser, 'run-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('transitions to PENDING_APPROVAL when raw material availability check passes', async () => {
      const draftRun = {
        id: 'run-1',
        clientId: 'client-123',
        status: ProductionStatus.DRAFT,
        submittedById: clientAdminUser.id,
        inputs: [
          {
            productId: 'prod-raw',
            batchId: null,
            baseQuantity: new Prisma.Decimal(50),
          },
        ],
      };
      mockPrisma.productionRun.findUnique.mockResolvedValue(draftRun);
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-client-1' });

      // 100 available usable stock
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        usableQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(0),
      });

      mockPrisma.productionRun.update.mockResolvedValue({
        id: 'run-1',
        status: ProductionStatus.PENDING_APPROVAL,
      });

      const res = await manufacturingService.submitProductionRun(clientAdminUser, 'run-1');
      expect(res.status).toBe(ProductionStatus.PENDING_APPROVAL);
    });
  });

  describe('3. Super Admin Approval & Atomic Ledger Posting', () => {
    it('atomically posts input deductions and output additions with no partial posting', async () => {
      const pendingRun = {
        id: 'run-1',
        clientId: 'client-123',
        status: ProductionStatus.PENDING_APPROVAL,
        inputs: [
          {
            productId: 'prod-raw',
            batchId: null,
            quantity: new Prisma.Decimal(20),
            unitNameSnapshot: 'LITER',
          },
        ],
        outputs: [
          {
            productId: 'prod-finished',
            batchNumber: 'LOT-KIT-99',
            expiryDate: new Date('2027-12-31'),
            quantity: new Prisma.Decimal(40),
            unitNameSnapshot: 'KIT',
          },
        ],
      };
      mockPrisma.productionRun.findUnique.mockResolvedValue(pendingRun);
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-client-1' });
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-raw',
          name: rawMaterialProduct.name,
          kind: ProductKind.RAW_MATERIAL,
          status: ProductStatus.APPROVED,
          ownerScope: CatalogScope.COMPANY,
          clientId: null,
        },
        {
          id: 'prod-finished',
          name: finishedGoodProduct.name,
          kind: ProductKind.MANUFACTURED_PRODUCT,
          status: ProductStatus.APPROVED,
          ownerScope: CatalogScope.CLIENT,
          clientId: 'client-123',
        },
      ]);
      mockPrisma.stockBatch.findUnique.mockResolvedValue(null);
      mockPrisma.stockBatch.create.mockResolvedValue({ id: 'batch-kit-99' });

      mockPrisma.productionRun.update.mockResolvedValue({
        id: 'run-1',
        status: ProductionStatus.APPROVED,
      });

      const res = await manufacturingService.approveProductionRun(superAdminUser, 'run-1', {
        idempotencyKey: 'prod-app-1',
      });

      expect(res.status).toBe(ProductionStatus.APPROVED);

      // 1. Raw material deduction posted
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.MANUFACTURING_INPUT,
          lines: [
            expect.objectContaining({
              locationId: 'loc-client-1',
              productId: 'prod-raw',
              quantity: 20,
              direction: 'OUT',
            }),
          ],
        }),
        superAdminUser.id,
        expect.anything(),
      );

      // 2. Finished good addition posted in same execution
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.MANUFACTURING_OUTPUT,
          lines: [
            expect.objectContaining({
              locationId: 'loc-client-1',
              productId: 'prod-finished',
              quantity: 40,
              direction: 'IN',
            }),
          ],
        }),
        superAdminUser.id,
        expect.anything(),
      );
    });

    it('idempotency: already approved production run returns immediately without double-posting', async () => {
      const alreadyApproved = {
        id: 'run-1',
        status: ProductionStatus.APPROVED,
      };
      mockPrisma.productionRun.findUnique.mockResolvedValue(alreadyApproved);

      const res = await manufacturingService.approveProductionRun(superAdminUser, 'run-1', {});
      expect(res).toBe(alreadyApproved);
      expect(mockLedgerService.postTransaction).not.toHaveBeenCalled();
    });

    it('rejection requires non-empty reason and updates status to REJECTED', async () => {
      mockPrisma.productionRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: ProductionStatus.PENDING_APPROVAL,
      });

      await expect(
        manufacturingService.rejectProductionRun(superAdminUser, 'run-1', { reason: '' }),
      ).rejects.toThrow(BadRequestException);

      mockPrisma.productionRun.update.mockResolvedValue({
        id: 'run-1',
        status: ProductionStatus.REJECTED,
      });

      const res = await manufacturingService.rejectProductionRun(superAdminUser, 'run-1', {
        reason: 'Formula revision pending',
      });

      expect(res.status).toBe(ProductionStatus.REJECTED);
    });
  });
});
