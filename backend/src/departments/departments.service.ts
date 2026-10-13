import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LedgerService } from '../inventory/ledger.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import {
  UserRole,
  DepartmentStatus,
  DepartmentIssueStatus,
  DepartmentReturnStatus,
  ProductStatus,
  StockCondition,
  TransactionType,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { CreateDepartmentDto } from './dto/create-department.dto.js';
import { UpdateDepartmentDto } from './dto/update-department.dto.js';
import {
  ApproveDepartmentDto,
  RejectDepartmentDto,
} from './dto/decide-department.dto.js';
import { CreateDepartmentIssueDto } from './dto/create-department-issue.dto.js';
import { CreateDepartmentReturnDto } from './dto/create-department-return.dto.js';
import {
  ApproveDepartmentActionDto,
  RejectDepartmentActionDto,
} from './dto/decide-department-request.dto.js';
import { WriteOffStockDto } from './dto/write-off-stock.dto.js';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly inventoryService: InventoryService,
  ) {}

  private async getClientForUser(user: AuthenticatedUser): Promise<string | null> {
    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      return dbUser?.clientId ?? null;
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

    const userClientId = await this.getClientForUser(user);
    const clientId = user.role === UserRole.CLIENT_ADMIN ? userClientId : dto.clientId;

    if (!clientId) {
      throw new BadRequestException('clientId is required');
    }

    if (user.role === UserRole.CLIENT_ADMIN && clientId !== userClientId) {
      throw new ForbiddenException('Client Admin can only manage departments for their own organization');
    }

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }

    const existing = await this.prisma.department.findUnique({
      where: {
        clientId_name: {
          clientId,
          name: dto.name.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Department "${dto.name}" already exists for this client`);
    }

    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    return this.prisma.department.create({
      data: {
        clientId,
        name: dto.name.trim(),
        status: isSuperAdmin ? DepartmentStatus.ACTIVE : DepartmentStatus.PENDING_APPROVAL,
        createdById: user.id,
        approvedById: isSuperAdmin ? user.id : null,
        approvedAt: isSuperAdmin ? new Date() : null,
      },
    });
  }

  async getDepartments(clientId?: string, user?: AuthenticatedUser) {
    if (user?.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin is not authorized to view departments');
    }

    const userClientId = user ? await this.getClientForUser(user) : null;
    const effectiveClientId =
      user?.role === UserRole.CLIENT_ADMIN ? userClientId : clientId;

    return this.prisma.department.findMany({
      where: effectiveClientId ? { clientId: effectiveClientId } : {},
      orderBy: { name: 'asc' },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true, fullName: true } },
        approvedBy: { select: { id: true, email: true, fullName: true } },
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
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true, fullName: true } },
        approvedBy: { select: { id: true, email: true, fullName: true } },
      },
    });

    if (!dept) {
      throw new NotFoundException(`Department ${id} not found`);
    }

    if (user?.role === UserRole.CLIENT_ADMIN) {
      const userClientId = await this.getClientForUser(user);
      if (dept.clientId !== userClientId) {
        throw new ForbiddenException('Access denied to other client departments');
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
            clientId_name: {
              clientId: dept.clientId,
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

    if (user.role === UserRole.CLIENT_ADMIN) {
      // Client Admin proposes changes requiring Super Admin approval
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

    return this.prisma.department.update({
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
      return this.prisma.department.update({
        where: { id },
        data: {
          status: DepartmentStatus.INACTIVE,
          proposedName: null,
          proposedStatus: null,
        },
      });
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

    const userClientId = await this.getClientForUser(user);
    if (user.role === UserRole.CLIENT_ADMIN && department.clientId !== userClientId) {
      throw new ForbiddenException('Department does not belong to your client');
    }

    const clientId = department.clientId;

    // Validate product
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { units: true },
    });

    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found`);
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

    // Validate batch if provided
    if (dto.batchId) {
      const batch = await this.prisma.stockBatch.findUnique({
        where: { id: dto.batchId },
      });
      if (!batch || batch.productId !== product.id) {
        throw new BadRequestException(`Batch ${dto.batchId} is invalid for product ${product.name}`);
      }
    }

    // Verify stock availability at client location
    const clientLocation = await this.inventoryService.getOrCreateLocationForClient(clientId);
    const balance = await this.prisma.inventoryBalance.findFirst({
      where: {
        locationId: clientLocation.id,
        productId: product.id,
        batchId: dto.batchId || null,
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

    return this.prisma.departmentIssue.create({
      data: {
        clientId,
        departmentId: department.id,
        productId: product.id,
        batchId: dto.batchId || null,
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
  }

  async getIssues(
    query: {
      clientId?: string;
      departmentId?: string;
      status?: DepartmentIssueStatus;
    },
    user: AuthenticatedUser,
  ) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot view department issues');
    }

    const userClientId = await this.getClientForUser(user);
    const effectiveClientId =
      user.role === UserRole.CLIENT_ADMIN ? userClientId : query.clientId;

    const where: Prisma.DepartmentIssueWhereInput = {};
    if (effectiveClientId) where.clientId = effectiveClientId;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.status) where.status = query.status;

    return this.prisma.departmentIssue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
        issuedBy: { select: { id: true, email: true, fullName: true } },
        approvedBy: { select: { id: true, email: true, fullName: true } },
      },
    });
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
        issuedBy: { select: { id: true, email: true, fullName: true } },
        approvedBy: { select: { id: true, email: true, fullName: true } },
        returns: true,
      },
    });

    if (!issue) {
      throw new NotFoundException(`Department issue ${id} not found`);
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const userClientId = await this.getClientForUser(user);
      if (issue.clientId !== userClientId) {
        throw new ForbiddenException('Access denied to other client department issues');
      }
    }

    return issue;
  }

  async approveIssue(
    id: string,
    dto: ApproveDepartmentActionDto,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve department issues');
    }

    const issue = await this.prisma.departmentIssue.findUnique({
      where: { id },
      include: { department: true, product: true },
    });

    if (!issue) {
      throw new NotFoundException(`Department issue ${id} not found`);
    }

    if (issue.status !== DepartmentIssueStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Department issue is not pending approval (current status: ${issue.status})`,
      );
    }

    const clientLocation = await this.inventoryService.getOrCreateLocationForClient(issue.clientId);

    // Atomic transaction: deduct central client usable stock and update issue status
    // 1. Post ledger transaction for stock out from client central stock
    await this.ledgerService.postTransaction(
      {
        transactionType: TransactionType.STOCK_OUT,
        sourceRefType: 'DEPARTMENT_ISSUE',
        sourceRefId: issue.id,
        idempotencyKey: dto.idempotencyKey ?? `dept-issue-approve-${issue.id}`,
        lines: [
          {
            locationId: clientLocation.id,
            productId: issue.productId,
            batchId: issue.batchId || undefined,
            quantity: issue.quantity.toNumber(),
            unitName: issue.unitNameSnapshot,
            condition: StockCondition.USABLE,
            direction: 'OUT',
          },
        ],
      },
      user.id,
    );

    // Invariant: No department stock balance is created! Department tracking is issue/return history only.
    return this.prisma.departmentIssue.update({
      where: { id: issue.id },
      data: {
        status: DepartmentIssueStatus.APPROVED,
        approvedById: user.id,
        issuedAt: new Date(),
      },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
      },
    });
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

    return this.prisma.departmentIssue.update({
      where: { id: issue.id },
      data: {
        status: DepartmentIssueStatus.REJECTED,
        rejectionReason: dto.reason.trim(),
        approvedById: user.id,
      },
    });
  }

  // ==========================================
  // DEPARTMENT RETURNS
  // ==========================================

  async createReturn(dto: CreateDepartmentReturnDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin is not authorized to submit department returns');
    }

    const userClientId = await this.getClientForUser(user);
    let clientId = userClientId;
    let departmentId = dto.departmentId;

    if (dto.departmentIssueId) {
      const issue = await this.prisma.departmentIssue.findUnique({
        where: { id: dto.departmentIssueId },
      });
      if (!issue) {
        throw new NotFoundException(`Department issue ${dto.departmentIssueId} not found`);
      }
      if (user.role === UserRole.CLIENT_ADMIN && issue.clientId !== userClientId) {
        throw new ForbiddenException('Linked department issue belongs to another client');
      }
      clientId = issue.clientId;
      departmentId = departmentId ?? issue.departmentId;
    }

    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundException(`Department ${departmentId} not found`);
      }
      if (user.role === UserRole.CLIENT_ADMIN && department.clientId !== userClientId) {
        throw new ForbiddenException('Department does not belong to your client');
      }
      clientId = clientId ?? department.clientId;
    }

    if (!clientId) {
      throw new BadRequestException('Client could not be determined for department return');
    }

    // Validate product
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { units: true },
    });

    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found`);
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

    return this.prisma.departmentReturn.create({
      data: {
        clientId,
        departmentId: departmentId || null,
        departmentIssueId: dto.departmentIssueId || null,
        productId: product.id,
        batchId: dto.batchId || null,
        quantity: originalQtyDec,
        unitId: unit.id,
        unitNameSnapshot: unit.unitName,
        conversionToBaseSnapshot: conversionSnapshot,
        baseQuantity,
        condition: dto.condition,
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
  }

  async getReturns(
    query: {
      clientId?: string;
      departmentId?: string;
      condition?: StockCondition;
      status?: DepartmentReturnStatus;
    },
    user: AuthenticatedUser,
  ) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot view department returns');
    }

    const userClientId = await this.getClientForUser(user);
    const effectiveClientId =
      user.role === UserRole.CLIENT_ADMIN ? userClientId : query.clientId;

    const where: Prisma.DepartmentReturnWhereInput = {};
    if (effectiveClientId) where.clientId = effectiveClientId;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.condition) where.condition = query.condition;
    if (query.status) where.status = query.status;

    return this.prisma.departmentReturn.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
        returnedBy: { select: { id: true, email: true, fullName: true } },
        approvedBy: { select: { id: true, email: true, fullName: true } },
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
        returnedBy: { select: { id: true, email: true, fullName: true } },
        approvedBy: { select: { id: true, email: true, fullName: true } },
        departmentIssue: true,
      },
    });

    if (!ret) {
      throw new NotFoundException(`Department return ${id} not found`);
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const userClientId = await this.getClientForUser(user);
      if (ret.clientId !== userClientId) {
        throw new ForbiddenException('Access denied to other client department returns');
      }
    }

    return ret;
  }

  async approveReturn(
    id: string,
    dto: ApproveDepartmentActionDto,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve department returns');
    }

    const ret = await this.prisma.departmentReturn.findUnique({
      where: { id },
      include: { department: true, product: true },
    });

    if (!ret) {
      throw new NotFoundException(`Department return ${id} not found`);
    }

    if (ret.status !== DepartmentReturnStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Department return is not pending approval (current status: ${ret.status})`,
      );
    }

    const clientLocation = await this.inventoryService.getOrCreateLocationForClient(ret.clientId);

    // Credit central client stock in designated condition bucket and update return status
    await this.ledgerService.postTransaction(
      {
        transactionType: TransactionType.STOCK_IN,
        sourceRefType: 'DEPARTMENT_RETURN',
        sourceRefId: ret.id,
        idempotencyKey: dto.idempotencyKey ?? `dept-return-approve-${ret.id}`,
        lines: [
          {
            locationId: clientLocation.id,
            productId: ret.productId,
            batchId: ret.batchId || undefined,
            quantity: ret.quantity.toNumber(),
            unitName: ret.unitNameSnapshot,
            condition: ret.condition, // USABLE, DAMAGED, or EXPIRED
            direction: 'IN',
          },
        ],
      },
      user.id,
    );

    return this.prisma.departmentReturn.update({
      where: { id: ret.id },
      data: {
        status: DepartmentReturnStatus.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
      },
      include: {
        department: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        unit: { select: { id: true, unitName: true } },
      },
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

  // ==========================================
  // DAMAGED / EXPIRED STOCK WRITE-OFF
  // ==========================================

  async writeOffStock(dto: WriteOffStockDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Write-off of damaged or expired stock requires Super Admin approval');
    }

    if (dto.condition === StockCondition.USABLE) {
      throw new BadRequestException('Only DAMAGED or EXPIRED stock can be written off via this workflow');
    }

    const clientId = dto.clientId;
    if (!clientId) {
      throw new BadRequestException('clientId is required for stock write-off');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { units: true },
    });

    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found`);
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
      throw new NotFoundException(`Active unit not found for product ${product.name}`);
    }

    const originalQtyDec = new Prisma.Decimal(dto.quantity);
    const conversionSnapshot = new Prisma.Decimal(unit.conversionToBase);
    const baseQuantity = originalQtyDec.mul(conversionSnapshot);

    const clientLocation = await this.inventoryService.getOrCreateLocationForClient(clientId);

    const balance = await this.prisma.inventoryBalance.findFirst({
      where: {
        locationId: clientLocation.id,
        productId: product.id,
        batchId: dto.batchId || null,
      },
    });

    if (!balance) {
      throw new BadRequestException('No inventory balance found for this product/condition');
    }

    if (dto.condition === StockCondition.DAMAGED && balance.damagedQty.lt(baseQuantity)) {
      throw new BadRequestException(
        `Insufficient damaged stock to write off. Available damaged: ${balance.damagedQty}, requested: ${baseQuantity}`,
      );
    }

    if (dto.condition === StockCondition.EXPIRED && balance.expiredQty.lt(baseQuantity)) {
      throw new BadRequestException(
        `Insufficient expired stock to write off. Available expired: ${balance.expiredQty}, requested: ${baseQuantity}`,
      );
    }

    // Post write-off adjustment
    return this.ledgerService.postTransaction(
      {
        transactionType: TransactionType.ADJUSTMENT,
        sourceRefType: 'STOCK_WRITE_OFF',
        idempotencyKey: dto.idempotencyKey ?? `writeoff-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        lines: [
          {
            locationId: clientLocation.id,
            productId: dto.productId,
            batchId: dto.batchId || undefined,
            quantity: dto.quantity,
            unitName: unit.unitName,
            condition: dto.condition,
            direction: 'OUT',
          },
        ],
      },
      user.id,
    );
  }
}
