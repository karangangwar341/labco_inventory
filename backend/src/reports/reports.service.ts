import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  UserRole,
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
    const scopedLocationIds = await this.getScopedLocations(user, query);
    let rows: Record<string, any>[] = [];

    switch (reportType) {
      case ReportType.STOCK_BALANCE:
        rows = await this.generateStockBalanceReport(scopedLocationIds, query);
        break;

      case ReportType.INVENTORY_LEDGER:
        rows = await this.generateInventoryLedgerReport(scopedLocationIds, query, user);
        break;

      case ReportType.BATCH_EXPIRY:
        rows = await this.generateBatchExpiryReport(scopedLocationIds, query);
        break;

      case ReportType.CLIENT_CONSUMPTION:
        rows = await this.generateClientConsumptionReport(user, query);
        break;

      case ReportType.PRODUCTION_RUNS:
        rows = await this.generateProductionRunsReport(user, query);
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
  ): Promise<Record<string, any>[]> {
    const where: Prisma.InventoryBalanceWhereInput = {};
    if (scopedLocationIds) {
      where.locationId = { in: scopedLocationIds };
    }
    if (query.productId) {
      where.productId = query.productId;
    }

    const balances = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, minQuantity: true, trackingMode: true } },
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
      const locationName =
        b.location.locationType === 'WAREHOUSE'
          ? b.location.warehouse?.name ?? 'Warehouse'
          : b.location.client?.name ?? 'Client';

      return {
        productName: b.product.name,
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
            postedAt: true,
            postedBy: { select: { id: true, email: true, fullName: true } },
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
        productName: e.product.name,
        batchNumber: e.batch?.batchNumber || 'NONE',
        condition: e.condition,
        originalQuantity: e.originalQty.toNumber(),
        unitName: e.unitNameSnapshot,
        baseDelta: e.qtyDeltaBase.toNumber(),
        direction: e.qtyDeltaBase.gte(0) ? 'IN' : 'OUT',
        locationName,
        postedBy: e.transaction.postedBy.fullName || e.transaction.postedBy.email,
      };
    });
  }

  // ==========================================
  // 3. BATCH EXPIRY REPORT
  // ==========================================

  private async generateBatchExpiryReport(
    scopedLocationIds: string[] | undefined,
    query: QueryReportDto,
  ): Promise<Record<string, any>[]> {
    const where: Prisma.StockBatchWhereInput = {
      expiryDate: { not: null },
    };
    if (query.productId) {
      where.productId = query.productId;
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

    if (!clientId) {
      throw new BadRequestException('clientId is required for Client Consumption Report');
    }

    const [issues, returns] = await Promise.all([
      this.prisma.departmentIssue.findMany({
        where: { clientId, status: 'APPROVED' },
        include: {
          department: { select: { name: true } },
          product: { select: { name: true } },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.departmentReturn.findMany({
        where: { clientId, status: 'APPROVED' },
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
        createdAt: r.createdAt.toISOString().slice(0, 10),
      };
    });
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
      if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
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
        actorUser: { select: { id: true, email: true, fullName: true, role: true } },
      },
    });
  }
}
