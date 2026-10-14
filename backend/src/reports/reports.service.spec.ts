import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportsService } from './reports.service.js';
import {
  UserRole,
  StockCondition,
  TransactionType,
  Prisma,
} from '@prisma/client';
import { ReportType, ReportFormat } from './dto/query-report.dto.js';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('Reports Service (T-014: Reports, exports and export audit)', () => {
  let reportsService: ReportsService;
  let mockPrisma: any;

  const superAdminUser: any = {
    id: 'sa-1',
    username: 'superadmin',
    role: UserRole.SUPER_ADMIN,
    status: 'ACTIVE',
    sessionId: 'sess-1',
  };

  const clientAdminUser: any = {
    id: 'ca-1',
    username: 'clientadmin',
    role: UserRole.CLIENT_ADMIN,
    status: 'ACTIVE',
    sessionId: 'sess-2',
  };

  const storeAdminUser: any = {
    id: 'sm-1',
    username: 'storeadmin',
    role: UserRole.STORE_ADMIN,
    status: 'ACTIVE',
    sessionId: 'sess-3',
  };

  beforeEach(() => {
    mockPrisma = {
      stockLocation: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      inventoryBalance: {
        findMany: vi.fn(),
      },
      ledgerEntry: {
        findMany: vi.fn(),
      },
      stockBatch: {
        findMany: vi.fn(),
      },
      departmentIssue: {
        findMany: vi.fn(),
      },
      departmentReturn: {
        findMany: vi.fn(),
      },
      productionRun: {
        findMany: vi.fn(),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        findMany: vi.fn(),
      },
    };

    reportsService = new ReportsService(mockPrisma as any);
  });

  describe('1. Stock Balance Report (Physical & Available Invariants)', () => {
    it('calculates Available = Usable - Reserved and Physical = Usable + Damaged + Expired', async () => {
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        {
          usableQty: new Prisma.Decimal(100),
          reservedQty: new Prisma.Decimal(30),
          damagedQty: new Prisma.Decimal(5),
          expiredQty: new Prisma.Decimal(15),
          product: { id: 'p1', name: 'Diagnostic Kit', minQuantity: new Prisma.Decimal(80) },
          location: { id: 'loc-1', locationType: 'WAREHOUSE', warehouse: { name: 'Main Depot' } },
          batch: { batchNumber: 'LOT-100', expiryDate: new Date('2027-01-01') },
        },
      ]);

      const result = await reportsService.generateReport(
        ReportType.STOCK_BALANCE,
        { format: ReportFormat.JSON },
        superAdminUser,
      );

      const row = result.data[0];
      expect(row.usableQuantity).toBe(100);
      expect(row.reservedQuantity).toBe(30);
      expect(row.availableQuantity).toBe(70); // 100 - 30
      expect(row.damagedQuantity).toBe(5);
      expect(row.expiredQuantity).toBe(15);
      expect(row.physicalQuantity).toBe(120); // 100 + 5 + 15
      expect(row.lowStockAlert).toBe(true); // 70 < minThreshold 80

      // Audit trail logged
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REPORT_EXPORT',
            actorUserId: 'sa-1',
            entityId: 'STOCK_BALANCE',
          }),
        }),
      );
    });
  });

  describe('2. Inventory Ledger Report & Source Warehouse Privacy Invariant', () => {
    it('redacts warehouse identity when Client Admin views inbound warehouse movements', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'ca-1', clientId: 'client-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-client-1' });

      mockPrisma.ledgerEntry.findMany.mockResolvedValue([
        {
          originalQty: new Prisma.Decimal(50),
          qtyDeltaBase: new Prisma.Decimal(-50),
          unitNameSnapshot: 'BOX',
          condition: StockCondition.USABLE,
          transaction: {
            postedAt: new Date('2026-05-01'),
            transactionType: TransactionType.TRANSFER_DISPATCH,
            sourceRefType: 'SHIPMENT',
            postedBy: { username: 'operator' },
          },
          product: { name: 'Reagent Alpha' },
          location: {
            id: 'loc-wh-secret',
            locationType: 'WAREHOUSE',
            warehouse: { name: 'Confidential Central Depot' },
          },
          batch: null,
        },
      ]);

      const result = await reportsService.generateReport(
        ReportType.INVENTORY_LEDGER,
        { format: ReportFormat.JSON },
        clientAdminUser,
      );

      const row = result.data[0];
      // Invariant check: Inbound privacy filter masks source warehouse identity
      expect(row.locationName).toBe('[REDACTED]');
    });
  });

  describe('3. Batch Expiry & Days Remaining Calculation', () => {
    it('calculates days remaining and flags expired batches', async () => {
      const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      mockPrisma.stockBatch.findMany.mockResolvedValue([
        {
          id: 'b-exp',
          batchNumber: 'LOT-EXPIRED',
          expiryDate: pastDate,
          status: 'ACTIVE',
          product: { name: 'Enzyme Solution' },
          balances: [
            { usableQty: new Prisma.Decimal(0), expiredQty: new Prisma.Decimal(20), damagedQty: new Prisma.Decimal(0) },
          ],
        },
      ]);

      const result = await reportsService.generateReport(
        ReportType.BATCH_EXPIRY,
        { format: ReportFormat.JSON },
        superAdminUser,
      );

      const row = result.data[0];
      expect(row.isExpired).toBe(true);
      expect(row.daysRemaining).toBeLessThanOrEqual(0);
      expect(row.expiredQuantity).toBe(20);
    });
  });

  describe('4. Role & Tenant Isolation Boundaries', () => {
    it('forbids Store Admin from accessing other warehouse locations', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'sm-1', warehouseId: 'wh-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-wh-1' });

      await expect(
        reportsService.generateReport(
          ReportType.STOCK_BALANCE,
          { locationId: 'loc-wh-2', format: ReportFormat.JSON },
          storeAdminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids Client Admin from accessing other client locations', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'ca-1', clientId: 'client-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-client-1' });

      await expect(
        reportsService.generateReport(
          ReportType.STOCK_BALANCE,
          { locationId: 'loc-client-2', format: ReportFormat.JSON },
          clientAdminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('5. CSV Formula-Injection Defense & Neutralization (Test Plan 61)', () => {
    it('neutralizes =, +, -, @ formula characters in CSV export', async () => {
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        {
          usableQty: new Prisma.Decimal(10),
          reservedQty: new Prisma.Decimal(0),
          damagedQty: new Prisma.Decimal(0),
          expiredQty: new Prisma.Decimal(0),
          product: { id: 'p-inj', name: '=cmd|"/c calc"!A0', minQuantity: new Prisma.Decimal(0) },
          location: { id: 'loc-1', locationType: 'WAREHOUSE', warehouse: { name: '+MaliciousWarehouse' } },
          batch: null,
        },
      ]);

      const result = await reportsService.generateReport(
        ReportType.STOCK_BALANCE,
        { format: ReportFormat.CSV },
        superAdminUser,
      );

      // Verify formula injection characters are escaped by prepending apostrophe
      expect(result.csvData).toContain(`"'=cmd|""/c calc""!A0"`);
      expect(result.csvData).toContain(`"'+MaliciousWarehouse"`);
    });
  });

  describe('6. Immutable Audit Trail (REQ-021 & Test Plan 62)', () => {
    it('records export event and does not expose passwords or secrets in audit payload', async () => {
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([]);

      await reportsService.generateReport(
        ReportType.STOCK_BALANCE,
        { format: ReportFormat.CSV },
        superAdminUser,
      );

      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REPORT_EXPORT',
            actorUserId: 'sa-1',
            entityType: 'REPORT',
            entityId: 'STOCK_BALANCE',
          }),
        }),
      );

      const auditPayload = mockPrisma.auditEvent.create.mock.calls[0][0].data;
      const str = JSON.stringify(auditPayload);
      expect(str).not.toContain('password');
      expect(str).not.toContain('token');
      expect(str).not.toContain('secret');
    });
  });
});
