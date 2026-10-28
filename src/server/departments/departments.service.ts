import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../inventory/ledger.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UserRole,
  DepartmentStatus,
  DepartmentIssueStatus,
  DepartmentIssueBatchStatus,
  DepartmentReturnStatus,
  ProductStatus,
  ProductKind,
  CatalogScope,
  StockCondition,
  TransactionType,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import {
  ApproveDepartmentDto,
  RejectDepartmentDto,
} from './dto/decide-department.dto';
import { CreateDepartmentIssueDto } from './dto/create-department-issue.dto';
import { CreateDepartmentReturnDto } from './dto/create-department-return.dto';
import {
  ApproveDepartmentActionDto,
  RejectDepartmentActionDto,
} from './dto/decide-department-request.dto';
import { SaveDepartmentIssueBatchDto } from './dto/save-department-issue-batch.dto';
import { ReservationsService } from '../requests/reservations.service';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly inventoryService: InventoryService,
    private readonly notificationsService: NotificationsService,
    private readonly reservationsService: ReservationsService,
  ) {}

  private async getProjectForUser(user: AuthenticatedUser): Promise<string | null> {
    if (user.role === UserRole.PROJECT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      return dbUser?.projectId ?? null;
    }
    return null;
  }

  // ==========================================
  // DEPARTMENT MASTER
  // ==========================================

  async createDepartment(dto: CreateDepartmentDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin is not authorized to manage departments');
    }

    const userProjectId = await this.getProjectForUser(user);
    const projectId = user.role === UserRole.PROJECT_ADMIN ? userProjectId : dto.projectId;

    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }

    if (user.role === UserRole.PROJECT_ADMIN && projectId !== userProjectId) {
      throw new ForbiddenException('Project Admin can only manage departments for their own organization');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const existing = await this.prisma.department.findUnique({
      where: {
        projectId_name: {
          projectId,
          name: dto.name.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Department "${dto.name}" already exists for this project`);
    }

    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    const created = await this.prisma.department.create({
      data: {
        projectId,
        name: dto.name.trim(),
        status: isSuperAdmin ? DepartmentStatus.ACTIVE : DepartmentStatus.PENDING_APPROVAL,
        createdById: user.id,
        approvedById: isSuperAdmin ? user.id : null,
        approvedAt: isSuperAdmin ? new Date() : null,
      },
    });
    if (!isSuperAdmin) {
      await this.notificationsService.notifySuperAdmins(
        'Department awaiting approval',
        'A project proposed a new department for review.',
        'DEPARTMENT',
        created.id,
      );
    }
    return created;
  }

  async getDepartments(projectId?: string, user?: AuthenticatedUser) {
    if (user?.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin is not authorized to view departments');
    }

    const userProjectId = user ? await this.getProjectForUser(user) : null;
    const effectiveProjectId =
      user?.role === UserRole.PROJECT_ADMIN ? userProjectId : projectId;

    return this.prisma.department.findMany({
      where: effectiveProjectId ? { projectId: effectiveProjectId } : {},
      orderBy: { name: 'asc' },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, username: true, role: true } },
        approvedBy: { select: { id: true, username: true, role: true } },
      },
    });
  }

  async getDepartment(id: string, user?: AuthenticatedUser) {
    if (user?.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin is not authorized to view departments');
    }

    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, username: true, role: true } },
        approvedBy: { select: { id: true, username: true, role: true } },
      },
    });

    if (!dept) {
      throw new NotFoundException(`Department ${id} not found`);
    }

    if (user?.role === UserRole.PROJECT_ADMIN) {
      const userProjectId = await this.getProjectForUser(user);
      if (dept.projectId !== userProjectId) {
        throw new ForbiddenException('Access denied to other project departments');
      }
    }

    return dept;
  }

  async updateDepartment(
    id: string,
    dto: UpdateDepartmentDto,
    user: AuthenticatedUser,
  ) {
    const dept = await this.getDepartment(id, user);

    if (user.role === UserRole.SUPER_ADMIN) {
      // Super Admin can update directly
      if (dto.name && dto.name.trim() !== dept.name) {
        const existing = await this.prisma.department.findUnique({
          where: {
            projectId_name: {
              projectId: dept.projectId,
              name: dto.name.trim(),
            },
          },
        });
        if (existing && existing.id !== dept.id) {
          throw new ConflictException(`Department name "${dto.name}" is already taken`);
        }
      }

      return this.prisma.department.update({
        where: { id },
        data: {
          name: dto.name ? dto.name.trim() : dept.name,
          status: dto.status ?? dept.status,
          proposedName: null,
          proposedStatus: null,
        },
      });
    }

    if (user.role === UserRole.PROJECT_ADMIN) {
      // Project Admin proposes changes requiring Super Admin approval
      return this.prisma.department.update({
        where: { id },
        data: {
          proposedName: dto.name ? dto.name.trim() : dept.proposedName,
          proposedStatus: dto.status ?? dept.proposedStatus,
        },
      });
    }

    throw new ForbiddenException('Not authorized');
  }

  async approveDepartment(
    id: string,
    dto: ApproveDepartmentDto,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve departments');
    }

    const dept = await this.getDepartment(id);

    const finalName = dept.proposedName ?? dept.name;
    const finalStatus =
      dept.status === DepartmentStatus.PENDING_APPROVAL
        ? DepartmentStatus.ACTIVE
        : (dept.proposedStatus ?? dept.status);

    const approved = await this.prisma.department.update({
      where: { id },
      data: {
        name: finalName,
        status: finalStatus,
        proposedName: null,
        proposedStatus: null,
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });
    await this.notificationsService.notifyUser(
      dept.createdById,
      'Department approved',
      `Your department “${finalName}” was approved.`,
      'DEPARTMENT',
      dept.id,
    );
    return approved;
  }

  async rejectDepartment(
    id: string,
    dto: RejectDepartmentDto,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can reject departments');
    }

    const dept = await this.getDepartment(id);

    if (dept.status === DepartmentStatus.PENDING_APPROVAL) {
      const rejected = await this.prisma.department.update({
        where: { id },
        data: {
          status: DepartmentStatus.INACTIVE,
          proposedName: null,
          proposedStatus: null,
        },
      });
      await this.notificationsService.notifyUser(
        dept.createdById,
        'Department rejected',
        `Your department proposal “${dept.name}” was rejected. ${dto.reason || ''}`.trim(),
        'DEPARTMENT',
        dept.id,
      );
      return rejected;
    }

    // Clear proposed changes
    return this.prisma.department.update({
      where: { id },
      data: {
        proposedName: null,
        proposedStatus: null,
      },
    });
  }

  // ==========================================
  // DEPARTMENT ISSUES
  // ==========================================

  async getOpenIssueBatch(user: AuthenticatedUser, targetProjectId?: string) {
    if (user.role !== UserRole.PROJECT_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Project Admins or Super Admin can manage a daily department issue draft');
    }
    const projectId = user.role === UserRole.SUPER_ADMIN
      ? (targetProjectId || (await this.prisma.project.findFirst({ where: { status: 'ACTIVE' } }))?.id || null)
      : await this.getProjectForUser(user);
    if (!projectId) throw new ForbiddenException('Project account is not assigned to an organization');
    const include = { issues: { include: { department: true, product: true, unit: true, batch: true }, orderBy: { createdAt: 'asc' as const } } };
    const existing = await this.prisma.departmentIssueBatch.findFirst({
      where: { projectId, status: DepartmentIssueBatchStatus.DRAFT }, include,
    });
    if (existing) return existing;
    try {
      return await this.prisma.departmentIssueBatch.create({
        data: { projectId, createdById: user.id }, include,
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      return this.prisma.departmentIssueBatch.findFirst({
        where: { projectId, status: DepartmentIssueBatchStatus.DRAFT }, include,
      });
    }
  }

  async saveIssueBatchLines(batchId: string, dto: SaveDepartmentIssueBatchDto, user: AuthenticatedUser) {
    const batch = await this.getIssueBatch(batchId, user);
    if (user.role !== UserRole.PROJECT_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Project Admins or Super Admin can edit this draft');
    }
    if (user.role === UserRole.PROJECT_ADMIN && batch.createdById !== user.id) {
      throw new ForbiddenException('Only the Project Admin who owns this draft can edit it');
    }
    if (batch.status !== DepartmentIssueBatchStatus.DRAFT) {
      throw new ConflictException('Only the open daily draft can be edited');
    }
    const prepared = await Promise.all(dto.issues.map((line) => this.prepareIssueLine(line, user, batch.projectId)));
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM department_issue_batches WHERE id = ${batch.id} FOR UPDATE`;
      const current = await tx.departmentIssueBatch.findUnique({ where: { id: batch.id } });
      if (!current || current.status !== DepartmentIssueBatchStatus.DRAFT) {
        throw new ConflictException('The department issue draft has already been submitted');
      }
      await tx.departmentIssue.deleteMany({ where: { issueBatchId: batch.id } });
      for (const line of prepared) {
        await tx.departmentIssue.create({ data: { ...line, issueBatchId: batch.id, status: DepartmentIssueStatus.DRAFT } });
      }
      return tx.departmentIssueBatch.findUnique({ where: { id: batch.id }, include: { issues: { include: { department: true, product: true, unit: true, issueBatch: true }, orderBy: { createdAt: 'asc' } } } });
    });
  }

  async getIssueBatch(batchId: string, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) throw new ForbiddenException('Store Admin cannot view department issue drafts');
    const batch = await this.prisma.departmentIssueBatch.findUnique({
      where: { id: batchId },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, username: true, role: true } },
        issues: { include: { department: true, product: true, unit: true, issueBatch: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!batch) throw new NotFoundException(`Department issue batch ${batchId} not found`);
    if (user.role === UserRole.PROJECT_ADMIN && batch.projectId !== await this.getProjectForUser(user)) {
      throw new ForbiddenException('Access denied to another project department issue batch');
    }
    return batch;
  }

  async getIssueBatches(status: DepartmentIssueBatchStatus | undefined, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) throw new ForbiddenException('Store Admin cannot view department issue batches');
    const projectId = user.role === UserRole.PROJECT_ADMIN ? await this.getProjectForUser(user) : undefined;
    return this.prisma.departmentIssueBatch.findMany({
      where: { ...(projectId ? { projectId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, username: true, role: true } },
        issues: { include: { department: true, product: true, unit: true, issueBatch: true }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async submitIssueBatch(batchId: string, user: AuthenticatedUser) {
    const batch = (await this.getIssueBatch(batchId, user)) as any;
    if (user.role !== UserRole.PROJECT_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Project Admins or Super Admin can submit this draft');
    }
    if (user.role === UserRole.PROJECT_ADMIN && batch.createdById !== user.id) {
      throw new ForbiddenException('Only the Project Admin who owns this draft can submit it');
    }
    if (batch.status !== DepartmentIssueBatchStatus.DRAFT) throw new ConflictException('This draft has already been submitted');
    if (!batch.issues.length) throw new BadRequestException('Add at least one department issue before submitting');
    const revalidated = await Promise.all((batch.issues as any[]).map((line: any) => this.prepareIssueLine({
      departmentId: line.departmentId,
      indentNumber: line.indentNumber,
      productId: line.productId,
      requestedQuantity: line.requestedQuantity ? Number(line.requestedQuantity) : undefined,
      quantity: line.quantity.toNumber(),
      unitId: line.unitId,
      notes: line.notes ?? undefined,
    }, user, batch.projectId)));
    if (revalidated.some((line: any, index: number) => !line.baseQuantity.equals((batch.issues as any[])[index].baseQuantity))) {
      throw new ConflictException('A product unit conversion changed. Edit the affected draft line before submitting.');
    }
    const requirements = (await this.notificationsService.getSettings()).approvalRequirements;
    const requiresApproval = requirements.departmentIssue;
    const location = await this.inventoryService.getOrCreateLocationForProject(batch.projectId);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM department_issue_batches WHERE id = ${batch.id} FOR UPDATE`;
      const freshBatch = await tx.departmentIssueBatch.findUnique({ where: { id: batch.id }, include: { issues: true } });
      if (!freshBatch || freshBatch.status !== DepartmentIssueBatchStatus.DRAFT) throw new ConflictException('This draft has already been submitted');
      if (!freshBatch.issues.length) throw new BadRequestException('Add at least one department issue before submitting');
      await this.reservationsService.reserveDepartmentIssues(tx, location.id, freshBatch.issues);
      await tx.departmentIssue.updateMany({
        where: { issueBatchId: batch.id }, data: { status: DepartmentIssueStatus.PENDING_APPROVAL },
      });
      if (requiresApproval) {
        return tx.departmentIssueBatch.update({
          where: { id: batch.id }, data: { status: DepartmentIssueBatchStatus.PENDING_APPROVAL, submittedAt: new Date() },
          include: { issues: { include: { department: true, product: true, unit: true, issueBatch: true } } },
        });
      }
      await this.reservationsService.consumeReservationsForDepartmentIssueBatch(tx, batch.id);
      await this.ledgerService.postTransaction({
        transactionType: TransactionType.STOCK_OUT,
        sourceRefType: 'DEPARTMENT_ISSUE_BATCH', sourceRefId: batch.id,
        idempotencyKey: `department-issue-batch-${batch.id}`,
        lines: freshBatch.issues.map((issue) => ({
          locationId: location.id, productId: issue.productId,
          quantity: issue.quantity.toNumber(), unitName: issue.unitNameSnapshot,
          condition: StockCondition.USABLE, direction: 'OUT' as const,
        })),
      }, user.id, tx);
      await tx.auditEvent.create({ data: {
        actorUserId: user.id,
        action: 'DEPARTMENT_ISSUE_BATCH_AUTO_POSTED',
        entityType: 'DEPARTMENT_ISSUE_BATCH',
        entityId: batch.id,
        reason: 'Super Admin approval settings allow immediate posting for department issues.',
      } });
      await tx.departmentIssue.updateMany({
        where: { issueBatchId: batch.id }, data: { status: DepartmentIssueStatus.POSTED, issuedAt: new Date() },
      });
      return tx.departmentIssueBatch.update({
        where: { id: batch.id }, data: { status: DepartmentIssueBatchStatus.POSTED, submittedAt: new Date() },
        include: { issues: { include: { department: true, product: true, unit: true, issueBatch: true } } },
      });
    }, { maxWait: 10000, timeout: 30000 });

    if (requiresApproval) {
      await this.notificationsService.notifySuperAdmins('Department issue batch awaiting approval', 'A project submitted a daily department issue batch.', 'DEPARTMENT_ISSUE_BATCH', batch.id);
    } else {
      await this.notificationsService.notifyUser(user.id, 'Department issue batch posted', 'The department issue batch was validated and posted to inventory.', 'DEPARTMENT_ISSUE_BATCH', batch.id);
    }
    return result;
  }

  async decideIssueBatch(batchId: string, approve: boolean, reason: string | undefined, user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Only Super Admin can decide department issue batches');
    const batch = await this.getIssueBatch(batchId, user);
    if (batch.status !== DepartmentIssueBatchStatus.PENDING_APPROVAL) {
      if (approve && (batch.status === DepartmentIssueBatchStatus.APPROVED || batch.status === DepartmentIssueBatchStatus.POSTED)) return batch;
      throw new ConflictException(`Department issue batch is not pending approval (current status: ${batch.status})`);
    }
    const location = await this.inventoryService.getOrCreateLocationForProject(batch.projectId);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM department_issue_batches WHERE id = ${batch.id} FOR UPDATE`;
      const fresh = await tx.departmentIssueBatch.findUnique({ where: { id: batch.id }, include: { issues: { include: { product: true, department: true } } } });
      if (!fresh || fresh.status !== DepartmentIssueBatchStatus.PENDING_APPROVAL) throw new ConflictException('Department issue batch has already been decided');
      if (!approve) {
        await this.reservationsService.releaseReservationsForDepartmentIssueBatch(tx, batch.id);
        await tx.departmentIssue.updateMany({ where: { issueBatchId: batch.id }, data: { status: DepartmentIssueStatus.REJECTED, rejectionReason: reason!.trim(), approvedById: user.id } });
        await tx.auditEvent.create({ data: {
          actorUserId: user.id,
          action: 'DEPARTMENT_ISSUE_BATCH_REJECTED',
          entityType: 'DEPARTMENT_ISSUE_BATCH',
          entityId: batch.id,
          reason: reason!.trim(),
        } });
        return tx.departmentIssueBatch.update({ where: { id: batch.id }, data: { status: DepartmentIssueBatchStatus.REJECTED, rejectionReason: reason!.trim(), approvedById: user.id, approvedAt: new Date() }, include: { issues: true } });
      }
      for (const issue of fresh.issues) {
        const isBelonging =
          (issue.product.ownerScope === CatalogScope.COMPANY && !issue.product.projectId) ||
          issue.product.projectId === batch.projectId;
        if (
          issue.department.status !== DepartmentStatus.ACTIVE ||
          issue.product.status !== ProductStatus.APPROVED ||
          issue.product.kind !== ProductKind.MANUFACTURED_PRODUCT ||
          !isBelonging
        ) {
          throw new BadRequestException('Every batch line must still reference an active department and an approved manufactured product belonging to your organization');
        }
      }
      await this.reservationsService.consumeReservationsForDepartmentIssueBatch(tx, batch.id);
      await this.ledgerService.postTransaction({
        transactionType: TransactionType.STOCK_OUT,
        sourceRefType: 'DEPARTMENT_ISSUE_BATCH', sourceRefId: batch.id,
        idempotencyKey: `department-issue-batch-${batch.id}`,
        lines: fresh.issues.map((issue) => ({ locationId: location.id, productId: issue.productId, quantity: issue.quantity.toNumber(), unitName: issue.unitNameSnapshot, condition: StockCondition.USABLE, direction: 'OUT' as const })),
      }, user.id, tx);
      await tx.departmentIssue.updateMany({ where: { issueBatchId: batch.id }, data: { status: DepartmentIssueStatus.APPROVED, approvedById: user.id, issuedAt: new Date() } });
      await tx.auditEvent.create({ data: {
        actorUserId: user.id,
        action: 'DEPARTMENT_ISSUE_BATCH_APPROVED',
        entityType: 'DEPARTMENT_ISSUE_BATCH',
        entityId: batch.id,
      } });
      return tx.departmentIssueBatch.update({ where: { id: batch.id }, data: { status: DepartmentIssueBatchStatus.APPROVED, approvedById: user.id, approvedAt: new Date() }, include: { issues: true } });
    }, { maxWait: 10000, timeout: 30000 });
    await this.notificationsService.notifyUser(batch.createdById, approve ? 'Department issue batch approved' : 'Department issue batch rejected', approve ? 'Your department issue batch was approved and inventory was updated.' : `Your department issue batch was rejected. ${reason ?? ''}`.trim(), 'DEPARTMENT_ISSUE_BATCH', batch.id);
    return result;
  }

  private async prepareIssueLine(dto: CreateDepartmentIssueDto, user: AuthenticatedUser, projectId: string) {
    const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!department || department.projectId !== projectId || department.status !== DepartmentStatus.ACTIVE) {
      throw new BadRequestException('Each issue must select an active department belonging to your organization');
    }
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId }, include: { units: true } });
    const isBelonging = product && (
      (product.ownerScope === CatalogScope.COMPANY && !product.projectId) ||
      product.projectId === projectId
    );
    if (!product || product.status !== ProductStatus.APPROVED || product.kind !== ProductKind.MANUFACTURED_PRODUCT || !isBelonging) {
      throw new BadRequestException('Each issue must select an approved manufactured product belonging to your organization');
    }
    const unit = product.units.find((candidate) => candidate.status === 'ACTIVE' && (
      (dto.unitId && candidate.id === dto.unitId) ||
      (!dto.unitId && dto.unitName && candidate.unitName.toLowerCase() === dto.unitName.trim().toLowerCase()) ||
      (!dto.unitId && !dto.unitName && candidate.isBaseUnit)
    ));
    if (!unit) throw new NotFoundException(`Active unit not found for product ${product.name}`);
    const quantity = new Prisma.Decimal(dto.quantity);
    const conversion = new Prisma.Decimal(unit.conversionToBase);
    const baseQuantity = quantity.mul(conversion);
    if (product.quantityPrecision === 0 && !baseQuantity.isInteger()) throw new BadRequestException(`Product "${product.name}" requires whole units`);
    const indentNumber = dto.indentNumber?.trim() || 'N/A';
    const requestedQuantity = dto.requestedQuantity !== undefined && dto.requestedQuantity !== null
      ? new Prisma.Decimal(dto.requestedQuantity)
      : quantity;
    return {
      projectId, departmentId: department.id, indentNumber, productId: product.id,
      requestedQuantity, quantity, unitId: unit.id, unitNameSnapshot: unit.unitName,
      conversionToBaseSnapshot: conversion, baseQuantity, notes: dto.notes?.trim() || null,
      issuedById: user.id,
    };
  }

  async createIssue(dto: CreateDepartmentIssueDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin is not authorized to submit department issues');
    }

    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });

    if (!department) {
      throw new NotFoundException(`Department ${dto.departmentId} not found`);
    }

    if (department.status !== DepartmentStatus.ACTIVE) {
      throw new BadRequestException(
        `Department "${department.name}" is not ACTIVE (status: ${department.status}). Cannot issue to inactive department.`,
      );
    }

    const userProjectId = await this.getProjectForUser(user);
    if (user.role === UserRole.PROJECT_ADMIN && department.projectId !== userProjectId) {
      throw new ForbiddenException('Department does not belong to your project');
    }

    const projectId = department.projectId;

    // Validate product
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { units: true },
    });

    if (!product) {
      throw new NotFoundException('Selected product not found');
    }

    if (product.status !== ProductStatus.APPROVED) {
      throw new BadRequestException(
        `Product "${product.name}" is not approved (status: ${product.status})`,
      );
    }
    const isBelonging =
      (product.ownerScope === CatalogScope.COMPANY && !product.projectId) ||
      product.projectId === projectId;
    if (product.kind !== ProductKind.MANUFACTURED_PRODUCT || !isBelonging) {
      throw new BadRequestException(`Department issues can only use manufactured products; "${product.name}" is not an approved manufactured product belonging to your organization`);
    }

    // Resolve unit
    let unit = null;
    if (dto.unitId) {
      unit = product.units.find((u) => u.id === dto.unitId && u.status === 'ACTIVE');
    } else if (dto.unitName) {
      unit = product.units.find(
        (u) => u.unitName.toLowerCase() === dto.unitName!.trim().toLowerCase() && u.status === 'ACTIVE',
      );
    } else {
      unit = product.units.find((u) => u.isBaseUnit && u.status === 'ACTIVE');
    }

    if (!unit) {
      throw new NotFoundException(
        `Active unit "${dto.unitId || dto.unitName || 'base'}" not found for product ${product.name}`,
      );
    }

    const originalQtyDec = new Prisma.Decimal(dto.quantity);
    const conversionSnapshot = new Prisma.Decimal(unit.conversionToBase);
    const baseQuantity = originalQtyDec.mul(conversionSnapshot);

    if (product.quantityPrecision === 0 && !baseQuantity.isInteger()) {
      throw new BadRequestException(
        `Product "${product.name}" requires integer whole units. Base quantity ${baseQuantity} is fractional.`,
      );
    }


    // Verify stock availability at project location
    const projectLocation = await this.inventoryService.getOrCreateLocationForProject(projectId);
    const balance = await this.prisma.inventoryBalance.findFirst({
      where: {
        locationId: projectLocation.id,
        productId: product.id,
      },
    });

    const available = balance
      ? balance.usableQty.minus(balance.reservedQty)
      : new Prisma.Decimal(0);

    if (available.lt(baseQuantity)) {
      throw new BadRequestException(
        `Insufficient available usable stock for product "${product.name}". Available: ${available}, Requested: ${baseQuantity}`,
      );
    }

    const indentNumber = dto.indentNumber?.trim() || 'N/A';
    const requestedQuantity = dto.requestedQuantity !== undefined && dto.requestedQuantity !== null
      ? new Prisma.Decimal(dto.requestedQuantity)
      : originalQtyDec;

    const issue = await this.prisma.departmentIssue.create({
      data: {
        projectId,
        departmentId: department.id,
        indentNumber,
        productId: product.id,
        requestedQuantity,
        quantity: originalQtyDec,
        unitId: unit.id,
        unitNameSnapshot: unit.unitName,
        conversionToBaseSnapshot: conversionSnapshot,
        baseQuantity,
        status: DepartmentIssueStatus.PENDING_APPROVAL,
        notes: dto.notes?.trim() || null,
        issuedById: user.id,
      },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
      },
    });
    const requiresApproval = (await this.notificationsService.getSettings?.())?.approvalRequirements?.departmentIssue ?? true;
    if (!requiresApproval) return this.approveIssue(issue.id, {}, user, true);
    await this.notificationsService.notifySuperAdmins('Department issue awaiting approval', 'A project requested manufactured stock for a department.', 'DEPARTMENT_ISSUE', issue.id);
    return issue;
  }

  async getIssues(
    query: {
      projectId?: string;
      departmentId?: string;
      status?: DepartmentIssueStatus;
    },
    user: AuthenticatedUser,
  ) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot view department issues');
    }

    const userProjectId = await this.getProjectForUser(user);
    const effectiveProjectId =
      user.role === UserRole.PROJECT_ADMIN ? userProjectId : query.projectId;

    const where: Prisma.DepartmentIssueWhereInput = {};
    if (!query.status) where.status = { not: DepartmentIssueStatus.DRAFT };
    if (effectiveProjectId) where.projectId = effectiveProjectId;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.status) {
      where.status = query.status;
      if (query.status === DepartmentIssueStatus.PENDING_APPROVAL) where.issueBatchId = null;
    }

    const issues = await this.prisma.departmentIssue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
        issuedBy: { select: { id: true, username: true, role: true } },
        approvedBy: { select: { id: true, username: true, role: true } },
      },
    });

    return issues.map((i) => ({
      ...i,
      issueNumber: `ISSUE-${i.id.slice(0, 8).toUpperCase()}`,
      departmentName: i.department?.name || 'Department',
      productName: i.product?.name || 'Product',
      unitName: i.unit?.unitName || i.unitNameSnapshot || 'units',
    }));
  }

  async getIssue(id: string, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot view department issues');
    }

    const issue = await this.prisma.departmentIssue.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
        issuedBy: { select: { id: true, username: true, role: true } },
        approvedBy: { select: { id: true, username: true, role: true } },
        returns: true,
      },
    });

    if (!issue) {
      throw new NotFoundException(`Department issue ${id} not found`);
    }

    if (user.role === UserRole.PROJECT_ADMIN) {
      const userProjectId = await this.getProjectForUser(user);
      if (issue.projectId !== userProjectId) {
        throw new ForbiddenException('Access denied to other project department issues');
      }
    }

    return issue;
  }

  async approveIssue(
    id: string,
    dto: ApproveDepartmentActionDto,
    user: AuthenticatedUser,
    automated = false,
  ) {
    if (!automated && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve department issues');
    }

    const issue = await this.prisma.departmentIssue.findUnique({
      where: { id },
      include: { department: true, product: true },
    });

    if (!issue) {
      throw new NotFoundException(`Department issue ${id} not found`);
    }

    if (issue.status === DepartmentIssueStatus.APPROVED || issue.status === DepartmentIssueStatus.POSTED) return issue;
    if (issue.status !== DepartmentIssueStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Department issue is not pending approval (current status: ${issue.status})`,
      );
    }
    const isBelonging =
      (issue.product.ownerScope === CatalogScope.COMPANY && !issue.product.projectId) ||
      issue.product.projectId === issue.projectId;
    if (
      issue.product.kind !== ProductKind.MANUFACTURED_PRODUCT ||
      !isBelonging ||
      issue.product.status !== ProductStatus.APPROVED
    ) {
      throw new BadRequestException('Department issue product must remain an approved manufactured product belonging to your organization');
    }

    const projectLocation = await this.inventoryService.getOrCreateLocationForProject(issue.projectId);

    // Atomic transaction: deduct central project usable stock and update issue status in single transaction
    const approved = await this.prisma.$transaction(async (tx) => {
      // 1. Post ledger transaction for stock out from project central stock
      await this.ledgerService.postTransaction(
        {
          transactionType: TransactionType.STOCK_OUT,
          sourceRefType: 'DEPARTMENT_ISSUE',
          sourceRefId: issue.id,
          idempotencyKey: dto.idempotencyKey ?? `dept-issue-approve-${issue.id}`,
          lines: [
            {
              locationId: projectLocation.id,
              productId: issue.productId,
              quantity: issue.quantity.toNumber(),
              unitName: issue.unitNameSnapshot,
              condition: StockCondition.USABLE,
              direction: 'OUT',
            },
          ],
        },
        user.id,
        tx,
      );

      if (automated) {
        await tx.auditEvent.create({ data: {
          actorUserId: user.id,
          action: 'DEPARTMENT_ISSUE_AUTO_POSTED',
          entityType: 'DEPARTMENT_ISSUE',
          entityId: issue.id,
          reason: 'Super Admin approval settings allow immediate posting for department issues.',
        } });
      }

      // Invariant: No department stock balance is created! Department tracking is issue/return history only.
      return tx.departmentIssue.update({
        where: { id: issue.id },
        data: {
          status: automated ? DepartmentIssueStatus.POSTED : DepartmentIssueStatus.APPROVED,
          approvedById: automated ? null : user.id,
          issuedAt: new Date(),
        },
        include: {
          department: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
          unit: { select: { id: true, unitName: true } },
        },
      });
    });
    await this.notificationsService.notifyUser(
      issue.issuedById,
      automated ? 'Department issue posted' : 'Department issue approved',
      automated ? 'Your department stock issue was posted to inventory.' : 'Your department stock issue was approved and inventory was updated.',
      'DEPARTMENT_ISSUE',
      issue.id,
    );
    return approved;
  }

  async rejectIssue(
    id: string,
    dto: RejectDepartmentActionDto,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can reject department issues');
    }

    const issue = await this.prisma.departmentIssue.findUnique({
      where: { id },
    });

    if (!issue) {
      throw new NotFoundException(`Department issue ${id} not found`);
    }

    if (issue.status !== DepartmentIssueStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Department issue is not pending approval (current status: ${issue.status})`,
      );
    }

    const rejected = await this.prisma.departmentIssue.update({
      where: { id: issue.id },
      data: {
        status: DepartmentIssueStatus.REJECTED,
        rejectionReason: dto.reason.trim(),
        approvedById: user.id,
      },
    });
    await this.notificationsService.notifyUser(
      issue.issuedById,
      'Department issue rejected',
      `Your department stock issue was rejected. Reason: ${dto.reason}`,
      'DEPARTMENT_ISSUE',
      issue.id,
    );
    return rejected;
  }

  // ==========================================
  // DEPARTMENT RETURNS
  // ==========================================

  async createReturn(dto: CreateDepartmentReturnDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin is not authorized to submit department returns');
    }

    const userProjectId = await this.getProjectForUser(user);
    let projectId = userProjectId;
    let departmentId = dto.departmentId;

    if (dto.departmentIssueId) {
      const issue = await this.prisma.departmentIssue.findUnique({
        where: { id: dto.departmentIssueId },
      });
      if (!issue) {
        throw new NotFoundException(`Department issue ${dto.departmentIssueId} not found`);
      }
      if (user.role === UserRole.PROJECT_ADMIN && issue.projectId !== userProjectId) {
        throw new ForbiddenException('Linked department issue belongs to another project');
      }
      projectId = issue.projectId;
      departmentId = departmentId ?? issue.departmentId;
    }

    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundException(`Department ${departmentId} not found`);
      }
      if (user.role === UserRole.PROJECT_ADMIN && department.projectId !== userProjectId) {
        throw new ForbiddenException('Department does not belong to your project');
      }
      projectId = projectId ?? department.projectId;
    }

    if (!projectId) {
      throw new BadRequestException('Project could not be determined for department return');
    }

    // Validate product
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { units: true },
    });

    if (!product) {
      throw new NotFoundException('Selected product not found');
    }

    if (product.status !== ProductStatus.APPROVED) {
      throw new BadRequestException(
        `Product "${product.name}" is not approved (status: ${product.status})`,
      );
    }

    // Resolve unit
    let unit = null;
    if (dto.unitId) {
      unit = product.units.find((u) => u.id === dto.unitId && u.status === 'ACTIVE');
    } else if (dto.unitName) {
      unit = product.units.find(
        (u) => u.unitName.toLowerCase() === dto.unitName!.trim().toLowerCase() && u.status === 'ACTIVE',
      );
    } else {
      unit = product.units.find((u) => u.isBaseUnit && u.status === 'ACTIVE');
    }

    if (!unit) {
      throw new NotFoundException(
        `Active unit "${dto.unitId || dto.unitName || 'base'}" not found for product ${product.name}`,
      );
    }

    const originalQtyDec = new Prisma.Decimal(dto.quantity);
    const conversionSnapshot = new Prisma.Decimal(unit.conversionToBase);
    const baseQuantity = originalQtyDec.mul(conversionSnapshot);

    if (product.quantityPrecision === 0 && !baseQuantity.isInteger()) {
      throw new BadRequestException(
        `Product "${product.name}" requires integer whole units. Base quantity ${baseQuantity} is fractional.`,
      );
    }

    const created = await this.prisma.departmentReturn.create({
      data: {
        projectId,
        departmentId: departmentId || null,
        departmentIssueId: dto.departmentIssueId || null,
        productId: product.id,
        quantity: originalQtyDec,
        unitId: unit.id,
        unitNameSnapshot: unit.unitName,
        conversionToBaseSnapshot: conversionSnapshot,
        baseQuantity,
        reason: dto.reason.trim(),
        status: DepartmentReturnStatus.PENDING_APPROVAL,
        notes: dto.notes?.trim() || null,
        returnedById: user.id,
      },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
      },
    });
    const requiresApproval = (await this.notificationsService.getSettings?.())?.approvalRequirements?.departmentReturn ?? true;
    if (!requiresApproval) return this.approveReturn(created.id, {}, user, true);
    return created;
  }

  async getReturns(
    query: {
      projectId?: string;
      departmentId?: string;
      status?: DepartmentReturnStatus;
    },
    user: AuthenticatedUser,
  ) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot view department returns');
    }

    const userProjectId = await this.getProjectForUser(user);
    const effectiveProjectId =
      user.role === UserRole.PROJECT_ADMIN ? userProjectId : query.projectId;

    const where: Prisma.DepartmentReturnWhereInput = {};
    if (effectiveProjectId) where.projectId = effectiveProjectId;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.status) where.status = query.status;

    return this.prisma.departmentReturn.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
        returnedBy: { select: { id: true, username: true, role: true } },
        approvedBy: { select: { id: true, username: true, role: true } },
      },
    });
  }

  async getReturn(id: string, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot view department returns');
    }

    const ret = await this.prisma.departmentReturn.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
        returnedBy: { select: { id: true, username: true, role: true } },
        approvedBy: { select: { id: true, username: true, role: true } },
        departmentIssue: true,
      },
    });

    if (!ret) {
      throw new NotFoundException(`Department return ${id} not found`);
    }

    if (user.role === UserRole.PROJECT_ADMIN) {
      const userProjectId = await this.getProjectForUser(user);
      if (ret.projectId !== userProjectId) {
        throw new ForbiddenException('Access denied to other project department returns');
      }
    }

    return ret;
  }

  async approveReturn(
    id: string,
    dto: ApproveDepartmentActionDto,
    user: AuthenticatedUser,
    automated = false,
  ) {
    if (!automated && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve department returns');
    }

    const ret = await this.prisma.departmentReturn.findUnique({
      where: { id },
      include: { department: true, product: true },
    });

    if (!ret) {
      throw new NotFoundException(`Department return ${id} not found`);
    }

    if (ret.status === DepartmentReturnStatus.APPROVED || ret.status === DepartmentReturnStatus.POSTED) return ret;
    if (ret.status !== DepartmentReturnStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Department return is not pending approval (current status: ${ret.status})`,
      );
    }

    const projectLocation = await this.inventoryService.getOrCreateLocationForProject(ret.projectId);

    // Credit central project stock in designated condition bucket and update return status in single atomic transaction
    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.postTransaction(
        {
          transactionType: TransactionType.STOCK_IN,
          sourceRefType: 'DEPARTMENT_RETURN',
          sourceRefId: ret.id,
          idempotencyKey: dto.idempotencyKey ?? `dept-return-approve-${ret.id}`,
          lines: [
            {
              locationId: projectLocation.id,
              productId: ret.productId,
              quantity: ret.quantity.toNumber(),
              unitName: ret.unitNameSnapshot,
              condition: StockCondition.USABLE,
              direction: 'IN',
            },
          ],
        },
        user.id,
        tx,
      );

      if (automated) {
        await tx.auditEvent.create({ data: {
          actorUserId: user.id,
          action: 'DEPARTMENT_RETURN_AUTO_POSTED',
          entityType: 'DEPARTMENT_RETURN',
          entityId: ret.id,
          reason: 'Super Admin approval settings allow immediate posting for department returns.',
        } });
      }

      return tx.departmentReturn.update({
        where: { id: ret.id },
        data: {
          status: automated ? DepartmentReturnStatus.POSTED : DepartmentReturnStatus.APPROVED,
          approvedById: automated ? null : user.id,
          approvedAt: new Date(),
        },
        include: {
          department: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
          unit: { select: { id: true, unitName: true } },
        },
      });
    });
  }

  async rejectReturn(
    id: string,
    dto: RejectDepartmentActionDto,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can reject department returns');
    }

    const ret = await this.prisma.departmentReturn.findUnique({
      where: { id },
    });

    if (!ret) {
      throw new NotFoundException(`Department return ${id} not found`);
    }

    if (ret.status !== DepartmentReturnStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Department return is not pending approval (current status: ${ret.status})`,
      );
    }

    return this.prisma.departmentReturn.update({
      where: { id: ret.id },
      data: {
        status: DepartmentReturnStatus.REJECTED,
        rejectionReason: dto.reason.trim(),
        approvedById: user.id,
      },
    });
  }

}
