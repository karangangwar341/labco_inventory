import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { LedgerService } from '../inventory/ledger.service.js';
import { GeminiExtractionAdapter } from './adapters/gemini-extraction.adapter.js';
import {
  UserRole,
  ImportType,
  ImportBatchStatus,
  ImportApprovalMode,
  ImportRowStatus,
  FileScanStatus,
  ProductStatus,
  StockCondition,
  TransactionType,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { CreateImportBatchDto } from './dto/create-import-batch.dto.js';
import { UpdateImportRowDto } from './dto/update-import-row.dto.js';
import {
  ApproveImportBatchDto,
  RejectImportBatchDto,
} from './dto/decide-import-batch.dto.js';

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly extractor: GeminiExtractionAdapter,
  ) {}

  // ==========================================
  // BATCH CREATION & INGESTION
  // ==========================================

  async createBatch(dto: CreateImportBatchDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN && dto.importType === ImportType.PRODUCT_CATALOG) {
      throw new ForbiddenException('Store Admin is not authorized to import product catalogs');
    }

    // 1. File Security & Validation (Test Plan Section 4: Unsupported/oversize/malicious file rejected)
    const buffer = Buffer.from(dto.fileContent, 'utf-8');
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB limit

    if (buffer.length > maxSizeBytes) {
      throw new BadRequestException(`File size exceeds maximum permitted limit of 10MB (${buffer.length} bytes)`);
    }

    const ext = dto.sourceFilename.split('.').pop()?.toLowerCase();
    const allowedExts = ['csv', 'json', 'txt', 'pdf', 'png', 'jpg', 'jpeg'];
    if (!ext || !allowedExts.includes(ext)) {
      throw new BadRequestException(`Unsupported file type ".${ext}". Allowed: ${allowedExts.join(', ')}`);
    }

    // Check for malicious payload / dangerous signatures
    const rawContentStr = dto.fileContent.toLowerCase();
    if (
      rawContentStr.includes('<script') ||
      rawContentStr.includes('javascript:') ||
      rawContentStr.includes('<?php')
    ) {
      throw new BadRequestException('Security violation: Malicious script tags or executable code detected in upload');
    }

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const storageKey = `imports/${Date.now()}-${checksum.substring(0, 12)}.${ext}`;

    // 2. Store Attachment metadata (clean scan)
    const attachment = await this.prisma.attachment.create({
      data: {
        storageKey,
        originalName: dto.sourceFilename,
        mimeType: dto.mimeType || (ext === 'csv' ? 'text/csv' : 'application/json'),
        sizeBytes: buffer.length,
        checksum,
        scanStatus: FileScanStatus.CLEAN,
        uploadedById: user.id,
      },
    });

    // 3. Extract data via AI extraction adapter (or deterministic fallback)
    const extractionResult = await this.extractor.extractFromDocument(
      dto.fileContent,
      attachment.mimeType,
      dto.importType,
    );

    // 4. Create ImportBatch (Status DRAFT: never alters finalized inventory)
    const batch = await this.prisma.importBatch.create({
      data: {
        importType: dto.importType,
        sourceFilename: dto.sourceFilename,
        attachmentId: attachment.id,
        uploadedById: user.id,
        status: ImportBatchStatus.DRAFT,
        approvalMode: dto.approvalMode || ImportApprovalMode.PARTIAL,
        rawExtractionJson: extractionResult as any,
      },
    });

    // 5. Create ImportRows and run initial validation
    const rowsToCreate: any[] = [];
    const seenRowSignatures = new Map<string, number>(); // For duplicate row detection

    for (const extractedRow of extractionResult.extractedRows) {
      const normalized = { ...extractedRow.normalizedData };
      if (!normalized.locationId && dto.defaultLocationId) {
        normalized.locationId = dto.defaultLocationId;
      }

      // Duplicate row detection signature: (product, batch, location)
      const sig = `${normalized.productId || normalized.productName || ''}|${normalized.batchNumber || ''}|${normalized.locationId || ''}`;
      let hasDuplicateWarning = false;
      let duplicateWarningReason: string | null = null;

      if (seenRowSignatures.has(sig) && sig !== '||') {
        hasDuplicateWarning = true;
        duplicateWarningReason = `Duplicate row detected in batch (matches row ${seenRowSignatures.get(sig)}). Choose Keep Separate or Merge.`;
      } else {
        seenRowSignatures.set(sig, extractedRow.rowNumber);
      }

      rowsToCreate.push({
        batchId: batch.id,
        rowNumber: extractedRow.rowNumber,
        rawDataJson: extractedRow.rawRecord,
        normalizedDataJson: normalized,
        validationStatus: ImportRowStatus.PENDING,
        confidenceScore: new Prisma.Decimal(extractedRow.overallConfidence),
        hasDuplicateWarning,
        duplicateWarningReason,
        validationErrors: null,
      });
    }

    if (rowsToCreate.length > 0) {
      await this.prisma.importRow.createMany({
        data: rowsToCreate,
      });
    }

    // 6. Run initial server-side validation against catalog and balances
    await this.validateBatch(batch.id, user);

    return this.getBatch(batch.id, user);
  }

  // ==========================================
  // QUERY BATCHES
  // ==========================================

  async getBatches(
    query: { importType?: ImportType; status?: ImportBatchStatus },
    user: AuthenticatedUser,
  ) {
    const where: Prisma.ImportBatchWhereInput = {};
    if (query.importType) where.importType = query.importType;
    if (query.status) where.status = query.status;

    if (user.role === UserRole.CLIENT_ADMIN || user.role === UserRole.STORE_ADMIN) {
      where.uploadedById = user.id;
    }

    return this.prisma.importBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, username: true, role: true } },
        approvedBy: { select: { id: true, username: true, role: true } },
        _count: { select: { rows: true } },
      },
    });
  }

  async getBatch(id: string, user: AuthenticatedUser) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, username: true, role: true } },
        approvedBy: { select: { id: true, username: true, role: true } },
        attachment: true,
        rows: {
          orderBy: { rowNumber: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Import batch ${id} not found`);
    }

    if (
      (user.role === UserRole.CLIENT_ADMIN || user.role === UserRole.STORE_ADMIN) &&
      batch.uploadedById !== user.id
    ) {
      throw new ForbiddenException('Access denied to other user import batches');
    }

    return batch;
  }

  // ==========================================
  // ROW CORRECTION & VALIDATION
  // ==========================================

  async updateRow(
    batchId: string,
    rowId: string,
    dto: UpdateImportRowDto,
    user: AuthenticatedUser,
  ) {
    const batch = await this.getBatch(batchId, user);

    if (batch.status === ImportBatchStatus.APPROVED) {
      throw new ConflictException('Cannot edit rows of an approved batch');
    }

    const row = batch.rows.find((r) => r.id === rowId);
    if (!row) {
      throw new NotFoundException(`Import row ${rowId} not found in batch`);
    }

    // Update row data, preserve original extraction in rawDataJson, flag editedAfterExtraction
    await this.prisma.importRow.update({
      where: { id: rowId },
      data: {
        normalizedDataJson: dto.normalizedData,
        editedAfterExtraction: true,
      },
    });

    // Revalidate batch
    await this.validateBatch(batchId, user);

    return this.prisma.importRow.findUnique({ where: { id: rowId } });
  }

  async validateBatch(batchId: string, user: AuthenticatedUser) {
    const batch = await this.getBatch(batchId, user);

    let hasInvalidRows = false;
    let mixedWarehouseLocations = new Set<string>();

    for (const row of batch.rows) {
      const data = row.normalizedDataJson as Record<string, any>;
      const errors: string[] = [];

      // 1. Resolve Product
      let product = null;
      if (data.productId) {
        product = await this.prisma.product.findUnique({
          where: { id: data.productId },
          include: { units: true },
        });
      } else if (data.productName) {
        product = await this.prisma.product.findFirst({
          where: {
            name: { equals: data.productName.trim(), mode: 'insensitive' },
          },
          include: { units: true },
        });
      }

      if (!product && batch.importType !== ImportType.PRODUCT_CATALOG) {
        errors.push(`Product "${data.productId || data.productName || 'unknown'}" not found`);
      } else if (product && product.status !== ProductStatus.APPROVED && batch.importType !== ImportType.PRODUCT_CATALOG) {
        errors.push(`Product "${product.name}" is not approved (status: ${product.status})`);
      }

      // 2. Resolve Quantity & Unit
      if (batch.importType !== ImportType.PRODUCT_CATALOG) {
        const qty = Number(data.quantity);
        if (isNaN(qty) || qty <= 0) {
          errors.push('Quantity must be a positive number');
        }

        if (product) {
          const unit = product.units.find(
            (u) =>
              (data.unitId && u.id === data.unitId) ||
              (data.unitName && u.unitName.toLowerCase() === data.unitName.trim().toLowerCase()) ||
              (!data.unitId && !data.unitName && u.isBaseUnit),
          );

          if (!unit || unit.status !== 'ACTIVE') {
            errors.push(`Active unit "${data.unitName || data.unitId || 'base'}" not found for product`);
          } else {
            const baseQty = new Prisma.Decimal(qty).mul(unit.conversionToBase);
            if (product.quantityPrecision === 0 && !baseQty.isInteger()) {
              errors.push(`Product requires integer units; ${baseQty} is fractional`);
            }
          }

          // 3. Batch / Expiry tracking checks
          if (product.trackingMode === 'BATCH_ONLY' || product.trackingMode === 'BOTH') {
            if (!data.batchNumber && !data.batchId) {
              errors.push('Batch/lot number is required for lot-tracked product');
            }
          }
          if (product.trackingMode === 'EXPIRY_ONLY' || product.trackingMode === 'BOTH') {
            if (!data.expiryDate) {
              errors.push('Expiry date is required for expiry-tracked product');
            }
          }
        }

        // 4. Resolve Location
        if (data.locationId) {
          const loc = await this.prisma.stockLocation.findUnique({
            where: { id: data.locationId },
          });
          if (!loc) {
            errors.push(`Stock location ${data.locationId} not found`);
          } else {
            mixedWarehouseLocations.add(loc.id);
          }
        } else {
          errors.push('Stock location is required');
        }

        // 5. Stock-out availability pre-check
        if (batch.importType === ImportType.STOCK_OUT && product && data.locationId) {
          const balance = await this.prisma.inventoryBalance.findFirst({
            where: {
              locationId: data.locationId,
              productId: product.id,
              batchId: data.batchId || null,
            },
          });
          const available = balance ? balance.usableQty.minus(balance.reservedQty) : new Prisma.Decimal(0);
          if (available.lt(data.quantity || 0)) {
            errors.push(`Insufficient available usable stock at location (${available} available, ${data.quantity} requested)`);
          }
        }
      }

      // Update row validation status
      const isRowValid = errors.length === 0;
      if (!isRowValid) hasInvalidRows = true;

      await this.prisma.importRow.update({
        where: { id: row.id },
        data: {
          validationStatus: isRowValid ? ImportRowStatus.VALID : ImportRowStatus.INVALID,
          validationErrors: errors.length > 0 ? errors : Prisma.JsonNull,
        },
      });
    }

    // 6. Check single source warehouse constraint for STOCK_OUT batches
    let batchErrorSummary: string | null = null;
    if (batch.importType === ImportType.STOCK_OUT && mixedWarehouseLocations.size > 1) {
      hasInvalidRows = true;
      batchErrorSummary = 'Stock-out batch with mixed source warehouses is rejected. All stock-out rows must share one warehouse.';
    }

    // Update batch status
    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: hasInvalidRows ? ImportBatchStatus.DRAFT : ImportBatchStatus.VALIDATED,
        errorSummary: batchErrorSummary,
      },
    });

    return this.getBatch(batchId, user);
  }

  // ==========================================
  // BATCH APPROVAL & STOCK POSTING
  // ==========================================

  async approveBatch(
    batchId: string,
    dto: ApproveImportBatchDto,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve and post import batches');
    }

    const batch = await this.getBatch(batchId, user);

    if (batch.status === ImportBatchStatus.APPROVED) {
      throw new ConflictException('Import batch has already been approved');
    }

    const mode = dto.approvalMode || batch.approvalMode;

    // Check single source warehouse invariant for STOCK_OUT
    if (batch.importType === ImportType.STOCK_OUT) {
      const locations = new Set(
        batch.rows.map((r) => (r.normalizedDataJson as any).locationId).filter(Boolean),
      );
      if (locations.size > 1) {
        throw new BadRequestException(
          'Stock-out batch with mixed source warehouses is rejected. All rows must originate from the same warehouse.',
        );
      }
    }

    // All-Or-Nothing mode check:
    const invalidRows = batch.rows.filter((r) => r.validationStatus === ImportRowStatus.INVALID);
    if (mode === ImportApprovalMode.ALL_OR_NOTHING && invalidRows.length > 0) {
      throw new BadRequestException(
        `All-or-nothing batch contains ${invalidRows.length} invalid row(s). Zero rows posted.`,
      );
    }

    const eligibleRows =
      mode === ImportApprovalMode.ALL_OR_NOTHING
        ? batch.rows
        : batch.rows.filter((r) => r.validationStatus === ImportRowStatus.VALID);

    if (eligibleRows.length === 0) {
      throw new BadRequestException('No valid rows eligible for approval');
    }

    // Atomic stock posting if inventory-affecting (STOCK_IN, STOCK_OUT, PHYSICAL_COUNT)
    const lines: Array<{
      locationId: string;
      productId: string;
      batchId?: string;
      quantity: number;
      unitName: string;
      condition: StockCondition;
      direction: 'IN' | 'OUT';
    }> = [];
    if (batch.importType === ImportType.STOCK_IN || batch.importType === ImportType.STOCK_OUT) {
      for (const row of eligibleRows) {
        const data = row.normalizedDataJson as Record<string, any>;
        const product = await this.prisma.product.findFirst({
          where: data.productId
            ? { id: data.productId }
            : { name: { equals: data.productName.trim(), mode: 'insensitive' } },
          include: { units: true },
        });

        if (!product) continue;

        const unit = product.units.find(
          (u) =>
            (data.unitId && u.id === data.unitId) ||
            (data.unitName && u.unitName.toLowerCase() === data.unitName.trim().toLowerCase()) ||
            u.isBaseUnit,
        );

        lines.push({
          locationId: data.locationId,
          productId: product.id,
          batchId: data.batchId || undefined,
          quantity: Number(data.quantity),
          unitName: unit?.unitName || 'PIECE',
          condition: (data.condition as StockCondition) || StockCondition.USABLE,
          direction: batch.importType === ImportType.STOCK_IN ? ('IN' as const) : ('OUT' as const),
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (lines.length > 0) {
        await this.ledgerService.postTransaction(
          {
            transactionType:
              batch.importType === ImportType.STOCK_IN
                ? TransactionType.STOCK_IN
                : TransactionType.STOCK_OUT,
            sourceRefType: 'IMPORT_BATCH',
            sourceRefId: batch.id,
            idempotencyKey: dto.idempotencyKey ?? `import-batch-${batch.id}-${Date.now()}`,
            lines,
          },
          user.id,
          tx,
        );
      }

      // Mark eligible rows POSTED / APPROVED
      for (const row of eligibleRows) {
        await tx.importRow.update({
          where: { id: row.id },
          data: { validationStatus: ImportRowStatus.POSTED },
        });
      }

      const finalBatchStatus =
        invalidRows.length > 0
          ? ImportBatchStatus.PARTIALLY_APPROVED
          : ImportBatchStatus.APPROVED;

      return tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: finalBatchStatus,
          approvedById: user.id,
          approvedAt: new Date(),
        },
        include: {
          rows: { orderBy: { rowNumber: 'asc' } },
        },
      });
    });
  }

  async rejectBatch(
    batchId: string,
    dto: RejectImportBatchDto,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can reject import batches');
    }

    const batch = await this.getBatch(batchId, user);

    if (batch.status === ImportBatchStatus.APPROVED) {
      throw new ConflictException('Cannot reject an already approved batch');
    }

    // Mark all rows REJECTED
    await this.prisma.importRow.updateMany({
      where: { batchId },
      data: { validationStatus: ImportRowStatus.REJECTED },
    });

    return this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: ImportBatchStatus.REJECTED,
        errorSummary: dto.reason.trim(),
        approvedById: user.id,
      },
      include: {
        rows: { orderBy: { rowNumber: 'asc' } },
      },
    });
  }

  // ==========================================
  // ERROR EXPORT & FORMULA INJECTION PREVENTION
  // ==========================================

  async exportErrors(batchId: string, user: AuthenticatedUser) {
    const batch = await this.getBatch(batchId, user);

    const errorRows = batch.rows.filter(
      (r) => r.validationStatus === ImportRowStatus.INVALID || r.validationErrors,
    );

    // CSV generator neutralizing formula injection (=, +, -, @)
    const sanitizeForCsv = (val: any): string => {
      if (val === null || val === undefined) return '';
      let str = String(val).trim();
      // Neutralize formula injection
      if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const header = ['Row Number', 'Product', 'Quantity', 'Errors'];
    const csvLines = [header.join(',')];

    for (const r of errorRows) {
      const data = r.normalizedDataJson as Record<string, any>;
      const errList = Array.isArray(r.validationErrors)
        ? (r.validationErrors as string[]).join('; ')
        : 'Invalid row';

      const line = [
        sanitizeForCsv(r.rowNumber),
        sanitizeForCsv(data.productName || data.productId || ''),
        sanitizeForCsv(data.quantity || ''),
        sanitizeForCsv(errList),
      ];
      csvLines.push(line.join(','));
    }

    return {
      batchId: batch.id,
      filename: `errors_${batch.sourceFilename.replace(/\.[^/.]+$/, '')}.csv`,
      csvData: csvLines.join('\n'),
      totalErrorRows: errorRows.length,
    };
  }
}
