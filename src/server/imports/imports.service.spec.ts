import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { ImportsService } from './imports.service';
import { GeminiExtractionAdapter } from './adapters/gemini-extraction.adapter';
import {
  UserRole,
  ImportType,
  ImportBatchStatus,
  ImportApprovalMode,
  ImportRowStatus,
  ProductStatus,
  StockCondition,
  TransactionType,
  Prisma,
} from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

describe('Imports Service (T-012: Bulk CSV/document extraction, validation and approvals)', () => {
  let importsService: ImportsService;
  let mockPrisma: any;
  let mockLedgerService: any;
  let mockExtractor: any;

  const superAdminUser: any = {
    id: 'sa-1',
    username: 'superadmin',
    role: UserRole.SUPER_ADMIN,
    status: 'ACTIVE',
    sessionId: 'sess-1',
  };

  const storeAdminUser: any = {
    id: 'sm-1',
    username: 'storeadmin',
    role: UserRole.STORE_ADMIN,
    status: 'ACTIVE',
    sessionId: 'sess-2',
  };

  const projectAdminUser: any = {
    id: 'ca-1',
    username: 'projectadmin',
    role: UserRole.PROJECT_ADMIN,
    status: 'ACTIVE',
    sessionId: 'sess-3',
  };

  const sampleProduct = {
    id: 'prod-cartridge',
    name: 'Diagnostic Cartridge A',
    status: ProductStatus.APPROVED,
    quantityPrecision: 0,
    units: [
      {
        id: 'unit-piece',
        unitName: 'PIECE',
        conversionToBase: new Prisma.Decimal(1),
        status: 'ACTIVE',
        isBaseUnit: true,
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
      attachment: {
        create: vi.fn().mockResolvedValue({ id: 'att-1', storageKey: 'imports/file.csv', mimeType: 'text/csv' }),
      },
      importBatch: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      importRow: {
        createMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      stockLocation: {
        findUnique: vi.fn().mockResolvedValue({ id: 'loc-wh-1' }),
      },
      inventoryBalance: {
        findFirst: vi.fn(),
      },
      category: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      productVersion: {
        create: vi.fn(),
      },
      auditEvent: {
        create: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };

    mockLedgerService = {
      postTransaction: vi.fn().mockResolvedValue({ id: 'tx-ledger-1' }),
    };

    mockExtractor = new GeminiExtractionAdapter();

    importsService = new ImportsService(
      mockPrisma as any,
      mockLedgerService as any,
      mockExtractor,
    );
  });

  describe('1. Ingestion, Security & Extraction Boundaries', () => {
    it('rejects unsupported file extension safely', async () => {
      await expect(
        importsService.createBatch(
          {
            importType: ImportType.STOCK_IN,
            sourceFilename: 'malicious.exe',
            fileContent: 'binary payload',
          },
          superAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects malicious script tags embedded in upload data', async () => {
      await expect(
        importsService.createBatch(
          {
            importType: ImportType.STOCK_IN,
            sourceFilename: 'stock.csv',
            fileContent: 'productName,quantity\n<script>alert("xss")</script>,10',
          },
          superAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully ingests and extracts from Excel (.xlsx) workbook draft', async () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['productName', 'quantity', 'unitName', 'locationId'],
        ['Diagnostic Cartridge A', 50, 'PIECE', 'loc-wh-1'],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Stock');
      const base64Data = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      mockPrisma.importBatch.create.mockResolvedValue({
        id: 'batch-xlsx-1',
        importType: ImportType.STOCK_IN,
        status: ImportBatchStatus.DRAFT,
        sourceFilename: 'stock_import.xlsx',
        rows: [],
      });

      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-xlsx-1',
        status: ImportBatchStatus.DRAFT,
        rows: [
          {
            id: 'row-xlsx-1',
            rowNumber: 1,
            normalizedDataJson: {
              productName: 'Diagnostic Cartridge A',
              quantity: 50,
              unitName: 'PIECE',
              locationId: 'loc-wh-1',
            },
            validationStatus: ImportRowStatus.PENDING,
          },
        ],
      });

      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);

      const batch = await importsService.createBatch(
        {
          importType: ImportType.STOCK_IN,
          sourceFilename: 'stock_import.xlsx',
          fileContent: base64Data,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        superAdminUser,
      );

      expect(batch.id).toBe('batch-xlsx-1');
      expect(mockPrisma.attachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalName: 'stock_import.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        }),
      );
      expect(mockPrisma.importRow.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              rowNumber: 1,
            }),
          ]),
        }),
      );
    });

    it('creates draft import batch without posting inventory or changing balances', async () => {
      const csvData = 'productName,quantity,unitName,locationId\nDiagnostic Cartridge A,100,PIECE,loc-wh-1';

      mockPrisma.importBatch.create.mockResolvedValue({
        id: 'batch-1',
        importType: ImportType.STOCK_IN,
        status: ImportBatchStatus.DRAFT,
        sourceFilename: 'stock.csv',
        rows: [],
      });

      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        status: ImportBatchStatus.DRAFT,
        rows: [
          {
            id: 'row-1',
            rowNumber: 1,
            normalizedDataJson: {
              productName: 'Diagnostic Cartridge A',
              quantity: 100,
              unitName: 'PIECE',
              locationId: 'loc-wh-1',
            },
            validationStatus: ImportRowStatus.PENDING,
          },
        ],
      });

      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);

      const batch = await importsService.createBatch(
        {
          importType: ImportType.STOCK_IN,
          sourceFilename: 'stock.csv',
          fileContent: csvData,
          defaultLocationId: 'loc-wh-1',
        },
        superAdminUser,
      );

      // Invariant check: Ledger was NEVER called on batch creation
      expect(mockLedgerService.postTransaction).not.toHaveBeenCalled();
      expect(batch.status).toBe(ImportBatchStatus.DRAFT);
    });
  });

  describe('2. Duplicate Detection (REQ-016: Duplicate rows flagged, never silently merged)', () => {
    it('flags duplicate rows in batch and requires user choice without silently merging', async () => {
      const csvData =
        'productName,quantity,unitName,locationId\n' +
        'Diagnostic Cartridge A,50,PIECE,loc-wh-1\n' +
        'Diagnostic Cartridge A,50,PIECE,loc-wh-1';

      mockPrisma.importBatch.create.mockResolvedValue({
        id: 'batch-dup',
        importType: ImportType.STOCK_IN,
        status: ImportBatchStatus.DRAFT,
        sourceFilename: 'stock_dup.csv',
      });

      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-dup',
        status: ImportBatchStatus.DRAFT,
        rows: [],
      });

      await importsService.createBatch(
        {
          importType: ImportType.STOCK_IN,
          sourceFilename: 'stock_dup.csv',
          fileContent: csvData,
          defaultLocationId: 'loc-wh-1',
        },
        superAdminUser,
      );

      // Verify that createMany created two separate rows, and the second row has hasDuplicateWarning = true
      expect(mockPrisma.importRow.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ rowNumber: 1, hasDuplicateWarning: false }),
          expect.objectContaining({ rowNumber: 2, hasDuplicateWarning: true }),
        ]),
      });
    });
  });

  describe('3. Row Correction Without Re-Upload', () => {
    it('corrects a row field in place, preserving draft and not affecting inventory stock', async () => {
      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-edit',
        status: ImportBatchStatus.DRAFT,
        rows: [
          {
            id: 'row-to-edit',
            rowNumber: 1,
            normalizedDataJson: { productName: 'Typo Cartridge', quantity: 20 },
            validationStatus: ImportRowStatus.INVALID,
          },
        ],
      });

      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.importRow.findUnique.mockResolvedValue({
        id: 'row-to-edit',
        normalizedDataJson: { productName: 'Diagnostic Cartridge A', quantity: 20, unitName: 'PIECE', locationId: 'loc-wh-1' },
        editedAfterExtraction: true,
      });

      const updated = await importsService.updateRow(
        'batch-edit',
        'row-to-edit',
        {
          normalizedData: {
            productName: 'Diagnostic Cartridge A',
            quantity: 20,
            unitName: 'PIECE',
            locationId: 'loc-wh-1',
          },
        },
        superAdminUser,
      );

      expect(mockPrisma.importRow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'row-to-edit' },
          data: expect.objectContaining({
            editedAfterExtraction: true,
          }),
        }),
      );
      // Invariant: No stock movement occurred
      expect(mockLedgerService.postTransaction).not.toHaveBeenCalled();
    });
  });

  describe('4. Approval Modes & Single Source Warehouse Invariant (Section 4 Test Cases)', () => {
    it('All-or-Nothing batch with one invalid row fails approval and posts zero rows', async () => {
      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-aon',
        importType: ImportType.STOCK_IN,
        status: ImportBatchStatus.SUBMITTED,
        approvalMode: ImportApprovalMode.ALL_OR_NOTHING,
        rows: [
          { id: 'r1', validationStatus: ImportRowStatus.VALID, normalizedDataJson: { productName: 'Cartridge A', quantity: 10 } },
          { id: 'r2', validationStatus: ImportRowStatus.INVALID, normalizedDataJson: { productName: 'Bad Product', quantity: 10 } },
        ],
      });

      await expect(
        importsService.approveBatch('batch-aon', { approvalMode: ImportApprovalMode.ALL_OR_NOTHING }, superAdminUser),
      ).rejects.toThrow(BadRequestException);

      // Invariant: Zero rows posted
      expect(mockLedgerService.postTransaction).not.toHaveBeenCalled();
    });

    it('Partial batch posts only valid rows and preserves invalid row states', async () => {
      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-partial',
        importType: ImportType.STOCK_IN,
        status: ImportBatchStatus.SUBMITTED,
        approvalMode: ImportApprovalMode.PARTIAL,
        rows: [
          {
            id: 'r1',
            validationStatus: ImportRowStatus.VALID,
            normalizedDataJson: {
              productId: 'prod-cartridge',
              quantity: 10,
              unitName: 'PIECE',
              locationId: 'loc-wh-1',
            },
          },
          {
            id: 'r2',
            validationStatus: ImportRowStatus.INVALID,
            normalizedDataJson: { productId: 'bad-id', quantity: 5 },
          },
        ],
      });

      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.importBatch.update.mockResolvedValue({
        id: 'batch-partial',
        status: ImportBatchStatus.PARTIALLY_APPROVED,
      });

      const approved = await importsService.approveBatch(
        'batch-partial',
        { approvalMode: ImportApprovalMode.PARTIAL },
        superAdminUser,
      );

      // Verify that ledger posted only row 1
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.STOCK_IN,
          sourceRefType: 'IMPORT_BATCH',
          lines: [
            expect.objectContaining({
              productId: 'prod-cartridge',
              quantity: 10,
            }),
          ],
        }),
        'sa-1',
        expect.anything(),
      );

      expect(mockPrisma.importRow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: { validationStatus: ImportRowStatus.POSTED },
        }),
      );
      // Row r2 was NOT updated to POSTED
      expect(mockPrisma.importRow.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r2' },
          data: { validationStatus: ImportRowStatus.POSTED },
        }),
      );
    });

    it('Stock-out batch with mixed source warehouses is rejected (Test Plan item 52)', async () => {
      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-mixed-wh',
        importType: ImportType.STOCK_OUT,
        status: ImportBatchStatus.SUBMITTED,
        approvalMode: ImportApprovalMode.PARTIAL,
        rows: [
          { id: 'r1', validationStatus: ImportRowStatus.VALID, normalizedDataJson: { locationId: 'loc-wh-1' } },
          { id: 'r2', validationStatus: ImportRowStatus.VALID, normalizedDataJson: { locationId: 'loc-wh-2' } },
        ],
      });

      await expect(
        importsService.approveBatch('batch-mixed-wh', {}, superAdminUser),
      ).rejects.toThrow(BadRequestException);

      expect(mockLedgerService.postTransaction).not.toHaveBeenCalled();
    });
  });

  describe('5. CSV Formula Injection Neutralization (Security Test 61)', () => {
    it('neutralizes leading =, +, -, @ formula characters in error exports', async () => {
      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-sec',
        sourceFilename: 'injected.csv',
        rows: [
          {
            id: 'r-inj',
            rowNumber: 1,
            validationStatus: ImportRowStatus.INVALID,
            normalizedDataJson: {
              productName: '=cmd|"/c calc"!A0',
              quantity: '+1234',
            },
            validationErrors: ['Invalid product', '-formula-error'],
          },
        ],
      });

      const exportResult = await importsService.exportErrors('batch-sec', superAdminUser);
      // Verify that values starting with =, +, -, @ are prepended with '
      expect(exportResult.csvData).toContain(`"'=cmd|""/c calc""!A0"`);
      expect(exportResult.csvData).toContain(`"'+1234"`);
    });
  });

  describe('6. Bulk Product Catalog, Categories and Subcategories Import via Excel & CSV', () => {
    it('rejects Store Admin from creating or importing product catalog batch', async () => {
      await expect(
        importsService.createBatch(
          {
            importType: ImportType.PRODUCT_CATALOG,
            sourceFilename: 'catalog.xlsx',
            fileContent: 'UEsDBBQAAAA=',
          },
          storeAdminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ingests and extracts products, categories and subcategories from an Excel (.xlsx) file', async () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['category', 'subcategory', 'productName', 'brand', 'unitName', 'description', 'quantityPrecision', 'allowFractional'],
        ['Medical Consumables', 'Gloves', 'Latex Examination Gloves M', 'SafeTouch', 'BOX', 'Box of 100 powder-free latex gloves', 0, false],
        ['Laboratory Reagents', 'Acids', 'Hydrochloric Acid 37% AR', 'Merck', 'BOTTLE', '500ml analytical reagent grade', 2, true],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Catalog');
      const base64Data = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      mockPrisma.importBatch.create.mockResolvedValue({
        id: 'batch-cat-xlsx',
        importType: ImportType.PRODUCT_CATALOG,
        status: ImportBatchStatus.DRAFT,
        sourceFilename: 'products_catalog.xlsx',
        rows: [],
      });

      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-cat-xlsx',
        importType: ImportType.PRODUCT_CATALOG,
        status: ImportBatchStatus.DRAFT,
        rows: [
          {
            id: 'row-cat-1',
            rowNumber: 1,
            normalizedDataJson: {
              category: 'Medical Consumables',
              subcategory: 'Gloves',
              productName: 'Latex Examination Gloves M',
              brand: 'SafeTouch',
              unitName: 'BOX',
              quantityPrecision: 0,
              allowFractional: false,
            },
            validationStatus: ImportRowStatus.PENDING,
          },
        ],
      });

      mockPrisma.product.findFirst.mockResolvedValue(null);

      const batch = await importsService.createBatch(
        {
          importType: ImportType.PRODUCT_CATALOG,
          sourceFilename: 'products_catalog.xlsx',
          fileContent: base64Data,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        superAdminUser,
      );

      expect(batch.id).toBe('batch-cat-xlsx');
      expect(mockPrisma.attachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalName: 'products_catalog.xlsx',
          }),
        }),
      );
      expect(mockPrisma.importRow.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              rowNumber: 1,
              normalizedDataJson: expect.objectContaining({
                category: 'Medical Consumables',
                subcategory: 'Gloves',
                productName: 'Latex Examination Gloves M',
              }),
            }),
          ]),
        }),
      );
    });

    it('validates catalog rows and flags missing required fields', async () => {
      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-cat-val',
        importType: ImportType.PRODUCT_CATALOG,
        status: ImportBatchStatus.DRAFT,
        approvalMode: ImportApprovalMode.PARTIAL,
        rows: [
          {
            id: 'r-valid',
            rowNumber: 1,
            normalizedDataJson: {
              category: 'Consumables',
              productName: 'Syringe 5ml',
              quantityPrecision: 0,
            },
            validationStatus: ImportRowStatus.PENDING,
          },
          {
            id: 'r-no-name',
            rowNumber: 2,
            normalizedDataJson: {
              category: 'Consumables',
              quantityPrecision: 0,
            },
            validationStatus: ImportRowStatus.PENDING,
          },
          {
            id: 'r-no-cat',
            rowNumber: 3,
            normalizedDataJson: {
              productName: 'Unnamed Test Item',
              quantityPrecision: 0,
            },
            validationStatus: ImportRowStatus.PENDING,
          },
        ],
      });

      mockPrisma.product.findFirst.mockResolvedValue(null);

      await importsService.validateBatch('batch-cat-val', superAdminUser);

      // Verify row 1 is marked valid
      expect(mockPrisma.importRow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r-valid' },
          data: expect.objectContaining({ validationStatus: ImportRowStatus.VALID }),
        }),
      );

      // Verify row 2 is marked invalid for missing product name
      expect(mockPrisma.importRow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r-no-name' },
          data: expect.objectContaining({
            validationStatus: ImportRowStatus.INVALID,
            validationErrors: expect.arrayContaining(['Product name is required']),
          }),
        }),
      );

      // Verify row 3 is marked invalid for missing category
      expect(mockPrisma.importRow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r-no-cat' },
          data: expect.objectContaining({
            validationStatus: ImportRowStatus.INVALID,
            validationErrors: expect.arrayContaining(['Category is required']),
          }),
        }),
      );
    });

    it('approves product catalog import batch, creating categories, subcategories, products and versions', async () => {
      mockPrisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-cat-appr',
        importType: ImportType.PRODUCT_CATALOG,
        status: ImportBatchStatus.SUBMITTED,
        approvalMode: ImportApprovalMode.ALL_OR_NOTHING,
        uploadedBy: { role: UserRole.SUPER_ADMIN },
        rows: [
          {
            id: 'r-prod-1',
            rowNumber: 1,
            validationStatus: ImportRowStatus.VALID,
            normalizedDataJson: {
              category: 'Medical Consumables',
              subcategory: 'Gloves',
              productName: 'Latex Gloves Medium',
              brand: 'SafeTouch',
              unitName: 'BOX',
              description: 'Box of 100 gloves',
              quantityPrecision: 0,
              allowFractional: false,
            },
          },
        ],
      });

      mockPrisma.category.findFirst
        .mockResolvedValueOnce(null) // Main category not found -> will create
        .mockResolvedValueOnce(null); // Subcategory not found -> will create

      mockPrisma.category.create
        .mockResolvedValueOnce({ id: 'cat-main-1', name: 'Medical Consumables', parentId: null })
        .mockResolvedValueOnce({ id: 'cat-sub-1', name: 'Gloves', parentId: 'cat-main-1' });

      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockPrisma.product.create.mockResolvedValue({
        id: 'prod-gloves-1',
        name: 'Latex Gloves Medium',
        categoryId: 'cat-sub-1',
        status: ProductStatus.APPROVED,
        quantityPrecision: 0,
        allowFractional: false,
      });

      mockPrisma.productVersion.create.mockResolvedValue({
        id: 'ver-1',
        versionNumber: 1,
      });

      mockPrisma.importBatch.update.mockResolvedValue({
        id: 'batch-cat-appr',
        status: ImportBatchStatus.POSTED,
        rows: [],
      });

      const result = await importsService.approveBatch('batch-cat-appr', {}, superAdminUser);

      // Verify category creation: main category and subcategory
      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Medical Consumables',
          parentId: null,
          ownerScope: 'COMPANY',
        }),
      });

      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Gloves',
          parentId: 'cat-main-1',
          ownerScope: 'COMPANY',
        }),
      });

      // Verify product creation with base unit
      expect(mockPrisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Latex Gloves Medium',
          brand: 'SafeTouch',
          categoryId: 'cat-sub-1',
          ownerScope: 'COMPANY',
          status: ProductStatus.APPROVED,
          units: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                unitName: 'BOX',
                isBaseUnit: true,
              }),
            ]),
          }),
        }),
      });

      // Verify product version 1 creation
      expect(mockPrisma.productVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-gloves-1',
          versionNumber: 1,
          status: 'APPROVED',
        }),
      });

      // Verify audit event creation
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'PRODUCT_CATALOG_IMPORT_POSTED',
          entityType: 'IMPORT_BATCH',
          entityId: 'batch-cat-appr',
        }),
      });

      // Verify row updated to POSTED
      expect(mockPrisma.importRow.update).toHaveBeenCalledWith({
        where: { id: 'r-prod-1' },
        data: { validationStatus: ImportRowStatus.POSTED },
      });

      expect(result.status).toBe(ImportBatchStatus.POSTED);
    });
  });
});
