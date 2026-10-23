import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DepartmentsService } from './departments.service';
import {
  UserRole,
  DepartmentStatus,
  DepartmentIssueStatus,
  DepartmentReturnStatus,
  ProductStatus,
  ProductKind,
  CatalogScope,
  StockCondition,
  TransactionType,
  Prisma,
} from '@prisma/client';
import { DepartmentIssueBatchStatus } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

describe('Departments Service (T-011: Departments, issues, returns and condition handling)', () => {
  let departmentsService: DepartmentsService;
  let mockPrisma: any;
  let mockLedgerService: any;
  let mockInventoryService: any;
  let mockNotificationsService: any;

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

  const testProduct = {
    id: 'prod-1',
    projectId: 'project-123',
    name: 'Lab Diagnostic Cartridge',
    kind: ProductKind.MANUFACTURED_PRODUCT,
    status: ProductStatus.APPROVED,
    quantityPrecision: 0,
    units: [
      {
        id: 'unit-box',
        unitName: 'BOX',
        conversionToBase: new Prisma.Decimal(10),
        status: 'ACTIVE',
        isBaseUnit: false,
      },
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
      $queryRaw: vi.fn(),
      project: {
        findUnique: vi.fn(),
      },
      department: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      departmentIssue: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      departmentIssueBatch: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      departmentReturn: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
      },
      stockLocation: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      inventoryBalance: {
        findFirst: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };

    mockLedgerService = {
      postTransaction: vi.fn().mockResolvedValue({ id: 'tx-ledger-1' }),
    };

    mockInventoryService = {
      getOrCreateLocationForProject: vi.fn().mockResolvedValue({
        id: 'loc-project-1',
        projectId: 'project-123',
        locationType: 'PROJECT',
      }),
    };
    mockNotificationsService = {
      notifySuperAdmins: vi.fn(),
      notifyUser: vi.fn(),
      notifyProjectAdmins: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({ approvalRequirements: { departmentIssue: true } }),
    };

    departmentsService = new DepartmentsService(
      mockPrisma as any,
      mockLedgerService as any,
      mockInventoryService as any,
      mockNotificationsService as any,
      { reserveDepartmentIssues: vi.fn(), consumeReservationsForDepartmentIssueBatch: vi.fn(), releaseReservationsForDepartmentIssueBatch: vi.fn() } as any,
    );
  });

  describe('Daily department issue batches', () => {
    it('rejects company raw materials for a department issue batch', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({ id: 'dept-1', projectId: 'project-123', status: DepartmentStatus.ACTIVE });
      mockPrisma.product.findUnique.mockResolvedValue({
        ...testProduct,
        kind: ProductKind.RAW_MATERIAL,
        ownerScope: CatalogScope.COMPANY,
        projectId: null,
      });

      await expect((departmentsService as any).prepareIssueLine({
        departmentId: 'dept-1', productId: 'prod-1', quantity: 2, unitId: 'unit-piece',
      }, projectAdminUser, 'project-123')).rejects.toThrow(BadRequestException);
    });

    it('rejects manufactured products owned by another project', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({ id: 'dept-1', projectId: 'project-123', status: DepartmentStatus.ACTIVE });
      mockPrisma.product.findUnique.mockResolvedValue({ ...testProduct, projectId: 'another-project' });

      await expect((departmentsService as any).prepareIssueLine({
        departmentId: 'dept-1', productId: 'prod-1', quantity: 2, unitId: 'unit-piece',
      }, projectAdminUser, 'project-123')).rejects.toThrow(BadRequestException);
    });

    it('creates one project-scoped daily draft for a Project Admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ projectId: 'project-123' });
      mockPrisma.departmentIssueBatch.findFirst.mockResolvedValue(null);
      mockPrisma.departmentIssueBatch.create.mockResolvedValue({
        id: 'issue-batch-1',
        projectId: 'project-123',
        createdById: 'ca-1',
        status: DepartmentIssueBatchStatus.DRAFT,
        issues: [],
      });

      const result = await departmentsService.getOpenIssueBatch(projectAdminUser);

      expect(result!.status).toBe(DepartmentIssueBatchStatus.DRAFT);
      expect(mockPrisma.departmentIssueBatch.create).toHaveBeenCalledWith(expect.objectContaining({
        data: { projectId: 'project-123', createdById: 'ca-1' },
      }));
    });

    it('does not expose daily issue drafts to Store Admins', async () => {
      await expect(departmentsService.getOpenIssueBatch(storeAdminUser)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.departmentIssueBatch.findFirst).not.toHaveBeenCalled();
    });

    it('auto-posts a submitted batch and records an audit event when approval is disabled', async () => {
      const issue = {
        id: 'issue-1', issueBatchId: 'issue-batch-1', productId: 'prod-1', departmentId: 'dept-1', unitId: 'unit-piece', batchId: null,
        quantity: new Prisma.Decimal(2), unitNameSnapshot: 'PIECE',
        baseQuantity: new Prisma.Decimal(2), notes: null,
      };
      const batch = {
        id: 'issue-batch-1', projectId: 'project-123', createdById: 'ca-1',
        status: DepartmentIssueBatchStatus.DRAFT, issues: [issue],
      };
      mockPrisma.user.findUnique.mockResolvedValue({ projectId: 'project-123' });
      mockPrisma.department.findUnique.mockResolvedValue({ id: 'dept-1', projectId: 'project-123', status: DepartmentStatus.ACTIVE });
      mockPrisma.product.findUnique.mockResolvedValue({ ...testProduct, projectId: 'project-123' });
      mockPrisma.departmentIssueBatch.findUnique.mockResolvedValue(batch);
      mockPrisma.departmentIssueBatch.update.mockResolvedValue({
        ...batch, status: DepartmentIssueBatchStatus.POSTED,
      });
      mockNotificationsService.getSettings.mockResolvedValue({
        approvalRequirements: { departmentIssue: false },
      });

      const result = await departmentsService.submitIssueBatch('issue-batch-1', projectAdminUser);

      expect(result.status).toBe(DepartmentIssueBatchStatus.POSTED);
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(expect.objectContaining({
        sourceRefType: 'DEPARTMENT_ISSUE_BATCH',
        lines: [expect.objectContaining({ productId: 'prod-1', direction: 'OUT' })],
      }), 'ca-1', mockPrisma);
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: 'DEPARTMENT_ISSUE_BATCH_AUTO_POSTED' }),
      }));
    });

    it('Super Admin approves a department issue batch containing project manufactured products', async () => {
      const issues = [
        {
          id: 'issue-1', issueBatchId: 'issue-batch-1', productId: 'prod-mfg-1', departmentId: 'dept-1', unitId: 'unit-piece', batchId: null,
          quantity: new Prisma.Decimal(2), unitNameSnapshot: 'PIECE', baseQuantity: new Prisma.Decimal(2), notes: null,
          department: { id: 'dept-1', status: DepartmentStatus.ACTIVE },
          product: { id: 'prod-mfg-1', name: 'Chemical Reagent Kit', kind: ProductKind.MANUFACTURED_PRODUCT, projectId: 'project-123', status: ProductStatus.APPROVED },
        },
        {
          id: 'issue-2', issueBatchId: 'issue-batch-1', productId: 'prod-mfg-2', departmentId: 'dept-1', unitId: 'unit-piece', batchId: null,
          quantity: new Prisma.Decimal(1), unitNameSnapshot: 'PIECE', baseQuantity: new Prisma.Decimal(1), notes: null,
          department: { id: 'dept-1', status: DepartmentStatus.ACTIVE },
          product: { id: 'prod-mfg-2', name: 'Diagnostic Cartridge', kind: ProductKind.MANUFACTURED_PRODUCT, projectId: 'project-123', status: ProductStatus.APPROVED },
        },
      ];
      const batch = {
        id: 'issue-batch-1', projectId: 'project-123', createdById: 'ca-1',
        status: DepartmentIssueBatchStatus.PENDING_APPROVAL, issues,
      };

      mockPrisma.departmentIssueBatch.findUnique.mockResolvedValue(batch);
      mockPrisma.departmentIssueBatch.update.mockResolvedValue({
        ...batch, status: DepartmentIssueBatchStatus.APPROVED,
      });

      const result = await departmentsService.decideIssueBatch('issue-batch-1', true, undefined, superAdminUser);

      expect(result.status).toBe(DepartmentIssueBatchStatus.APPROVED);
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(expect.objectContaining({
        sourceRefType: 'DEPARTMENT_ISSUE_BATCH',
        lines: expect.arrayContaining([
          expect.objectContaining({ productId: 'prod-mfg-1', direction: 'OUT' }),
          expect.objectContaining({ productId: 'prod-mfg-2', direction: 'OUT' }),
        ]),
      }), superAdminUser.id, mockPrisma);
    });

    it('Super Admin approves a department issue batch containing company manufactured products', async () => {
      const issues = [
        {
          id: 'issue-1', issueBatchId: 'issue-batch-company', productId: 'prod-co-mfg-1', departmentId: 'dept-1', unitId: 'unit-piece', batchId: null,
          quantity: new Prisma.Decimal(2), unitNameSnapshot: 'PIECE', baseQuantity: new Prisma.Decimal(2), notes: null,
          department: { id: 'dept-1', status: DepartmentStatus.ACTIVE },
          product: { id: 'prod-co-mfg-1', name: 'ALT / SGPT Liquid Reagent 4x100ml', kind: ProductKind.MANUFACTURED_PRODUCT, ownerScope: CatalogScope.COMPANY, projectId: null, status: ProductStatus.APPROVED },
        },
      ];
      const batch = {
        id: 'issue-batch-company', projectId: 'project-123', createdById: 'ca-1',
        status: DepartmentIssueBatchStatus.PENDING_APPROVAL, issues,
      };

      mockPrisma.departmentIssueBatch.findUnique.mockResolvedValue(batch);
      mockPrisma.departmentIssueBatch.update.mockResolvedValue({
        ...batch, status: DepartmentIssueBatchStatus.APPROVED,
      });

      const result = await departmentsService.decideIssueBatch('issue-batch-company', true, undefined, superAdminUser);

      expect(result.status).toBe(DepartmentIssueBatchStatus.APPROVED);
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(expect.objectContaining({
        sourceRefType: 'DEPARTMENT_ISSUE_BATCH',
        lines: expect.arrayContaining([
          expect.objectContaining({ productId: 'prod-co-mfg-1', direction: 'OUT' }),
        ]),
      }), superAdminUser.id, mockPrisma);
    });
  });

  describe('1. Department Master CRUD and Approval Workflow', () => {
    it('Project Admin creates department with PENDING_APPROVAL status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ projectId: 'project-123' });
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project-123', name: 'Alpha Biotech' });
      mockPrisma.department.findUnique.mockResolvedValue(null);
      mockPrisma.department.create.mockResolvedValue({
        id: 'dept-1',
        projectId: 'project-123',
        name: 'Hematology Lab',
        status: DepartmentStatus.PENDING_APPROVAL,
      });

      const result = await departmentsService.createDepartment(
        { name: 'Hematology Lab' },
        projectAdminUser,
      );

      expect(result.status).toBe(DepartmentStatus.PENDING_APPROVAL);
      expect(mockPrisma.department.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'project-123',
            name: 'Hematology Lab',
            status: DepartmentStatus.PENDING_APPROVAL,
            createdById: 'ca-1',
          }),
        }),
      );
    });

    it('Super Admin creates department directly with ACTIVE status', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project-123', name: 'Alpha Biotech' });
      mockPrisma.department.findUnique.mockResolvedValue(null);
      mockPrisma.department.create.mockResolvedValue({
        id: 'dept-2',
        projectId: 'project-123',
        name: 'Serology Lab',
        status: DepartmentStatus.ACTIVE,
      });

      const result = await departmentsService.createDepartment(
        { name: 'Serology Lab', projectId: 'project-123' },
        superAdminUser,
      );

      expect(result.status).toBe(DepartmentStatus.ACTIVE);
      expect(mockPrisma.department.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DepartmentStatus.ACTIVE,
            approvedById: 'sa-1',
          }),
        }),
      );
    });

    it('prevents duplicate department names within the same project', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ projectId: 'project-123' });
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project-123' });
      mockPrisma.department.findUnique.mockResolvedValue({ id: 'dept-existing', name: 'Hematology Lab' });

      await expect(
        departmentsService.createDepartment({ name: 'Hematology Lab' }, projectAdminUser),
      ).rejects.toThrow(ConflictException);
    });

    it('forbids Store Admin from managing departments', async () => {
      await expect(
        departmentsService.createDepartment({ name: 'Hematology Lab' }, storeAdminUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Project Admin proposals are approved by Super Admin and activated', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 'dept-1',
        projectId: 'project-123',
        name: 'Hematology Lab',
        status: DepartmentStatus.PENDING_APPROVAL,
        proposedName: null,
        proposedStatus: null,
      });

      mockPrisma.department.update.mockResolvedValue({
        id: 'dept-1',
        name: 'Hematology Lab',
        status: DepartmentStatus.ACTIVE,
        approvedById: 'sa-1',
      });

      const approved = await departmentsService.approveDepartment('dept-1', {}, superAdminUser);
      expect(approved.status).toBe(DepartmentStatus.ACTIVE);
      expect(mockPrisma.department.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DepartmentStatus.ACTIVE,
            approvedById: 'sa-1',
          }),
        }),
      );
    });
  });

  describe('2. Department Issues (Test Plan 15: Department issue reduces central project stock only after approval; no department balance is created)', () => {
    it('creates a department issue request with conversion ratio snapshot and pre-checks stock', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 'dept-1',
        projectId: 'project-123',
        name: 'Hematology Lab',
        status: DepartmentStatus.ACTIVE,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ projectId: 'project-123' });
      mockPrisma.product.findUnique.mockResolvedValue(testProduct);
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        usableQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(20),
        // Available: 80 pieces
      });

      mockPrisma.departmentIssue.create.mockResolvedValue({
        id: 'issue-1',
        departmentId: 'dept-1',
        productId: 'prod-1',
        quantity: new Prisma.Decimal(5),
        unitNameSnapshot: 'BOX',
        conversionToBaseSnapshot: new Prisma.Decimal(10),
        baseQuantity: new Prisma.Decimal(50),
        status: DepartmentIssueStatus.PENDING_APPROVAL,
      });

      const issue = await departmentsService.createIssue(
        {
          departmentId: 'dept-1',
          productId: 'prod-1',
          quantity: 5,
          unitName: 'BOX',
        },
        projectAdminUser,
      );

      expect(issue.status).toBe(DepartmentIssueStatus.PENDING_APPROVAL);
      expect(mockPrisma.departmentIssue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantity: new Prisma.Decimal(5),
            unitNameSnapshot: 'BOX',
            conversionToBaseSnapshot: new Prisma.Decimal(10),
            baseQuantity: new Prisma.Decimal(50),
            status: DepartmentIssueStatus.PENDING_APPROVAL,
          }),
        }),
      );
    });

    it('rejects department issue when available stock is insufficient', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 'dept-1',
        projectId: 'project-123',
        name: 'Hematology Lab',
        status: DepartmentStatus.ACTIVE,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ projectId: 'project-123' });
      mockPrisma.product.findUnique.mockResolvedValue(testProduct);
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        usableQty: new Prisma.Decimal(40),
        reservedQty: new Prisma.Decimal(0),
        // Available: 40 pieces, but 5 boxes = 50 pieces requested
      });

      await expect(
        departmentsService.createIssue(
          {
            departmentId: 'dept-1',
            productId: 'prod-1',
            quantity: 5,
            unitName: 'BOX',
          },
          projectAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects issue to an INACTIVE department', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 'dept-inactive',
        projectId: 'project-123',
        name: 'Closed Unit',
        status: DepartmentStatus.INACTIVE,
      });

      await expect(
        departmentsService.createIssue(
          {
            departmentId: 'dept-inactive',
            productId: 'prod-1',
            quantity: 1,
            unitName: 'BOX',
          },
          projectAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Super Admin approval posts stock deduction to central project stock; NO department balance is created', async () => {
      mockPrisma.departmentIssue.findUnique.mockResolvedValue({
        id: 'issue-1',
        projectId: 'project-123',
        departmentId: 'dept-1',
        productId: 'prod-1',
        quantity: new Prisma.Decimal(5),
        unitNameSnapshot: 'BOX',
        baseQuantity: new Prisma.Decimal(50),
        status: DepartmentIssueStatus.PENDING_APPROVAL,
        department: { name: 'Hematology Lab' },
        product: {
          projectId: 'project-123',
          name: 'Lab Diagnostic Cartridge',
          kind: ProductKind.MANUFACTURED_PRODUCT,
          status: ProductStatus.APPROVED,
        },
      });

      mockPrisma.departmentIssue.update.mockResolvedValue({
        id: 'issue-1',
        status: DepartmentIssueStatus.APPROVED,
      });

      const result = await departmentsService.approveIssue(
        'issue-1',
        { idempotencyKey: 'idem-issue-1' },
        superAdminUser,
      );

      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.STOCK_OUT,
          sourceRefType: 'DEPARTMENT_ISSUE',
          sourceRefId: 'issue-1',
          idempotencyKey: 'idem-issue-1',
          lines: [
            expect.objectContaining({
              locationId: 'loc-project-1',
              productId: 'prod-1',
              quantity: 5,
              unitName: 'BOX',
              condition: StockCondition.USABLE,
              direction: 'OUT',
            }),
          ],
        }),
        'sa-1',
        expect.anything(),
      );

      // Invariant verification: Ledger deducted project stock; status updated; no department balance table accessed
      expect(mockPrisma.departmentIssue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'issue-1' },
          data: expect.objectContaining({
            status: DepartmentIssueStatus.APPROVED,
            approvedById: 'sa-1',
          }),
        }),
      );
    });

    it('Super Admin approval rejects issue if product is a raw material', async () => {
      mockPrisma.departmentIssue.findUnique.mockResolvedValue({
        id: 'issue-rm-1',
        projectId: 'project-123',
        departmentId: 'dept-1',
        productId: 'prod-rm',
        quantity: new Prisma.Decimal(10),
        unitNameSnapshot: 'PIECE',
        baseQuantity: new Prisma.Decimal(10),
        status: DepartmentIssueStatus.PENDING_APPROVAL,
        department: { name: 'Biochemistry Lab' },
        product: {
          projectId: null,
          ownerScope: CatalogScope.COMPANY,
          name: 'Chemical Reagent',
          kind: ProductKind.RAW_MATERIAL,
          status: ProductStatus.APPROVED,
        },
      });

      await expect(
        departmentsService.approveIssue(
          'issue-rm-1',
          { idempotencyKey: 'idem-issue-rm-1' },
          superAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Department Returns (usable returns restore central stock)', () => {
    it('creates a usable department return', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ projectId: 'project-123' });
      mockPrisma.product.findUnique.mockResolvedValue(testProduct);
      mockPrisma.departmentReturn.create.mockResolvedValue({
        id: 'ret-1',
        reason: 'Broken vial seals in lab storage',
        status: DepartmentReturnStatus.PENDING_APPROVAL,
      });

      const ret = await departmentsService.createReturn(
        {
          productId: 'prod-1',
          quantity: 2,
          unitName: 'BOX',
          reason: 'Broken vial seals in lab storage',
        },
        projectAdminUser,
      );

      expect(ret.status).toBe(DepartmentReturnStatus.PENDING_APPROVAL);
      expect(mockPrisma.departmentReturn.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: 'Broken vial seals in lab storage',
            status: DepartmentReturnStatus.PENDING_APPROVAL,
            baseQuantity: new Prisma.Decimal(20),
          }),
        }),
      );
    });

    it('Super Admin approval of USABLE return credits project usable stock', async () => {
      mockPrisma.departmentReturn.findUnique.mockResolvedValue({
        id: 'ret-usable',
        projectId: 'project-123',
        productId: 'prod-1',
        quantity: new Prisma.Decimal(1),
        unitNameSnapshot: 'BOX',
        condition: StockCondition.USABLE,
        reason: 'Surplus unopened stock',
        status: DepartmentReturnStatus.PENDING_APPROVAL,
        department: { name: 'Hematology Lab' },
      });

      mockPrisma.departmentReturn.update.mockResolvedValue({
        id: 'ret-usable',
        status: DepartmentReturnStatus.APPROVED,
      });

      await departmentsService.approveReturn(
        'ret-usable',
        { idempotencyKey: 'idem-ret-usable' },
        superAdminUser,
      );

      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.STOCK_IN,
          sourceRefType: 'DEPARTMENT_RETURN',
          lines: [
            expect.objectContaining({
              condition: StockCondition.USABLE,
              direction: 'IN',
              quantity: 1,
            }),
          ],
        }),
        'sa-1',
        expect.anything(),
      );
    });

  });
});
