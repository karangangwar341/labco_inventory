import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LedgerService } from './ledger.service.js';
import { InventoryService } from './inventory.service.js';
import { calculateProjectedQuantities } from './inventory.types.js';
import {
  UserRole,
  LocationType,
  TransactionType,
  StockCondition,
  Prisma,
} from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('Inventory & Ledger Service (T-006: Immutable Ledger & Balance Projections)', () => {
  let ledgerService: LedgerService;
  let inventoryService: InventoryService;
  let mockPrisma: any;

  const mockProduct = {
    id: 'prod-1',
    name: 'Beaker 500ml',
    quantityPrecision: 0,
    units: [
      {
        id: 'unit-box',
        unitName: 'BOX',
        conversionToBase: new Prisma.Decimal(10),
        isBaseUnit: false,
      },
      {
        id: 'unit-ea',
        unitName: 'EACH',
        conversionToBase: new Prisma.Decimal(1),
        isBaseUnit: true,
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
      ledgerTransaction: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
      inventoryBalance: {
        findFirst: vi.fn(),
        create: vi.fn(async (args) => ({
          id: 'bal-1',
          usableQty: new Prisma.Decimal(0),
          reservedQty: new Prisma.Decimal(0),
          version: 0,
          ...args?.data,
        })),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
      },
      stockLocation: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(async (args) => ({
          id: 'loc-wh-1',
          locationType: 'WAREHOUSE',
          warehouseId: args?.where?.warehouseId || 'wh-1',
        })),
      },
      user: {
        findUnique: vi.fn(),
      },
      productUnit: {
        findFirst: vi.fn(async (args) => {
          if (args?.where?.unitName === 'BOX' || args?.where?.id === 'unit-box') {
            return {
              id: 'unit-box',
              unitName: 'BOX',
              conversionToBase: new Prisma.Decimal(10),
              isBaseUnit: false,
            };
          }
          return {
            id: 'unit-ea',
            unitName: 'EACH',
            conversionToBase: new Prisma.Decimal(1),
            isBaseUnit: true,
          };
        }),
      },
    };

    ledgerService = new LedgerService(mockPrisma as any);
    inventoryService = new InventoryService(mockPrisma as any);
  });

  describe('Invariant: Projected Quantities Calculation', () => {
    it('calculates physical = usable, and available = usable - reserved', () => {
      const balance = {
        usableQty: new Prisma.Decimal('100.5'),
        reservedQty: new Prisma.Decimal('20.5'),
      };

      const projected = calculateProjectedQuantities(balance);

      expect(projected.physicalQty.toString()).toBe('100.5');
      expect(projected.availableQty.toString()).toBe('80');
    });

    it('calculates available = 0 when usable == reserved', () => {
      const balance = {
        usableQty: new Prisma.Decimal('50'),
        reservedQty: new Prisma.Decimal('50'),
      };

      const projected = calculateProjectedQuantities(balance);
      expect(projected.availableQty.toString()).toBe('0');
      expect(projected.physicalQty.toString()).toBe('50');
    });
  });

  describe('LedgerService.postTransaction', () => {

    it('returns existing transaction if idempotencyKey has already been posted', async () => {
      const existingTx = {
        id: 'tx-existing',
        idempotencyKey: 'idem-123',
        transactionType: TransactionType.STOCK_IN,
      };
      mockPrisma.ledgerTransaction.findUnique.mockResolvedValue(existingTx);

      const result = await (ledgerService as any).postTransaction({
        idempotencyKey: 'idem-123',
        transactionType: TransactionType.STOCK_IN,
        lines: [],
      }, 'admin-1');

      expect(result).toBe(existingTx);
      expect(mockPrisma.ledgerTransaction.create).not.toHaveBeenCalled();
    });

    it('successfully posts stock-in transaction with decimal base conversion and creates balance', async () => {
      mockPrisma.ledgerTransaction.findUnique.mockResolvedValue(null);
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue(null);

      const createdBalance = {
        id: 'bal-1',
        usableQty: new Prisma.Decimal(0),
        reservedQty: new Prisma.Decimal(0),
        version: 0,
      };
      mockPrisma.inventoryBalance.create.mockResolvedValue(createdBalance);

      const createdTx = {
        id: 'tx-new',
        idempotencyKey: 'idem-456',
        transactionType: TransactionType.STOCK_IN,
        entries: [],
      };
      mockPrisma.ledgerTransaction.create.mockResolvedValue(createdTx);

      const result = await (ledgerService as any).postTransaction({
        idempotencyKey: 'idem-456',
        transactionType: TransactionType.STOCK_IN,
        lines: [
          {
            locationId: 'loc-1',
            productId: 'prod-1',
            condition: StockCondition.USABLE,
            quantity: 5,
            direction: 'IN',
            unitName: 'BOX',
          },
        ],
      }, 'admin-1');

      expect(result).toBe(createdTx);
      expect(mockPrisma.inventoryBalance.create).toHaveBeenCalled();
      expect(mockPrisma.inventoryBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bal-1' },
          data: expect.objectContaining({
            usableQty: new Prisma.Decimal(50),
          }),
        }),
      );
    });

    it('rejects deduction when usable stock minus reserved is insufficient (no negative usable stock)', async () => {
      mockPrisma.ledgerTransaction.findUnique.mockResolvedValue(null);
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct);

      // Current balance: usable 10, reserved 8 -> available = 2
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        usableQty: new Prisma.Decimal(10),
        reservedQty: new Prisma.Decimal(8),
        version: 1,
      });

      // Attempt to deduct 5 EACH (available is only 2)
      await expect(
        (ledgerService as any).postTransaction({
          idempotencyKey: 'idem-789',
          transactionType: TransactionType.STOCK_OUT,
          lines: [
            {
              locationId: 'loc-1',
              productId: 'prod-1',
              condition: StockCondition.USABLE,
              quantity: 5,
              direction: 'OUT',
              unitName: 'EACH',
            },
          ],
        }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('posts damaged stock-out as a usable stock deduction with a damaged ledger flag', async () => {
      mockPrisma.ledgerTransaction.findUnique.mockResolvedValue(null);
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.inventoryBalance.update = vi.fn();
      mockPrisma.ledgerTransaction.create.mockResolvedValue({ id: 'tx-damaged' });

      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        usableQty: new Prisma.Decimal(10),
        reservedQty: new Prisma.Decimal(0),
        version: 1,
      });

      await (ledgerService as any).postTransaction({
          idempotencyKey: 'idem-damaged',
          transactionType: TransactionType.STOCK_OUT,
          reason: 'Container cracked during handling',
          lines: [
            {
              locationId: 'loc-1',
              productId: 'prod-1',
              condition: StockCondition.DAMAGED,
              quantity: 2,
              direction: 'OUT',
              unitName: 'EACH',
            },
          ],
        }, 'admin-1');

      expect(mockPrisma.inventoryBalance.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ usableQty: new Prisma.Decimal(8) }),
      }));
      expect(mockPrisma.ledgerTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          reason: 'Container cracked during handling',
          entries: expect.objectContaining({
            create: expect.arrayContaining([expect.objectContaining({ condition: StockCondition.DAMAGED })]),
          }),
        }),
      }));
    });

    it('enforces whole-unit precision constraint on base quantity', async () => {
      mockPrisma.ledgerTransaction.findUnique.mockResolvedValue(null);
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct);

      // Qty has decimal part for whole-unit product
      await expect(
        (ledgerService as any).postTransaction({
          idempotencyKey: 'idem-prec',
          transactionType: TransactionType.STOCK_IN,
          lines: [
            {
              locationId: 'loc-1',
              productId: 'prod-1',
              condition: StockCondition.USABLE,
              quantity: 1.5,
              direction: 'IN',
              unitName: 'EACH',
            },
          ],
        }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('LedgerService.reverseTransaction', () => {
    it('creates compensating entry linked to original transaction and prevents duplicate reversal', async () => {
      const originalTx = {
        id: 'orig-tx-1',
        entries: [
          {
            id: 'entry-1',
            locationId: 'loc-1',
            productId: 'prod-1',
            condition: StockCondition.USABLE,
            qtyDeltaBase: new Prisma.Decimal(20),
            originalQty: new Prisma.Decimal(20),
            unitNameSnapshot: 'EACH',
            conversionToBaseSnapshot: new Prisma.Decimal(1),
          },
        ],
      };

      mockPrisma.ledgerTransaction.findUnique.mockResolvedValue(originalTx);
      // Not yet reversed
      mockPrisma.ledgerTransaction.findFirst.mockResolvedValue(null);

      // Balance has enough usable stock (30 usable, 0 reserved -> 30 available)
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        usableQty: new Prisma.Decimal(30),
        reservedQty: new Prisma.Decimal(0),
        version: 1,
      });

      const reversalCreated = {
        id: 'rev-tx-1',
        transactionType: TransactionType.REVERSAL,
        reversalOfTxId: 'orig-tx-1',
      };
      mockPrisma.ledgerTransaction.create.mockResolvedValue(reversalCreated);

      const result = await ledgerService.reverseTransaction('orig-tx-1', 'admin-1', 'Incorrect count');
      expect(result).toBe(reversalCreated);

      // Verify balance was reduced by 20 (negated delta of +20)
      expect(mockPrisma.inventoryBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bal-1' },
          data: expect.objectContaining({
            usableQty: new Prisma.Decimal(10),
          }),
        }),
      );

      // Verify create recorded compensating entry
      expect(mockPrisma.ledgerTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            transactionType: TransactionType.REVERSAL,
            reversalOfTxId: 'orig-tx-1',
          }),
        }),
      );
    });

    it('rejects reversal if already reversed', async () => {
      mockPrisma.ledgerTransaction.findUnique.mockResolvedValue({ id: 'orig-tx-1', entries: [] });
      mockPrisma.ledgerTransaction.findFirst.mockResolvedValue({ id: 'existing-rev' });

      await expect(
        ledgerService.reverseTransaction('orig-tx-1', 'admin-1', 'Duplicate attempt'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects historical correction if reason is empty', async () => {
      await expect(
        ledgerService.correctTransaction(
          'orig-tx-1',
          { reason: '', replacementLines: [] },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('atomically executes reversal and replacement for historical transaction correction', async () => {
      const originalTx = {
        id: 'orig-tx-1',
        entries: [
          {
            id: 'entry-1',
            locationId: 'loc-1',
            productId: 'prod-1',
            condition: StockCondition.USABLE,
            qtyDeltaBase: new Prisma.Decimal(20),
            originalQty: new Prisma.Decimal(20),
            unitNameSnapshot: 'EACH',
            conversionToBaseSnapshot: new Prisma.Decimal(1),
          },
        ],
      };
      mockPrisma.ledgerTransaction.findUnique.mockResolvedValue(originalTx);
      mockPrisma.ledgerTransaction.findFirst.mockResolvedValue(null);

      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        usableQty: new Prisma.Decimal(30),
        reservedQty: new Prisma.Decimal(0),
        version: 1,
      });

      const reversalCreated = {
        id: 'rev-tx-1',
        transactionType: TransactionType.REVERSAL,
        reversalOfTxId: 'orig-tx-1',
      };
      const replacementCreated = {
        id: 'rep-tx-1',
        transactionType: TransactionType.ADJUSTMENT,
        sourceRefType: 'CORRECTION_REPLACEMENT',
        sourceRefId: 'orig-tx-1',
      };

      mockPrisma.ledgerTransaction.create
        .mockResolvedValueOnce(reversalCreated)
        .mockResolvedValueOnce(replacementCreated);

      mockPrisma.product.findUnique.mockResolvedValue(mockProduct);

      const result = await ledgerService.correctTransaction(
        'orig-tx-1',
        {
          reason: 'Count miscalculation by shift auditor',
          replacementLines: [
            {
              locationId: 'loc-1',
              productId: 'prod-1',
              condition: StockCondition.USABLE,
              quantity: 25,
              direction: 'IN',
              unitName: 'EACH',
            },
          ],
        },
        'admin-1',
      );

      expect(result.reversal).toBe(reversalCreated);
      expect(result.replacement).toBe(replacementCreated);
    });
  });

  describe('InventoryService.getBalances', () => {
    it('scopes query to assigned warehouse for STORE_ADMIN', async () => {
      const storeAdmin: any = { id: 'user-sm', role: UserRole.STORE_ADMIN };
      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'wh-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-wh-1' });

      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        {
          id: 'b-1',
          locationId: 'loc-wh-1',
          productId: 'prod-1',
          usableQty: new Prisma.Decimal(100),
          reservedQty: new Prisma.Decimal(10),
          updatedAt: new Date(),
        },
      ]);

      const balances = await inventoryService.getBalances(storeAdmin);
      expect(balances).toHaveLength(1);
      expect(balances[0].availableQty.toString()).toBe('90');
      expect(balances[0].physicalQty.toString()).toBe('100');
      expect(mockPrisma.inventoryBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            locationId: 'loc-wh-1',
            product: { kind: 'RAW_MATERIAL' },
          },
        }),
      );
    });
  });
});
