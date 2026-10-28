import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../inventory/ledger.service';
import { GeminiExtractionAdapter } from './adapters/gemini-extraction.adapter';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { computeDuplicateKey } from '../catalog/products.service';
import { importRequiresApproval, mergeApprovalRequirements } from '../notifications/approval-requirements';
import {
  UserRole,
  ImportType,
  ImportBatchStatus,
  ImportApprovalMode,
  ImportRowStatus,
  FileScanStatus,
  ProductStatus,
  ProductKind,
  ProductVersionStatus,
  CatalogScope,
  StockCondition,
  TransactionType,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CreateImportBatchDto } from './dto/create-import-batch.dto';
import { UpdateImportRowDto } from './dto/update-import-row.dto';
import { SubmitImportBatchDto } from './dto/submit-import-batch.dto';
import {
  ApproveImportBatchDto,
  RejectImportBatchDto,
} from './dto/decide-import-batch.dto';

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly extractor: GeminiExtractionAdapter,
    @Optional() private readonly storageService?: StorageService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  // ==========================================
  // BATCH CREATION & INGESTION
  // ==========================================

  async createBatch(dto: CreateImportBatchDto, user: AuthenticatedUser) {
    if (dto.importType === ImportType.PRODUCT_CATALOG && user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot create or import product catalog');
    }
    if (
      dto.importType !== ImportType.STOCK_IN &&
      dto.importType !== ImportType.STOCK_OUT &&
      dto.importType !== ImportType.PRODUCT_CATALOG
    ) {
      throw new BadRequestException(`Import type ${dto.importType} is not supported for posting yet`);
    }
    const ext = dto.sourceFilename.split('.').pop()?.toLowerCase();
    const allowedExts = ['csv', 'json', 'txt', 'xlsx', 'xls'];
    if (!ext || !allowedExts.includes(ext)) {
      throw new BadRequestException(`Unsupported file type ".${ext}". Allowed import formats: ${allowedExts.join(', ')}`);
    }

    const isExcelExt = ext === 'xlsx' || ext === 'xls';
    let buffer: Buffer;
    if (isExcelExt) {
      if (dto.fileContent.startsWith('data:')) {
        const base64Part = dto.fileContent.split(',')[1] || '';
        buffer = Buffer.from(base64Part, 'base64');
      } else {
        const trimmed = dto.fileContent.trim();
        const looksLikeBase64Excel = /^(UEsDB|0M8R4)/.test(trimmed);
        if (looksLikeBase64Excel) {
          buffer = Buffer.from(trimmed, 'base64');
        } else if (trimmed.includes(',') || trimmed.includes('\n') || trimmed.includes('\t')) {
          buffer = Buffer.from(dto.fileContent, 'utf-8');
        } else {
          try {
            buffer = Buffer.from(trimmed, 'base64');
          } catch {
            buffer = Buffer.from(dto.fileContent, 'utf-8');
          }
        }
      }
    } else {
      buffer = Buffer.from(dto.fileContent, 'utf-8');
    }

    const maxSizeBytes = 10 * 1024 * 1024; // 10MB limit
    if (buffer.length > maxSizeBytes) {
      throw new BadRequestException(`File size exceeds maximum permitted limit of 10MB (${buffer.length} bytes)`);
    }

    // Check for malicious payload / dangerous signatures
    if (!isExcelExt) {
      const rawContentStr = dto.fileContent.toLowerCase();
      if (
        rawContentStr.includes('<script') ||
        rawContentStr.includes('javascript:') ||
        rawContentStr.includes('<?php')
      ) {
        throw new BadRequestException('Security violation: Malicious script tags or executable code detected in upload');
      }
    }

    const defaultMime = ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : ext === 'xls'
      ? 'application/vnd.ms-excel'
      : ext === 'csv'
      ? 'text/csv'
      : 'application/json';

    const mimeType = dto.mimeType || defaultMime;
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const storageKey = `imports/${Date.now()}-${checksum.substring(0, 12)}.${ext}`;

    // 2. Store Attachment metadata (pending malware scan)
    const attachment = await this.prisma.attachment.create({
      data: {
        storageKey,
        originalName: dto.sourceFilename,
        mimeType,
        sizeBytes: buffer.length,
        checksum,
        scanStatus: FileScanStatus.PENDING,
        uploadedById: user.id,
      },
    });

    // 2b. Persist file payload to Neon Object Storage / storage driver
    if (this.storageService) {
      try {
        await this.storageService.uploadFile(
          storageKey,
          buffer,
          attachment.mimeType,
        );
      } catch (storageErr: any) {
        this.logger.warn(
          `Failed to persist file buffer to storage driver: ${storageErr.message}`,
        );
      }
    }

    // 3. Extract data via AI extraction adapter (or deterministic fallback)
    const extractionResult = await this.extractor.extractFromDocument(
      isExcelExt ? buffer : dto.fileContent,
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

      // Duplicate row detection signature:
      const sig = dto.importType === ImportType.PRODUCT_CATALOG
        ? `${(normalized.productName || '').trim().toLowerCase()}|${(normalized.category || '').trim().toLowerCase()}|${(normalized.subcategory || '').trim().toLowerCase()}|${(normalized.brand || '').trim().toLowerCase()}`
        : `${normalized.productId || normalized.productName || ''}|${normalized.locationId || ''}`;
      let hasDuplicateWarning = false;
      let duplicateWarningReason: string | null = null;

      if (seenRowSignatures.has(sig) && sig !== '||' && sig !== '|||') {
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

    if (user.role === UserRole.PROJECT_ADMIN || user.role === UserRole.STORE_ADMIN) {
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
      (user.role === UserRole.PROJECT_ADMIN || user.role === UserRole.STORE_ADMIN) &&
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

    if (batch.status !== ImportBatchStatus.DRAFT && batch.status !== ImportBatchStatus.VALIDATED) {
      throw new ConflictException('Only draft or validated import batches can be edited');
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
    if (batch.status !== ImportBatchStatus.DRAFT && batch.status !== ImportBatchStatus.VALIDATED) {
      throw new ConflictException('Only draft or validated import batches can be validated');
    }

    let hasInvalidRows = false;
    let mixedWarehouseLocations = new Set<string>();
    const dbUser = user.role === UserRole.SUPER_ADMIN
      ? null
      : await this.prisma.user.findUnique({ where: { id: user.id }, select: { warehouseId: true, projectId: true } });

    if (batch.importType === ImportType.PRODUCT_CATALOG) {
      if (user.role === UserRole.STORE_ADMIN) {
        throw new ForbiddenException('Store Admin cannot create or validate product catalog');
      }
      let catalogScope: CatalogScope = CatalogScope.COMPANY;
      let projectId: string | null = null;
      if (user.role === UserRole.PROJECT_ADMIN) {
        catalogScope = CatalogScope.PROJECT;
        projectId = dbUser?.projectId || null;
      }

      for (const row of batch.rows) {
        const data = row.normalizedDataJson as Record<string, any>;
        const errors: string[] = [];

        // 1. Validate Product Name
        const productName = (data.productName || '').trim();
        if (!productName) {
          errors.push('Product name is required');
        }

        // 2. Validate Category
        const categoryName = (data.category || '').trim();
        if (!categoryName) {
          errors.push('Category is required');
        }

        // 3. Validate Precision and AllowFractional
        const precision = Number(data.quantityPrecision ?? 0);
        if (isNaN(precision) || precision < 0 || precision > 2) {
          errors.push('Quantity precision must be 0, 1, or 2');
        }
        const allowFractional = Boolean(data.allowFractional === true || String(data.allowFractional).toLowerCase() === 'true');
        if (!allowFractional && precision !== 0) {
          errors.push('Whole-unit products must have a quantity precision of 0');
        }

        // 4. Validate Kind
        if (user.role === UserRole.PROJECT_ADMIN && data.kind && data.kind !== 'MANUFACTURED_PRODUCT') {
          errors.push('Project Admins can create manufactured products only');
        }

        // 5. Duplicate Check against existing database products
        if (productName && categoryName) {
          const existingProduct = await this.prisma.product.findFirst({
            where: {
              name: { equals: productName, mode: 'insensitive' },
              ownerScope: catalogScope,
              projectId,
              brand: data.brand?.trim() ? { equals: data.brand.trim(), mode: 'insensitive' } : null,
            },
          });
          if (existingProduct) {
            errors.push(`A product named "${productName}" with matching brand already exists in this catalog`);
          }
        }

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

      await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: hasInvalidRows ? ImportBatchStatus.DRAFT : ImportBatchStatus.VALIDATED,
          errorSummary: null,
        },
      });

      return this.getBatch(batchId, user);
    }

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

      if (!product) {
        errors.push(`Product "${data.productId || data.productName || 'unknown'}" not found`);
      } else if (product.status !== ProductStatus.APPROVED) {
        errors.push(`Product "${product.name}" is not approved (status: ${product.status})`);
      }

      // 2. Resolve Quantity & Unit
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
      }

      // 4. Resolve Location
      if (data.locationId) {
        const loc = await this.prisma.stockLocation.findUnique({
          where: { id: data.locationId },
        });
        if (!loc) {
          errors.push(`Stock location ${data.locationId} not found`);
        } else if (!this.canUseLocation(loc, user, dbUser)) {
          errors.push('Stock location is outside your authorized organization scope');
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
          },
        });
        const available = balance ? balance.usableQty.minus(balance.reservedQty) : new Prisma.Decimal(0);
        if (available.lt(data.quantity || 0)) {
          errors.push(`Insufficient available usable stock at location (${available} available, ${data.quantity} requested)`);
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

  async submitBatch(batchId: string, dto: SubmitImportBatchDto, user: AuthenticatedUser) {
    const batch = await this.getBatch(batchId, user);
    if (batch.status !== ImportBatchStatus.DRAFT && batch.status !== ImportBatchStatus.VALIDATED) {
      throw new ConflictException('Only draft or validated batches can be submitted');
    }

    const validatedBatch = await this.validateBatch(batchId, user);
    const mode = dto.approvalMode ?? validatedBatch.approvalMode;
    const invalidRows = validatedBatch.rows.filter((row) => row.validationStatus === ImportRowStatus.INVALID);
    const validRows = validatedBatch.rows.filter((row) => row.validationStatus === ImportRowStatus.VALID);

    if (validatedBatch.errorSummary) {
      throw new BadRequestException(validatedBatch.errorSummary);
    }
    if (mode === ImportApprovalMode.ALL_OR_NOTHING && invalidRows.length > 0) {
      throw new BadRequestException('Correct every invalid row before submitting an all-or-nothing batch');
    }
    if (validRows.length === 0) {
      throw new BadRequestException('At least one valid row is required to submit this batch');
    }

    const submitted = await this.prisma.importBatch.update({
      where: { id: batchId },
      data: { status: ImportBatchStatus.SUBMITTED, approvalMode: mode },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    const settings = await this.notificationsService?.getSettings?.();
    const requiresApproval = importRequiresApproval(
      batch.importType,
      mergeApprovalRequirements(settings?.approvalRequirements),
    );
    if (!requiresApproval) return this.approveBatch(batchId, { approvalMode: mode }, user, true);
    return submitted;
  }

  private canUseLocation(
    location: { locationType: string; warehouseId: string | null; projectId: string | null },
    user: AuthenticatedUser,
    dbUser: { warehouseId: string | null; projectId: string | null } | null,
  ): boolean {
    if (user.role === UserRole.SUPER_ADMIN) return true;
    if (user.role === UserRole.STORE_ADMIN) {
      return location.locationType === 'WAREHOUSE' && location.warehouseId === dbUser?.warehouseId;
    }
    if (user.role === UserRole.PROJECT_ADMIN) {
      return location.locationType === 'PROJECT' && location.projectId === dbUser?.projectId;
    }
    return false;
  }

  // ==========================================
  // BATCH APPROVAL & STOCK POSTING
  // ==========================================

  async approveBatch(
    batchId: string,
    dto: ApproveImportBatchDto,
    user: AuthenticatedUser,
    automated = false,
  ) {
    if (!automated && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve and post import batches');
    }

    const batch = await this.getBatch(batchId, user);

    if (batch.status === ImportBatchStatus.APPROVED || batch.status === ImportBatchStatus.POSTED) {
      throw new ConflictException('Import batch has already been approved');
    }
    if (batch.status !== ImportBatchStatus.SUBMITTED) {
      throw new ConflictException('Import batch must be submitted before Super Admin approval');
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

    if (batch.importType === ImportType.PRODUCT_CATALOG) {
      return this.prisma.$transaction(async (tx) => {
        let ownerScope: CatalogScope = CatalogScope.COMPANY;
        let projectId: string | null = null;
        if (batch.uploadedBy?.role === UserRole.PROJECT_ADMIN) {
          ownerScope = CatalogScope.PROJECT;
          const u = await tx.user.findUnique({ where: { id: batch.uploadedById }, select: { projectId: true } });
          projectId = u?.projectId || null;
        }

        const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

        for (const row of eligibleRows) {
          const data = row.normalizedDataJson as Record<string, any>;
          const categoryName = (data.category || '').trim();
          const subcategoryName = (data.subcategory || '').trim();
          const productName = (data.productName || '').trim();
          const brand = data.brand?.trim() || null;
          const description = data.description?.trim() || null;
          const baseUnitName = (data.unitName || data.baseUnit || 'PIECE').trim().toUpperCase();
          const precision = Number(data.quantityPrecision ?? 0);
          const allowFractional = Boolean(data.allowFractional === true || String(data.allowFractional).toLowerCase() === 'true');
          const minQty = Number(data.minQuantity ?? 0);
          const minOrderQty = Number(data.minOrderQuantity ?? 1);
          const productKind: ProductKind = ownerScope === CatalogScope.PROJECT
            ? ProductKind.MANUFACTURED_PRODUCT
            : (data.kind === 'MANUFACTURED_PRODUCT' ? ProductKind.MANUFACTURED_PRODUCT : ProductKind.RAW_MATERIAL);

          // 1. Find or create Main Category
          let mainCategory = await tx.category.findFirst({
            where: {
              name: { equals: categoryName, mode: 'insensitive' },
              parentId: null,
              ownerScope,
              projectId,
            },
          });
          if (!mainCategory) {
            mainCategory = await tx.category.create({
              data: {
                name: categoryName,
                parentId: null,
                ownerScope,
                projectId,
              },
            });
          }

          // 2. Find or create Subcategory if provided
          let targetCategoryId = mainCategory.id;
          if (subcategoryName) {
            let subcategory = await tx.category.findFirst({
              where: {
                name: { equals: subcategoryName, mode: 'insensitive' },
                parentId: mainCategory.id,
                ownerScope,
                projectId,
              },
            });
            if (!subcategory) {
              subcategory = await tx.category.create({
                data: {
                  name: subcategoryName,
                  parentId: mainCategory.id,
                  ownerScope,
                  projectId,
                },
              });
            }
            targetCategoryId = subcategory.id;
          }

          // 3. Compute deterministic duplicate key
          const duplicateKey = computeDuplicateKey({
            ownerScope,
            projectId,
            name: productName,
            categoryId: targetCategoryId,
            brand,
            attributes: [],
          });

          // 4. Create Product if not already present
          const existing = await tx.product.findUnique({
            where: { duplicateKey },
          });

          if (!existing) {
            const product = await tx.product.create({
              data: {
                ownerScope,
                projectId,
                categoryId: targetCategoryId,
                name: productName,
                brand,
                description,
                kind: productKind,
                status: isSuperAdmin ? ProductStatus.APPROVED : ProductStatus.PENDING_APPROVAL,
                quantityPrecision: precision,
                allowFractional,
                minQuantity: new Prisma.Decimal(minQty),
                minOrderQuantity: new Prisma.Decimal(minOrderQty),
                duplicateKey,
                approvedById: isSuperAdmin ? user.id : null,
                approvedAt: isSuperAdmin ? new Date() : null,
                units: {
                  create: [
                    {
                      unitName: baseUnitName,
                      isBaseUnit: true,
                      conversionToBase: new Prisma.Decimal(1),
                      status: 'ACTIVE',
                    },
                  ],
                },
              },
            });

            await tx.productVersion.create({
              data: {
                productId: product.id,
                versionNumber: 1,
                status: isSuperAdmin ? ProductVersionStatus.APPROVED : ProductVersionStatus.PENDING_APPROVAL,
                specification: {
                  name: product.name,
                  kind: product.kind,
                  brand: product.brand,
                  description: product.description,
                  categoryId: product.categoryId,
                  quantityPrecision: product.quantityPrecision,
                  allowFractional: product.allowFractional,
                  minQuantity: String(product.minQuantity),
                  minOrderQuantity: String(product.minOrderQuantity),
                  attributes: [],
                  units: [{ unitName: baseUnitName, isBaseUnit: true, conversionToBase: '1' }],
                },
                submittedById: user.id,
                reviewedById: isSuperAdmin ? user.id : null,
                effectiveFrom: new Date(),
              },
            });
          }

          await tx.importRow.update({
            where: { id: row.id },
            data: { validationStatus: ImportRowStatus.POSTED },
          });
        }

        await tx.auditEvent.create({
          data: {
            actorUserId: user.id,
            action: 'PRODUCT_CATALOG_IMPORT_POSTED',
            entityType: 'IMPORT_BATCH',
            entityId: batch.id,
            reason: `Bulk catalog import approved: ${eligibleRows.length} items processed.`,
          },
        });

        const finalBatchStatus =
          invalidRows.length > 0
            ? ImportBatchStatus.PARTIALLY_APPROVED
            : ImportBatchStatus.POSTED;

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

    // Atomic stock posting if inventory-affecting (STOCK_IN, STOCK_OUT, PHYSICAL_COUNT)
    const lines: Array<{
      locationId: string;
      productId: string;
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
            idempotencyKey: dto.idempotencyKey ?? `import-batch-${batch.id}`,
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
          : automated ? ImportBatchStatus.POSTED : ImportBatchStatus.APPROVED;

      if (automated) {
        await tx.auditEvent.create({ data: {
          actorUserId: user.id,
          action: 'IMPORT_AUTO_POSTED',
          entityType: 'IMPORT_BATCH',
          entityId: batch.id,
          reason: 'Super Admin approval settings allow immediate posting for this import type.',
        } });
      }

      return tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: finalBatchStatus,
          approvedById: automated ? null : user.id,
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

    if (batch.status !== ImportBatchStatus.SUBMITTED) {
      throw new ConflictException('Only submitted import batches can be rejected');
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
