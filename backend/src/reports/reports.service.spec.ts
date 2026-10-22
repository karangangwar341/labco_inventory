import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { ReportsService } from './reports.service.js';
import {
  UserRole,
  StockCondition,
  TransactionType,
  ProductKind,
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

  const projectAdminUser: any = {
    id: 'ca-1',
    username: 'projectadmin',
    role: UserRole.PROJECT_ADMIN,
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
    it('limits Store Admin stock reports to raw materials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'wh-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-wh-1' });
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([]);

      await reportsService.generateReport(
        ReportType.STOCK_BALANCE,
        { format: ReportFormat.JSON },
        storeAdminUser,
      );

      expect(mockPrisma.inventoryBalance.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          locationId: { in: ['loc-wh-1'] },
          product: { kind: ProductKind.RAW_MATERIAL },
        },
      }));
    });

    it('calculates Available = Usable - Reserved and Physical = Usable', async () => {
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        {
          usableQty: new Prisma.Decimal(100),
          reservedQty: new Prisma.Decimal(30),
          product: { id: 'p1', name: 'Diagnostic Kit', minQuantity: new Prisma.Decimal(80) },
          location: { id: 'loc-1', locationType: 'WAREHOUSE', warehouse: { name: 'Main Depot' } },
        },
      ]);

      const result = await reportsService.generateReport(
        ReportType.STOCK_BALANCE,
        { format: ReportFormat.JSON },
        superAdminUser,
      );

      const row = result.data![0];
      expect(row.usableQuantity).toBe(100);
      expect(row.reservedQuantity).toBe(30);
      expect(row.availableQuantity).toBe(70); // 100 - 30
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
    it('redacts warehouse identity when Project Admin views inbound warehouse movements', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'ca-1', projectId: 'project-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-project-1' });

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
        },
      ]);

      const result = await reportsService.generateReport(
        ReportType.INVENTORY_LEDGER,
        { format: ReportFormat.JSON },
        projectAdminUser,
      );

      const row = result.data![0];
      // Invariant check: Inbound privacy filter masks source warehouse identity
      expect(row.locationName).toBe('[REDACTED]');
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

    it('forbids Project Admin from accessing other project locations', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'ca-1', projectId: 'project-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-project-1' });

      await expect(
        reportsService.generateReport(
          ReportType.STOCK_BALANCE,
          { locationId: 'loc-project-2', format: ReportFormat.JSON },
          projectAdminUser,
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
          product: { id: 'p-inj', name: '=cmd|"/c calc"!A0', minQuantity: new Prisma.Decimal(0) },
          location: { id: 'loc-1', locationType: 'WAREHOUSE', warehouse: { name: '+MaliciousWarehouse' } },
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

    it('preserves legitimate negative stock deltas without prepending apostrophe in CSV export', async () => {
      mockPrisma.ledgerEntry.findMany.mockResolvedValue([
        {
          transaction: {
            id: 'tx-1',
            transactionType: TransactionType.TRANSFER_DISPATCH,
            sourceRefType: 'STOCK_REQUEST',
            sourceRefId: 'sr-1',
            postedAt: new Date('2026-10-22'),
            postedBy: { id: 'u-1', username: 'superadmin', role: UserRole.SUPER_ADMIN },
          },
          product: { id: 'p-1', name: 'Test Product' },
          location: { id: 'loc-1', locationType: 'WAREHOUSE', warehouse: { name: 'Main Depot' } },
          condition: StockCondition.USABLE,
          originalQty: new Prisma.Decimal(20),
          unitNameSnapshot: 'Kit',
          qtyDeltaBase: new Prisma.Decimal(-20),
        },
      ]);

      const result = await reportsService.generateReport(
        ReportType.INVENTORY_LEDGER,
        { format: ReportFormat.CSV },
        superAdminUser,
      );

      expect(result.csvData).toContain('"-20"');
      expect(result.csvData).not.toContain(`"'-20"`);
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

  describe('7. Excel (.xlsx) Export Engine', () => {
    it('generates a valid binary XLSX workbook buffer with sheet data', async () => {
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        {
          usableQty: new Prisma.Decimal(25),
          reservedQty: new Prisma.Decimal(5),
          product: { id: 'p-1', name: 'Reagent Kit', minQuantity: new Prisma.Decimal(10) },
          location: { id: 'loc-1', locationType: 'WAREHOUSE', warehouse: { name: 'Main Depot' } },
        },
      ]);

      const result = await reportsService.generateReport(
        ReportType.STOCK_BALANCE,
        { format: ReportFormat.XLSX },
        superAdminUser,
      );

      expect(result.format).toBe('xlsx');
      expect(result.filename).toContain('.xlsx');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer!.length).toBeGreaterThan(100);
      // Valid PK zip header for XLSX
      expect(result.buffer![0]).toBe(0x50); // 'P'
      expect(result.buffer![1]).toBe(0x4b); // 'K'
    });

    it('includes pre-information metadata header, delta guide, and glossary sheet in XLSX workbook', async () => {
      mockPrisma.ledgerEntry.findMany.mockResolvedValue([
        {
          transaction: {
            id: 'tx-1',
            transactionType: TransactionType.TRANSFER_DISPATCH,
            sourceRefType: 'STOCK_REQUEST',
            sourceRefId: 'sr-1',
            postedAt: new Date('2026-10-22'),
            postedBy: { id: 'u-1', username: 'superadmin', role: UserRole.SUPER_ADMIN },
          },
          product: { id: 'p-1', name: 'ALT / SGPT' },
          location: { id: 'loc-1', locationType: 'WAREHOUSE', warehouse: { name: 'Apollo Depot' } },
          condition: StockCondition.USABLE,
          originalQty: new Prisma.Decimal(10),
          unitNameSnapshot: 'Pack',
          qtyDeltaBase: new Prisma.Decimal(-10),
        },
      ]);

      const result = await reportsService.generateReport(
        ReportType.INVENTORY_LEDGER,
        { format: ReportFormat.XLSX },
        superAdminUser,
      );

      const wb = XLSX.read(result.buffer, { type: 'buffer' });
      expect(wb.SheetNames).toContain('Report Data');
      expect(wb.SheetNames).toContain('Data Guide & Glossary');

      const dataAoa: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Report Data'], { header: 1 });
      // Row 0 is pre-info brand header
      expect(dataAoa[0][0]).toContain('LABCO INSTRUMENTS');
      // Row 1 has report name
      expect(dataAoa[1][1]).toContain('Movement History');
      // Has Column Delta Guide explaining baseDelta
      const guideRow = dataAoa.find((row) => row[0] === 'Column Delta Guide:');
      expect(guideRow).toBeDefined();
      expect(guideRow?.[1]).toContain('baseDelta');

      // Glossary sheet contains baseDelta definition
      const glossaryAoa: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Data Guide & Glossary'], { header: 1 });
      const baseDeltaDef = glossaryAoa.find((row) => row[0] === 'baseDelta');
      expect(baseDeltaDef).toBeDefined();
      expect(baseDeltaDef?.[2]).toContain('STOCK DELTA');
    });
  });

  describe('8. Super Admin Scope Filtering: Warehouse-wise, Project-wise, and All', () => {
    it('allows Super Admin to view unconstrained global stock across all locations', async () => {
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([]);

      await reportsService.generateReport(
        ReportType.STOCK_BALANCE,
        { format: ReportFormat.JSON },
        superAdminUser,
      );

      // No locationId constraint in where clause means all company and project locations
      expect(mockPrisma.inventoryBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });

    it('allows Super Admin to scope report warehouse-wise', async () => {
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-wh-alpha' });
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([]);

      await reportsService.generateReport(
        ReportType.STOCK_BALANCE,
        { warehouseId: 'wh-alpha-id', format: ReportFormat.JSON },
        superAdminUser,
      );

      expect(mockPrisma.stockLocation.findUnique).toHaveBeenCalledWith({
        where: { warehouseId: 'wh-alpha-id' },
      });
      expect(mockPrisma.inventoryBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            locationId: { in: ['loc-wh-alpha'] },
          }),
        }),
      );
    });

    it('allows Super Admin to scope report project-wise', async () => {
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-project-beta' });
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([]);

      await reportsService.generateReport(
        ReportType.STOCK_BALANCE,
        { projectId: 'project-beta-id', format: ReportFormat.JSON },
        superAdminUser,
      );

      expect(mockPrisma.stockLocation.findUnique).toHaveBeenCalledWith({
        where: { projectId: 'project-beta-id' },
      });
      expect(mockPrisma.inventoryBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            locationId: { in: ['loc-project-beta'] },
          }),
        }),
      );
    });
  });

  describe('9. Shipments & Inbound Dispatches Report', () => {
    it('generates shipment report with privacy redaction for Project Admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'ca-1', projectId: 'project-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-project-1' });

      mockPrisma.shipment = {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'ship-101',
            shipmentType: 'DISPATCH_TO_PROJECT',
            status: 'IN_TRANSIT',
            sourceLocation: {
              id: 'loc-wh-secret',
              locationType: 'WAREHOUSE',
              warehouse: { name: 'Secret Central Hub' },
            },
            destinationLocation: {
              id: 'loc-project-1',
              locationType: 'PROJECT',
              project: { name: 'Hospital Beta' },
            },
            lines: [
              {
                dispatchedQty: new Prisma.Decimal(50),
                product: { name: 'Vials 10ml' },
              },
            ],
            dispatchedAt: new Date('2026-10-01'),
            receivedAt: null,
            createdAt: new Date('2026-10-01'),
          },
        ]),
      };

      const result = await reportsService.generateReport(
        ReportType.SHIPMENTS,
        { format: ReportFormat.JSON },
        projectAdminUser,
      );

      expect(result.data!.length).toBe(1);
      const row = result.data![0];
      expect(row.sourceLocation).toBe('[REDACTED]');
      expect(row.destinationLocation).toBe('Hospital Beta');
      expect(row.dispatchedQuantity).toBe(50);
    });
  });
});
