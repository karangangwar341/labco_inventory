import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  UserRole,
  ProductKind,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  ReportType,
  ReportFormat,
  QueryReportDto,
} from './dto/query-report.dto.js';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getScopedLocations(user: AuthenticatedUser, query: QueryReportDto): Promise<string[] | undefined> {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (query.locationId) return [query.locationId];
      if (query.warehouseId) {
        const loc = await this.prisma.stockLocation.findUnique({ where: { warehouseId: query.warehouseId } });
        return loc ? [loc.id] : [];
      }
      if (query.clientId) {
        const loc = await this.prisma.stockLocation.findUnique({ where: { clientId: query.clientId } });
        return loc ? [loc.id] : [];
      }
      return undefined; // All locations
    }

    if (user.role === UserRole.STORE_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.warehouseId) {
        throw new ForbiddenException('Store Admin is not assigned to any warehouse');
      }

      const loc = await this.prisma.stockLocation.findUnique({
        where: { warehouseId: dbUser.warehouseId },
      });
      if (!loc) return [];

      if (query.locationId && query.locationId !== loc.id) {
        throw new ForbiddenException('Store Admin cannot view other warehouse locations');
      }

      return [loc.id];
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.clientId) {
        throw new ForbiddenException('Client Admin is not assigned to any client organization');
      }

      const loc = await this.prisma.stockLocation.findUnique({
        where: { clientId: dbUser.clientId },
      });
      if (!loc) return [];

      if (query.locationId && query.locationId !== loc.id) {
        throw new ForbiddenException('Client Admin cannot view other location data');
      }

      return [loc.id];
    }

    throw new ForbiddenException('Unrecognized user role');
  }

  // ==========================================
  // REPORT GENERATION ENGINE
  // ==========================================

  async generateReport(
    reportType: ReportType,
    query: QueryReportDto,
    user: AuthenticatedUser,
  ) {
    if (
      user.role === UserRole.STORE_ADMIN &&
      (reportType === ReportType.CLIENT_CONSUMPTION || reportType === ReportType.PRODUCTION_RUNS)
    ) {
      throw new ForbiddenException('Store Admin cannot view client-side activity reports');
    }

    const scopedLocationIds = await this.getScopedLocations(user, query);
    let rows: Record<string, any>[] = [];

    switch (reportType) {
      case ReportType.STOCK_BALANCE:
        rows = await this.generateStockBalanceReport(scopedLocationIds, query, user);
        break;

      case ReportType.INVENTORY_LEDGER:
        rows = await this.generateInventoryLedgerReport(scopedLocationIds, query, user);
        break;

      case ReportType.BATCH_EXPIRY:
        rows = await this.generateBatchExpiryReport(scopedLocationIds, query, user);
        break;

      case ReportType.CLIENT_CONSUMPTION:
        rows = await this.generateClientConsumptionReport(user, query);
        break;

      case ReportType.PRODUCTION_RUNS:
        rows = await this.generateProductionRunsReport(user, query);
        break;

      case ReportType.SHIPMENTS:
        rows = await this.generateShipmentsReport(scopedLocationIds, query, user);
        break;

      default:
        throw new BadRequestException(`Unsupported report type: ${reportType}`);
    }

    // 1. Audit Event Logging (Append-Only Audit Requirement)
    await this.recordExportAuditEvent(reportType, query, rows.length, user);

    // 2. Format transformation
    const format = query.format || ReportFormat.JSON;
    if (format === ReportFormat.CSV) {
      const csvData = this.transformToCsv(rows);
      return {
        reportType,
        format: 'csv',
        filename: `${reportType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`,
        rowCount: rows.length,
        csvData,
      };
    }

    if (format === ReportFormat.XLSX) {
      const buffer = this.transformToExcel(rows, reportType, query, user);
      return {
        reportType,
        format: 'xlsx',
        filename: `${reportType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`,
        rowCount: rows.length,
        buffer,
      };
    }

    return {
      reportType,
      format: 'json',
      rowCount: rows.length,
      data: rows,
    };
  }

  // ==========================================
  // 1. STOCK BALANCE REPORT
  // ==========================================

  private async generateStockBalanceReport(
    scopedLocationIds: string[] | undefined,
    query: QueryReportDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, any>[]> {
    const where: Prisma.InventoryBalanceWhereInput = {};
    if (scopedLocationIds) {
      where.locationId = { in: scopedLocationIds };
    }
    if (query.productId) {
      where.productId = query.productId;
    }
    if (user.role === UserRole.STORE_ADMIN) {
      where.product = { kind: ProductKind.RAW_MATERIAL };
    }

    const balances = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            minQuantity: true,
            trackingMode: true,
            units: {
              where: { isBaseUnit: true },
              select: { unitName: true },
            },
          },
        },
        location: {
          select: {
            id: true,
            locationType: true,
            warehouse: { select: { id: true, name: true } },
            client: { select: { id: true, name: true } },
          },
        },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
      },
      orderBy: [{ productId: 'asc' }, { locationId: 'asc' }],
    });

    return balances.map((b) => {
      const usable = b.usableQty.toNumber();
      const reserved = b.reservedQty.toNumber();
      const available = Math.max(0, usable - reserved);
      const damaged = b.damagedQty.toNumber();
      const expired = b.expiredQty.toNumber();
      const physical = usable + damaged + expired;
      const minQty = b.product.minQuantity.toNumber();
      const baseUnit = b.product.units?.[0]?.unitName || 'Units';
      const locationName =
        b.location.locationType === 'WAREHOUSE'
          ? b.location.warehouse?.name ?? 'Warehouse'
          : b.location.client?.name ?? 'Client';

      return {
        productId: b.product.id,
        productName: b.product.name,
        baseUnit,
        locationName,
        locationType: b.location.locationType,
        batchNumber: b.batch?.batchNumber || 'NONE',
        expiryDate: b.batch?.expiryDate ? b.batch.expiryDate.toISOString().slice(0, 10) : 'NONE',
        usableQuantity: usable,
        reservedQuantity: reserved,
        availableQuantity: available,
        damagedQuantity: damaged,
        expiredQuantity: expired,
        physicalQuantity: physical,
        minThreshold: minQty,
        lowStockAlert: available < minQty && minQty > 0,
      };
    });
  }

  // ==========================================
  // 2. INVENTORY LEDGER REPORT
  // ==========================================

  private async generateInventoryLedgerReport(
    scopedLocationIds: string[] | undefined,
    query: QueryReportDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, any>[]> {
    const where: Prisma.LedgerEntryWhereInput = {};
    if (scopedLocationIds) {
      where.locationId = { in: scopedLocationIds };
    }
    if (query.productId) {
      where.productId = query.productId;
    }
    if (user.role === UserRole.STORE_ADMIN) {
      where.product = { kind: ProductKind.RAW_MATERIAL };
    }

    if (query.startDate || query.endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.startDate) dateFilter.gte = new Date(query.startDate);
      if (query.endDate) dateFilter.lte = new Date(query.endDate);
      where.transaction = {
        postedAt: dateFilter,
      };
    }

    const entries = await this.prisma.ledgerEntry.findMany({
      where,
      include: {
        transaction: {
          select: {
            id: true,
            transactionType: true,
            sourceRefType: true,
            sourceRefId: true,
            postedAt: true,
            postedBy: { select: { id: true, username: true, role: true } },
          },
        },
        product: { select: { id: true, name: true } },
        location: {
          select: {
            id: true,
            locationType: true,
            warehouse: { select: { id: true, name: true } },
            client: { select: { id: true, name: true } },
          },
        },
        batch: { select: { id: true, batchNumber: true } },
      },
      orderBy: { transaction: { postedAt: 'desc' } },
      take: 1000,
    });

    return entries.map((e) => {
      let locationName =
        e.location.locationType === 'WAREHOUSE'
          ? e.location.warehouse?.name ?? 'Warehouse'
          : e.location.client?.name ?? 'Client';

      // Tenant privacy invariant: Client Admin views must NOT reveal source warehouse identity
      if (user.role === UserRole.CLIENT_ADMIN && e.location.locationType === 'WAREHOUSE') {
        locationName = '[REDACTED]';
      }

      return {
        timestamp: e.transaction.postedAt.toISOString(),
        transactionType: e.transaction.transactionType,
        sourceRefType: e.transaction.sourceRefType || 'DIRECT',
        sourceRefId: e.transaction.sourceRefId || null,
        productName: e.product.name,
        batchNumber: e.batch?.batchNumber || 'NONE',
        condition: e.condition,
        originalQuantity: e.originalQty.toNumber(),
        unitName: e.unitNameSnapshot,
        baseDelta: e.qtyDeltaBase.toNumber(),
        direction: e.qtyDeltaBase.gte(0) ? 'IN' : 'OUT',
        locationName,
        postedBy: e.transaction.postedBy.username,
      };
    });
  }

  // ==========================================
  // 3. BATCH EXPIRY REPORT
  // ==========================================

  private async generateBatchExpiryReport(
    scopedLocationIds: string[] | undefined,
    query: QueryReportDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, any>[]> {
    const where: Prisma.StockBatchWhereInput = {
      expiryDate: { not: null },
    };
    if (query.productId) {
      where.productId = query.productId;
    }
    if (user.role === UserRole.STORE_ADMIN) {
      where.product = { kind: ProductKind.RAW_MATERIAL };
    }

    const batches = await this.prisma.stockBatch.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
        balances: {
          where: scopedLocationIds ? { locationId: { in: scopedLocationIds } } : {},
        },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const now = new Date();

    return batches.map((b) => {
      let usable = 0;
      let expired = 0;
      let damaged = 0;

      for (const bal of b.balances) {
        usable += bal.usableQty.toNumber();
        expired += bal.expiredQty.toNumber();
        damaged += bal.damagedQty.toNumber();
      }

      const daysRemaining = b.expiryDate
        ? Math.ceil((b.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        productName: b.product.name,
        batchNumber: b.batchNumber || b.id,
        expiryDate: b.expiryDate?.toISOString().slice(0, 10),
        daysRemaining,
        batchStatus: b.status,
        usableQuantity: usable,
        expiredQuantity: expired,
        damagedQuantity: damaged,
        isExpired: daysRemaining <= 0,
      };
    });
  }

  // ==========================================
  // 4. CLIENT CONSUMPTION REPORT
  // ==========================================

  private async generateClientConsumptionReport(
    user: AuthenticatedUser,
    query: QueryReportDto,
  ): Promise<Record<string, any>[]> {
    let clientId = query.clientId;
    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      clientId = dbUser?.clientId || undefined;
    }

    if (!clientId && user.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException('clientId is required for Client Consumption Report');
    }

    const issueWhere: Prisma.DepartmentIssueWhereInput = { status: 'APPROVED' };
    const returnWhere: Prisma.DepartmentReturnWhereInput = { status: 'APPROVED' };
    if (clientId) {
      issueWhere.clientId = clientId;
      returnWhere.clientId = clientId;
    }
    if (query.productId) {
      issueWhere.productId = query.productId;
      returnWhere.productId = query.productId;
    }
    if (query.startDate || query.endDate) {
      const issueDateFilter: Prisma.DateTimeNullableFilter = {};
      const returnDateFilter: Prisma.DateTimeNullableFilter = {};
      if (query.startDate) {
        issueDateFilter.gte = new Date(query.startDate);
        returnDateFilter.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        issueDateFilter.lte = new Date(query.endDate);
        returnDateFilter.lte = new Date(query.endDate);
      }
      issueWhere.issuedAt = issueDateFilter;
      returnWhere.approvedAt = returnDateFilter;
    }

    const [issues, returns] = await Promise.all([
      this.prisma.departmentIssue.findMany({
        where: issueWhere,
        include: {
          department: { select: { name: true } },
          product: { select: { name: true } },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.departmentReturn.findMany({
        where: returnWhere,
        include: {
          department: { select: { name: true } },
          product: { select: { name: true } },
        },
        orderBy: { approvedAt: 'desc' },
      }),
    ]);

    const result: Record<string, any>[] = [];

    issues.forEach((i) => {
      result.push({
        type: 'DEPARTMENT_ISSUE',
        department: i.department.name,
        product: i.product.name,
        quantity: i.quantity.toNumber(),
        unit: i.unitNameSnapshot,
        baseQuantity: i.baseQuantity.toNumber(),
        condition: 'USABLE',
        date: i.issuedAt?.toISOString().slice(0, 10) || i.createdAt.toISOString().slice(0, 10),
      });
    });

    returns.forEach((r) => {
      result.push({
        type: 'DEPARTMENT_RETURN',
        department: r.department?.name || 'General',
        product: r.product.name,
        quantity: r.quantity.toNumber(),
        unit: r.unitNameSnapshot,
        baseQuantity: r.baseQuantity.toNumber(),
        condition: r.condition,
        date: r.approvedAt?.toISOString().slice(0, 10) || r.createdAt.toISOString().slice(0, 10),
      });
    });

    return result;
  }

  // ==========================================
  // 5. PRODUCTION RUNS REPORT
  // ==========================================

  private async generateProductionRunsReport(
    user: AuthenticatedUser,
    query: QueryReportDto,
  ): Promise<Record<string, any>[]> {
    const where: Prisma.ProductionRunWhereInput = {};

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      where.clientId = dbUser?.clientId || undefined;
    } else if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.startDate || query.endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.startDate) dateFilter.gte = new Date(query.startDate);
      if (query.endDate) dateFilter.lte = new Date(query.endDate);
      where.createdAt = dateFilter;
    }

    if (query.productId) {
      where.OR = [
        { inputs: { some: { productId: query.productId } } },
        { outputs: { some: { productId: query.productId } } },
      ];
    }

    const runs = await this.prisma.productionRun.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        inputs: { include: { product: { select: { name: true } } } },
        outputs: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return runs.map((r) => {
      return {
        runId: r.id,
        productionReference: r.productionReference || 'N/A',
        clientName: r.client.name,
        mode: r.mode,
        status: r.status,
        plannedOutput: r.plannedOutput ? r.plannedOutput.toNumber() : 0,
        actualOutput: r.actualOutput ? r.actualOutput.toNumber() : 0,
        wastage: r.wastage ? r.wastage.toNumber() : 0,
        totalInputsCount: r.inputs.length,
        totalOutputsCount: r.outputs.length,
        inputs: r.inputs.map((input) => ({
          product: input.product.name,
          quantity: input.quantity.toNumber(),
          unit: input.unitNameSnapshot,
        })),
        outputs: r.outputs.map((output) => ({
          product: output.product.name,
          quantity: output.quantity.toNumber(),
          unit: output.unitNameSnapshot,
        })),
        createdAt: r.createdAt.toISOString().slice(0, 10),
      };
    });
  }

  // ==========================================
  // 6. SHIPMENTS REPORT
  // ==========================================

  private async generateShipmentsReport(
    scopedLocationIds: string[] | undefined,
    query: QueryReportDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, any>[]> {
    const where: Prisma.ShipmentWhereInput = {};

    if (scopedLocationIds) {
      where.OR = [
        { sourceLocationId: { in: scopedLocationIds } },
        { destinationLocationId: { in: scopedLocationIds } },
      ];
    }

    if (query.startDate || query.endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.startDate) dateFilter.gte = new Date(query.startDate);
      if (query.endDate) dateFilter.lte = new Date(query.endDate);
      where.createdAt = dateFilter;
    }

    if (query.productId) {
      where.lines = {
        some: { productId: query.productId },
      };
    }

    const shipments = await this.prisma.shipment.findMany({
      where,
      include: {
        sourceLocation: {
          select: {
            id: true,
            locationType: true,
            warehouse: { select: { id: true, name: true } },
            client: { select: { id: true, name: true } },
          },
        },
        destinationLocation: {
          select: {
            id: true,
            locationType: true,
            warehouse: { select: { id: true, name: true } },
            client: { select: { id: true, name: true } },
          },
        },
        lines: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    return shipments.map((s) => {
      let sourceName =
        s.sourceLocation.locationType === 'WAREHOUSE'
          ? s.sourceLocation.warehouse?.name ?? 'Warehouse'
          : s.sourceLocation.client?.name ?? 'Client';

      let destinationName =
        s.destinationLocation.locationType === 'WAREHOUSE'
          ? s.destinationLocation.warehouse?.name ?? 'Warehouse'
          : s.destinationLocation.client?.name ?? 'Client';

      // Tenant privacy invariant: Client Admin must not see source warehouse name
      if (user.role === UserRole.CLIENT_ADMIN && s.sourceLocation.locationType === 'WAREHOUSE') {
        sourceName = '[REDACTED]';
      }

      const totalQty = s.lines.reduce((sum, l) => sum + l.dispatchedQty.toNumber(), 0);

      return {
        shipmentId: s.id,
        shipmentType: s.shipmentType,
        status: s.status,
        sourceLocation: sourceName,
        destinationLocation: destinationName,
        totalItemsCount: s.lines.length,
        dispatchedQuantity: totalQty,
        dispatchedAt: s.dispatchedAt ? s.dispatchedAt.toISOString().slice(0, 10) : 'PENDING',
        receivedAt: s.receivedAt ? s.receivedAt.toISOString().slice(0, 10) : 'PENDING',
        createdAt: s.createdAt.toISOString().slice(0, 10),
      };
    });
  }

  // ==========================================
  // EXCEL (XLSX) GENERATION ENGINE
  // ==========================================

  // ==========================================
  // EXCEL & SPREADSHEET TRANSFORMATION ENGINE
  // ==========================================

  private static readonly REPORT_METADATA: Record<string, { title: string; description: string; deltaExplanation?: string }> = {
    [ReportType.INVENTORY_LEDGER]: {
      title: 'Movement History & Inventory Ledger',
      description: 'Immutable double-entry inventory audit trail and stock movement deltas.',
      deltaExplanation:
        "Stock Delta ('baseDelta'): Net change in physical usable inventory in base packaging units. Positive (+ / Direction 'IN') = stock added (receiving, inbound transfer, production output). Negative (- / Direction 'OUT') = stock deducted (client dispatch, consumption, write-off).",
    },
    [ReportType.STOCK_BALANCE]: {
      title: 'Current Stock Balances & Availability',
      description: 'Real-time projected usable, reserved, available, and quarantined quantities.',
      deltaExplanation:
        'Formula Invariants: Available = Usable - Reserved. Physical Total = Usable + Damaged + Expired. Low Stock Alert triggers when Available < Min Threshold.',
    },
    [ReportType.BATCH_EXPIRY]: {
      title: 'Batch & Lot Expiry Forecast',
      description: 'Lot-level expiration schedule, days remaining, and shelf-life tracking.',
      deltaExplanation:
        'Days Remaining shows calendar days until lot expiration. Batches with <= 0 days remaining are classified as Expired and locked from dispensing.',
    },
    [ReportType.CLIENT_CONSUMPTION]: {
      title: 'Clinical Department Consumption & Usage',
      description: 'Internal clinical and department stock issues and return activities.',
      deltaExplanation:
        'Quantity reflects clinical dispensing or return to department in selected packaging units and base quantity.',
    },
    [ReportType.PRODUCTION_RUNS]: {
      title: 'Manufacturing & Formulation Runs',
      description: 'Work-in-progress runs, recipe inputs, batch outputs, and recorded wastage.',
      deltaExplanation:
        'Planned vs. Actual output and recorded wastage during formulation cycles.',
    },
    [ReportType.SHIPMENTS]: {
      title: 'Shipments & Logistics Tracking',
      description: 'Inbound, outbound, and inter-facility stock movements, status, quantities, and dates.',
      deltaExplanation:
        'Dispatched quantity shows items en route from source to destination location.',
    },
  };

  private transformToExcel(
    rows: Record<string, any>[],
    reportType: ReportType,
    query?: QueryReportDto,
    user?: AuthenticatedUser,
  ): Buffer {
    const wb = XLSX.utils.book_new();
    const meta = ReportsService.REPORT_METADATA[reportType] || {
      title: reportType.replace(/_/g, ' '),
      description: 'Labco Operations & Logistics Report',
      deltaExplanation: "Stock Delta ('baseDelta'): Net change in usable inventory in base packaging units.",
    };

    if (rows.length === 0) {
      const emptyAoa = [
        ['LABCO INSTRUMENTS — DIAGNOSTIC WAREHOUSE OPERATIONS'],
        ['Report Name:', meta.title],
        ['Report Code:', reportType],
        ['Description:', meta.description],
        ['Generated At:', new Date().toISOString()],
        ['Generated By:', user ? `${user.username} (${user.role})` : 'System'],
        ['Status:', 'No data available for the selected criteria'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(emptyAoa);
      ws['!cols'] = [{ wch: 20 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Report Data');
      this.appendGlossarySheet(wb);
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    const headers = Object.keys(rows[0]);

    // Build the executive pre-information header section
    const preInfo: any[][] = [
      ['LABCO INSTRUMENTS — DIAGNOSTIC WAREHOUSE OPERATIONS'],
      ['Report Name:', meta.title, '', 'Report Code:', reportType],
      ['Description:', meta.description],
      [
        'Generated At:',
        new Date().toISOString(),
        '',
        'Generated By:',
        user ? `${user.username} (${user.role})` : 'System',
        '',
        'Total Records:',
        rows.length,
      ],
      ['Column Delta Guide:', meta.deltaExplanation || "See 'Data Guide & Glossary' worksheet for complete definitions."],
      ['Data Dictionary:', "Review the 'Data Guide & Glossary' sheet for full field definitions, formulas, and domain invariants."],
      [], // blank separator row
      headers, // Table header row
    ];

    // Format data rows: native numbers for numeric values, formula sanitization for text
    const dataRows = rows.map((row) => {
      return headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'number') return val;
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        if (typeof val === 'string') {
          const trimmed = val.trim();
          // Formula injection defense: neutralize strings starting with =, +, -, @ ONLY if not a number
          if (
            (trimmed.startsWith('=') ||
              trimmed.startsWith('+') ||
              trimmed.startsWith('-') ||
              trimmed.startsWith('@')) &&
            isNaN(Number(trimmed))
          ) {
            return `'${trimmed}`;
          }
          if (!isNaN(Number(trimmed)) && !['=', '@'].includes(trimmed[0])) {
            return Number(trimmed);
          }
          return val;
        }
        if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
          return JSON.stringify(val);
        }
        return val;
      });
    });

    const fullSheetAoa = [...preInfo, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(fullSheetAoa);

    // Auto-fit column widths based on headers and data
    ws['!cols'] = headers.map((h, colIndex) => {
      let maxLen = Math.max(h.length, 12);
      for (let r = 0; r < Math.min(dataRows.length, 50); r++) {
        const cellVal = String(dataRows[r][colIndex] ?? '');
        if (cellVal.length > maxLen) {
          maxLen = Math.min(cellVal.length, 40);
        }
      }
      return { wch: maxLen + 3 };
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Report Data');

    // Add dedicated glossary sheet explaining what every column means
    this.appendGlossarySheet(wb);

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private appendGlossarySheet(wb: XLSX.WorkBook) {
    const glossaryAoa: any[][] = [
      ['LABCO INSTRUMENTS WAREHOUSE MANAGEMENT SYSTEM — DATA DICTIONARY & GLOSSARY'],
      ['Overview:', 'Audit-grade inventory movement ledgers, batch expiry forecasting, and stock telemetry definitions.'],
      [],
      ['COLUMN / FIELD', 'DATA TYPE', 'BUSINESS MEANING & DOMAIN INVARIANTS'],
      ['baseDelta', 'Number (Decimal)', "STOCK DELTA: Net change in physical inventory balance measured in the catalog product's base unit. POSITIVE (+ / Direction 'IN') = stock added (receiving, inbound transfer, production output). NEGATIVE (- / Direction 'OUT') = stock deducted (client dispatch, consumption, write-off)."],
      ['direction', 'String (IN / OUT)', "Operational stock flow relative to the location: 'IN' indicates stock entered inventory (+); 'OUT' indicates stock left inventory (-)."],
      ['timestamp', 'ISO 8601 Date', 'Exact date and time when the inventory transaction was finalized and immutably ledgered.'],
      ['transactionType', 'Enum', 'Operational workflow type: TRANSFER (between facilities), DISPATCH (warehouse to client), STOCK_IN (receipt), STOCK_OUT (deduction), MANUFACTURING (production).'],
      ['sourceRefType', 'Enum', 'Authorizing document type: STOCK_REQUEST, SHIPMENT, DEPARTMENT_ISSUE, DEPARTMENT_RETURN, PRODUCTION_RUN, DIRECT.'],
      ['sourceRefId', 'UUID / String', 'Unique reference ID of the authorizing document, request, or shipment.'],
      ['productName', 'String', 'Standardized catalog name of the reagent, consumable, or diagnostic product.'],
      ['batchNumber', 'String', 'Lot or Batch identifier tracking physical batch provenance and shelf life.'],
      ['condition', 'Enum', 'Inventory quality classification: USABLE (available for use), DAMAGED (broken/quarantined), EXPIRED (past shelf life), QUARANTINE (holding).'],
      ['originalQuantity', 'Number (Decimal)', 'Quantity specified in the transaction using the selected packaging unit snapshot.'],
      ['unitName', 'String', 'The packaging unit active during transaction entry (e.g., Pack, Kit, Vial, Box, Bottle).'],
      ['locationName', 'String', 'The warehouse or client facility where the inventory transaction was executed.'],
      ['postedBy', 'String', 'Username of the authorized operator who submitted or posted the transaction.'],
      [],
      ['STOCK BALANCE FORMULAS & FIELDS', '', ''],
      ['usableQuantity', 'Number (Decimal)', 'Stock in usable condition available for immediate transfer, dispatch, or manufacturing.'],
      ['reservedQuantity', 'Number (Decimal)', 'Stock allocated to approved pending dispatches or in-progress runs, not yet shipped.'],
      ['availableQuantity', 'Number (Decimal)', 'Formula: Available = Usable - Reserved. Non-negotiable invariant: must never be negative.'],
      ['damagedQuantity', 'Number (Decimal)', 'Stock damaged or compromised, held segregated from usable stock.'],
      ['expiredQuantity', 'Number (Decimal)', 'Stock exceeding its expiration date, locked from dispensing pending write-off.'],
      ['physicalQuantity', 'Number (Decimal)', 'Formula: Physical Total = Usable + Damaged + Expired.'],
      ['minThreshold', 'Number (Decimal)', 'Configured minimum safe reorder threshold for the product at this location.'],
      ['lowStockAlert', 'Boolean', 'True when Available Stock is below Min Threshold (Available < Min Threshold).'],
      [],
      ['EXPIRY & LOGISTICS FIELDS', '', ''],
      ['daysRemaining', 'Integer', 'Number of calendar days remaining until lot expiration. Zero or negative indicates expired.'],
      ['batchStatus', 'Enum', 'ACTIVE (safe shelf life), WARNING (approaching expiry <= 30 days), EXPIRED (shelf life ended).'],
      ['dispatchedQuantity', 'Number (Decimal)', 'Quantity of goods dispatched in an active shipment.'],
      ['shipmentType', 'Enum', 'DISPATCH_TO_CLIENT (warehouse to client), TRANSFER (warehouse to warehouse).'],
    ];

    const wsGlossary = XLSX.utils.aoa_to_sheet(glossaryAoa);
    wsGlossary['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsGlossary, 'Data Guide & Glossary');
  }

  // ==========================================
  // CSV CONVERSION & FORMULA INJECTION DEFENSE
  // (Test Plan Section 5 item 61)
  // ==========================================

  private transformToCsv(rows: Record<string, any>[]): string {
    if (rows.length === 0) {
      return 'No data available\n';
    }

    const headers = Object.keys(rows[0]);

    const sanitizeCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val).trim();
      // Neutralize formula injection (=, +, -, @)
      // Legitimate numeric values (e.g. -20, 25, -1.5) must NOT be prepended with apostrophe!
      const isNumeric = typeof val === 'number' || (!isNaN(Number(str)) && !['=', '@'].includes(str[0]));
      if (!isNumeric && (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@'))) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const lines = [headers.map((h) => `"${h}"`).join(',')];

    for (const row of rows) {
      const line = headers.map((h) => sanitizeCell(row[h]));
      lines.push(line.join(','));
    }

    return lines.join('\n');
  }

  // ==========================================
  // AUDIT EVENT LOGGING
  // (REQ-021: Append-Only Immutable Audit Trail)
  // ==========================================

  private async recordExportAuditEvent(
    reportType: ReportType,
    query: QueryReportDto,
    rowCount: number,
    user: AuthenticatedUser,
  ) {
    // Audit logs must never contain passwords, tokens or secrets (Test Plan 62)
    const sanitizedFilters = {
      format: query.format || 'json',
      locationId: query.locationId || null,
      productId: query.productId || null,
      clientId: query.clientId || null,
      warehouseId: query.warehouseId || null,
      startDate: query.startDate || null,
      endDate: query.endDate || null,
    };

    try {
      await this.prisma.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: 'REPORT_EXPORT',
          entityType: 'REPORT',
          entityId: reportType,
          afterJson: {
            reportType,
            rowCount,
            filters: sanitizedFilters,
            timestamp: new Date().toISOString(),
          },
          reason: `Generated ${reportType} report in ${query.format || 'json'} format`,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to record export audit event: ${err.message}`);
    }
  }

  async getExportAuditHistory(user: AuthenticatedUser) {
    const where: Prisma.AuditEventWhereInput = {
      action: 'REPORT_EXPORT',
    };

    if (user.role !== UserRole.SUPER_ADMIN) {
      where.actorUserId = user.id;
    }

    return this.prisma.auditEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: 100,
      include: {
        actorUser: { select: { id: true, username: true, role: true } },
      },
    });
  }
}
