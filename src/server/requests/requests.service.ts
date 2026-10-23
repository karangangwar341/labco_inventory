import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../auth/authorization.service';
import { LedgerService } from '../inventory/ledger.service';
import { ReservationsService } from './reservations.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UserRole,
  RequestStatus,
  RequestType,
  ApprovalDecision,
  TransactionType,
  Prisma,
  StockCondition,
  ProductStatus,
  ProductKind,
  CatalogScope,
  LocationType,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  CreateStockRequestDto,
  CreateStockRequestLineDto,
} from './dto/create-stock-request.dto';
import { UpdateStockRequestDto } from './dto/update-stock-request.dto';
import {
  ApproveStockRequestDto,
  RejectStockRequestDto,
} from './dto/decide-stock-request.dto';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthorizationService,
    private readonly ledgerService: LedgerService,
    private readonly reservationsService: ReservationsService,
    private readonly shipmentsService: ShipmentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Helper to format human-readable details for notifications (what items, from where to where).
   */
  private formatMovementSummary(request: any): { whatText: string; fromText: string; toText: string; reqCode: string } {
    const linesSummary = (request.lines || [])
      .slice(0, 2)
      .map((l: any) => `${Number(l.quantity)} ${l.unitNameSnapshot || 'units'} of ${l.product?.name || 'Item'}`)
      .join(', ');
    const extraCount = (request.lines?.length || 0) > 2 ? ` (+${request.lines.length - 2} more)` : '';
    const whatText = linesSummary ? `${linesSummary}${extraCount}` : 'Stock items';

    let fromText = 'Central Warehouse';
    if (request.sourceLocation?.warehouse?.name) {
      fromText = request.sourceLocation.warehouse.name;
    } else if (request.sourceLocation?.project?.name) {
      fromText = request.sourceLocation.project.name;
    } else if (request.sourceType) {
      fromText = request.sourceType;
    }

    let toText = 'Project Facility';
    if (request.destinationLocation?.project?.name) {
      toText = request.destinationLocation.project.name;
    } else if (request.destinationLocation?.warehouse?.name) {
      toText = request.destinationLocation.warehouse.name;
    } else if (request.project?.name) {
      toText = request.project.name;
    }

    const reqCode = request.requestNumber || `REQ-${request.id.slice(0, 8).toUpperCase()}`;

    return { whatText, fromText, toText, reqCode };
  }

  private isProjectLocation(
    loc: { locationType?: LocationType; projectId?: string | null; warehouseId?: string | null } | null | undefined,
  ): boolean {
    return Boolean(loc && (loc.locationType === LocationType.PROJECT || (!loc.warehouseId && Boolean(loc.projectId))));
  }

  private isWarehouseLocation(
    loc: { locationType?: LocationType; projectId?: string | null; warehouseId?: string | null } | null | undefined,
  ): boolean {
    return Boolean(loc && (loc.locationType === LocationType.WAREHOUSE || (!loc.projectId && Boolean(loc.warehouseId))));
  }

  /**
   * Helper to validate and calculate line base quantities and snapshots.
   */
  private async processLines(
    lines: CreateStockRequestLineDto[],
    tx: Prisma.TransactionClient,
    locationId?: string | null,
    user?: AuthenticatedUser,
  ) {
    if (!lines || lines.length === 0) {
      throw new BadRequestException('At least one request line is required');
    }

    const processed = [];

    for (const line of lines) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
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

      if (user?.role === UserRole.STORE_ADMIN && (
        product.kind !== ProductKind.RAW_MATERIAL || product.ownerScope !== CatalogScope.COMPANY
      )) {
        throw new ForbiddenException('Store Admins can only request company raw materials');
      }

      const unit = product.units.find(
        (u) => u.id === line.unitId && u.status === 'ACTIVE',
      );
      if (!unit) {
        throw new NotFoundException(
          `Unit ${line.unitId} not found or not active for product ${product.name}`,
        );
      }

      const originalQtyDec = new Prisma.Decimal(line.quantity);
      const conversionSnapshot = new Prisma.Decimal(unit.conversionToBase);
      const baseQuantity = originalQtyDec.mul(conversionSnapshot);

      if (product.quantityPrecision === 0 && !baseQuantity.isInteger()) {
        throw new BadRequestException(
          `Product "${product.name}" requires integer whole units. Calculated base quantity ${baseQuantity} is fractional.`,
        );
      }

      if (product.minOrderQuantity && Number(product.minOrderQuantity) > 1 && baseQuantity.lessThan(product.minOrderQuantity)) {
        throw new BadRequestException(
          `Order quantity for "${product.name}" (${baseQuantity} ${unit.unitName}) is below the Minimum Order Quantity (MOQ) of ${product.minOrderQuantity}.`,
        );
      }

      let systemQuantitySnapshot: Prisma.Decimal | null = null;
      let countedQuantity: Prisma.Decimal | null = null;
      let varianceQuantity: Prisma.Decimal | null = null;

      if (line.countedQuantity !== undefined && locationId) {
        countedQuantity = new Prisma.Decimal(line.countedQuantity);
        const countedBase = countedQuantity.mul(conversionSnapshot);
        const condition = line.condition || StockCondition.USABLE;

        const balance = await tx.inventoryBalance.findFirst({
          where: {
            locationId,
            productId: product.id,
          },
        });

        if (balance) {
          systemQuantitySnapshot =
            condition === StockCondition.USABLE
              ? balance.usableQty
              : new Prisma.Decimal(0);
        } else {
          systemQuantitySnapshot = new Prisma.Decimal(0);
        }

        varianceQuantity = countedBase.minus(systemQuantitySnapshot);
      }

      processed.push({
        productId: line.productId,
        quantity: originalQtyDec,
        unitId: unit.id,
        unitNameSnapshot: unit.unitName,
        conversionToBaseSnapshot: conversionSnapshot,
        baseQuantity,
        condition: line.condition || StockCondition.USABLE,
        systemQuantitySnapshot,
        countedQuantity,
        varianceQuantity,
      });
    }

    return processed;
  }

  /**
   * Create a new draft request without altering inventory or reservations.
   */
  async createDraft(user: AuthenticatedUser, dto: CreateStockRequestDto) {
    const damagedLines = dto.lines.filter((line) => line.condition === StockCondition.DAMAGED);
    if (damagedLines.length && dto.requestType !== RequestType.STOCK_OUT) {
      throw new BadRequestException('Damaged inventory must be reported as a stock-out request');
    }
    if (damagedLines.length && !dto.reason?.trim()) {
      throw new BadRequestException('A reason is required for damaged stock-out requests');
    }
    // Fetch locations to enforce domain invariants across all roles (including SUPER_ADMIN)
    const sourceLoc = dto.sourceLocationId
      ? await this.prisma.stockLocation.findUnique({
          where: { id: dto.sourceLocationId },
        })
      : null;

    const destLoc = dto.destinationLocationId
      ? await this.prisma.stockLocation.findUnique({
          where: { id: dto.destinationLocationId },
        })
      : null;

    if (dto.sourceLocationId && !sourceLoc) {
      throw new BadRequestException(`Source stock location ${dto.sourceLocationId} not found`);
    }
    if (dto.destinationLocationId && !destLoc) {
      throw new BadRequestException(`Destination stock location ${dto.destinationLocationId} not found`);
    }

    // Invariant 1: Project-to-project transfer/dispatch is strictly prohibited across all roles
    if (this.isProjectLocation(sourceLoc) && this.isProjectLocation(destLoc)) {
      throw new BadRequestException(
        'Project-to-project transfer is strictly prohibited. Projects are consumer endpoints, not distribution hubs.',
      );
    }

    // Invariant 2: Dispatch must originate from a Warehouse and target a Project
    if (dto.requestType === RequestType.DISPATCH) {
      if (!this.isWarehouseLocation(sourceLoc)) {
        throw new BadRequestException('Dispatch requests must originate from a warehouse stock location');
      }
      if (!this.isProjectLocation(destLoc)) {
        throw new BadRequestException('Dispatch requests must target a project stock location');
      }
    }

    // Invariant 3: Transfer is strictly inter-warehouse (Warehouse -> Warehouse)
    if (dto.requestType === RequestType.TRANSFER) {
      if (!this.isWarehouseLocation(sourceLoc)) {
        throw new BadRequestException('Transfer requests must originate from a warehouse stock location');
      }
      if (!this.isWarehouseLocation(destLoc)) {
        throw new BadRequestException('Transfer requests must target a warehouse stock location');
      }
      if (sourceLoc?.id === destLoc?.id) {
        throw new BadRequestException('Transfer source and destination warehouse locations must be different');
      }
    }

    // Invariant 4: Project stock-out is an internal consumption or write-off, not a transfer
    if (dto.requestType === RequestType.STOCK_OUT && this.isProjectLocation(sourceLoc)) {
      if (dto.destinationLocationId && dto.destinationLocationId !== sourceLoc?.id) {
        throw new BadRequestException(
          'Project stock-out is strictly an internal deduction. A destination location cannot be specified.',
        );
      }
    }

    // Role-scoped location validation
    if (user.role === UserRole.STORE_ADMIN) {
      const warehouseId = user.warehouseId !== undefined
        ? user.warehouseId
        : (await this.prisma.user.findUnique({ where: { id: user.id } }))?.warehouseId;
      if (!warehouseId) {
        throw new ForbiddenException('Store Admin is not assigned to any warehouse');
      }
      const warehouseLocation = await this.prisma.stockLocation.findUnique({
        where: { warehouseId },
      });
      if (!warehouseLocation) {
        throw new ForbiddenException('Assigned warehouse has no stock location');
      }
      if (dto.sourceLocationId && dto.sourceLocationId !== warehouseLocation.id) {
        throw new ForbiddenException('Stock requests must use your assigned warehouse');
      }
      if (dto.requestType === RequestType.STOCK_IN) {
        const targetLocId = dto.destinationLocationId || dto.sourceLocationId;
        if (targetLocId && targetLocId !== warehouseLocation.id) {
          throw new ForbiddenException('Stock-in must be added to your assigned warehouse');
        }
      }
      if (dto.requestType === RequestType.STOCK_OUT && dto.sourceLocationId !== warehouseLocation.id) {
        throw new ForbiddenException('Stock-out must come from your assigned warehouse');
      }
      if (dto.requestType === RequestType.DISPATCH) {
        if (dto.sourceLocationId !== warehouseLocation.id) {
          throw new ForbiddenException('Dispatch must come from your assigned warehouse');
        }
        const destination = dto.destinationLocationId
          ? await this.prisma.stockLocation.findUnique({ where: { id: dto.destinationLocationId } })
          : null;
        if (!destination?.projectId) {
          throw new ForbiddenException('Dispatch must be sent to an assigned project');
        }
        const assignment = await this.prisma.projectWarehouseAssignment.findFirst({
          where: {
            warehouseId,
            projectId: destination.projectId,
            isActive: true,
          },
        });
        if (!assignment) {
          throw new ForbiddenException('Warehouse is not assigned to this project');
        }
      }
      if (dto.requestType === RequestType.TRANSFER) {
        if (dto.sourceLocationId !== warehouseLocation.id) {
          throw new ForbiddenException('Transfer must come from your assigned warehouse');
        }
        const destination = dto.destinationLocationId
          ? await this.prisma.stockLocation.findUnique({ where: { id: dto.destinationLocationId } })
          : null;
        if (!destination?.warehouseId || destination.id === warehouseLocation.id) {
          throw new ForbiddenException('Choose another warehouse as the transfer destination');
        }
      }
      if (dto.requestType === RequestType.ADJUSTMENT &&
        dto.sourceLocationId !== warehouseLocation.id &&
        dto.destinationLocationId !== warehouseLocation.id) {
        throw new ForbiddenException('Stock adjustment must use your assigned warehouse');
      }
    } else if (user.role === UserRole.PROJECT_ADMIN) {
      const projectId = user.projectId !== undefined
        ? user.projectId
        : (await this.prisma.user.findUnique({ where: { id: user.id } }))?.projectId;
      if (!projectId) {
        throw new ForbiddenException('Project Admin is not assigned to any project');
      }
      if (dto.projectId && dto.projectId !== projectId) {
        throw new ForbiddenException('Cannot create request for another project');
      }
      const projectLocation = await this.prisma.stockLocation.findUnique({
        where: { projectId },
      });
      if (dto.requestType === RequestType.DISPATCH || dto.requestType === RequestType.TRANSFER) {
        throw new ForbiddenException('Project Admins can request stock-in and stock-out only');
      }
      if (!projectLocation ||
        (dto.sourceLocationId && dto.sourceLocationId !== projectLocation.id) ||
        (dto.destinationLocationId && dto.destinationLocationId !== projectLocation.id) ||
        (dto.requestType === RequestType.STOCK_IN && dto.destinationLocationId !== projectLocation.id) ||
        (dto.requestType === RequestType.STOCK_OUT && dto.sourceLocationId !== projectLocation.id) ||
        (dto.requestType === RequestType.ADJUSTMENT &&
          dto.sourceLocationId !== projectLocation.id &&
          dto.destinationLocationId !== projectLocation.id)) {
        throw new ForbiddenException('Stock requests must use your project location');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const locationId = dto.sourceLocationId || dto.destinationLocationId || null;
      const processedLines = await this.processLines(dto.lines, tx, locationId, user);

      return tx.stockRequest.create({
        data: {
          requestType: dto.requestType,
          sourceType: dto.sourceType || null,
          priority: dto.priority,
          requesterId: user.id,
          sourceLocationId: dto.sourceLocationId || null,
          destinationLocationId: dto.destinationLocationId || null,
          projectId: dto.projectId || null,
          reason: dto.reason || null,
          idempotencyKey: dto.idempotencyKey || null,
          status: RequestStatus.DRAFT,
          lines: {
            create: processedLines,
          },
        },
        include: {
          lines: true,
        },
      });
    });
  }

  /**
   * Submit a draft request. Atomically reserves stock for stock-out/dispatch requests.
   */
  async submitRequest(user: AuthenticatedUser, requestId: string, idempotencyKey?: string) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: {
        lines: {
          include: {
            product: { select: { name: true, kind: true, ownerScope: true } },
          },
        },
        sourceLocation: {
          include: {
            warehouse: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
        destinationLocation: {
          include: {
            warehouse: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
        project: { select: { name: true } },
      },
    });

    if (!request) {
      throw new NotFoundException(`Stock request ${requestId} not found`);
    }

    if (request.status !== RequestStatus.DRAFT) {
      throw new ConflictException(
        `Request ${requestId} cannot be submitted because it is in status ${request.status}`,
      );
    }

    if (user.role !== UserRole.SUPER_ADMIN && request.requesterId !== user.id) {
      throw new ForbiddenException('Only the requester can submit this draft');
    }
    if (user.role === UserRole.STORE_ADMIN && request.lines.some((line) => (
      line.product?.kind !== ProductKind.RAW_MATERIAL || line.product?.ownerScope !== CatalogScope.COMPANY
    ))) {
      throw new ForbiddenException('Store Admins can only submit requests for company raw materials');
    }

    if (this.isProjectLocation(request.sourceLocation) && this.isProjectLocation(request.destinationLocation)) {
      throw new BadRequestException('Project-to-project transfer is strictly prohibited.');
    }
    if (request.requestType === RequestType.DISPATCH && request.sourceLocation && !this.isWarehouseLocation(request.sourceLocation)) {
      throw new BadRequestException('Dispatch must originate from a warehouse.');
    }
    if (
      request.requestType === RequestType.TRANSFER &&
      ((request.sourceLocation && !this.isWarehouseLocation(request.sourceLocation)) ||
       (request.destinationLocation && !this.isWarehouseLocation(request.destinationLocation)))
    ) {
      throw new BadRequestException('Transfers are strictly inter-warehouse.');
    }

    const requirements = (await this.notificationsService.getSettings()).approvalRequirements;
    const requiresApproval = requirements.stockRequests[request.requestType];

    const submitted = await this.prisma.$transaction(async (tx) => {
      // Stock-out and Dispatch require source location and reserve usable stock atomically
      if (
        request.requestType === RequestType.STOCK_OUT ||
        request.requestType === RequestType.DISPATCH
      ) {
        if (!request.sourceLocationId) {
          throw new BadRequestException('Source location is required for stock-out requests');
        }

        await this.reservationsService.reserveStockForLines(
          tx,
          request.sourceLocationId,
          request.lines,
        );
      }

      return tx.stockRequest.update({
        where: { id: requestId },
        data: {
          status: RequestStatus.PENDING_APPROVAL,
          submittedAt: new Date(),
          idempotencyKey: idempotencyKey || request.idempotencyKey,
        },
        include: {
          lines: {
            include: { reservations: true },
          },
        },
      });
    });

    if (!requiresApproval) {
      return this.approveRequest(user, requestId, { idempotencyKey }, true);
    }

    const { whatText, fromText, toText, reqCode } = this.formatMovementSummary(request);
    const typeLabel = request.requestType.replaceAll('_', ' ').toLowerCase();

    await this.notificationsService.notifySuperAdmins(
      'Approval requested',
      `[${reqCode}] ${typeLabel}: ${whatText} · From: ${fromText} → To: ${toText}`,
      'STOCK_REQUEST',
      request.id,
    );
    return submitted;
  }

  /**
   * Edit a pending request. Atomically recalculates reservations.
   * If increased quantity is unavailable, transaction fails and existing values are preserved.
   */
  async updatePendingRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: UpdateStockRequestDto,
  ) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: { lines: true },
    });

    if (!request) {
      throw new NotFoundException(`Stock request ${requestId} not found`);
    }

    if (
      request.status !== RequestStatus.DRAFT &&
      request.status !== RequestStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException(
        `Cannot edit request ${requestId} in terminal/immutable status ${request.status}`,
      );
    }

    if (user.role !== UserRole.SUPER_ADMIN && request.requesterId !== user.id) {
      throw new ForbiddenException('Only the requester can edit this request');
    }

    return this.prisma.$transaction(async (tx) => {
      // If request is PENDING_APPROVAL and lines are being updated:
      if (request.status === RequestStatus.PENDING_APPROVAL && dto.lines) {
        const requiresReservation =
          request.requestType === RequestType.STOCK_OUT ||
          request.requestType === RequestType.DISPATCH;

        if (requiresReservation && request.sourceLocationId) {
          // 1. Release existing reservations
          await this.reservationsService.releaseReservationsForRequest(tx, requestId);
        }

        // 2. Delete old lines
        await tx.stockRequestLine.deleteMany({
          where: { requestId },
        });

        // 3. Process and create new lines
        const processedLines = await this.processLines(dto.lines, tx, undefined, user);
        const createdLines = [];
        for (const pl of processedLines) {
          const l = await tx.stockRequestLine.create({
            data: {
              requestId,
              ...pl,
            },
          });
          createdLines.push(l);
        }

        // 4. Reserve stock for new lines. If unavailable, throws BadRequestException and rolls back entire tx!
        if (requiresReservation && request.sourceLocationId) {
          await this.reservationsService.reserveStockForLines(
            tx,
            request.sourceLocationId,
            createdLines,
          );
        }
      } else if (request.status === RequestStatus.DRAFT && dto.lines) {
        await tx.stockRequestLine.deleteMany({ where: { requestId } });
        const processedLines = await this.processLines(dto.lines, tx, undefined, user);
        for (const pl of processedLines) {
          await tx.stockRequestLine.create({
            data: {
              requestId,
              ...pl,
            },
          });
        }
      }

      return tx.stockRequest.update({
        where: { id: requestId },
        data: {
          priority: dto.priority,
          reason: dto.reason !== undefined ? dto.reason : request.reason,
        },
        include: {
          lines: {
            include: { reservations: true },
          },
        },
      });
    });
  }

  /**
   * Cancel a pending request. Releases reservations immediately.
   */
  async cancelRequest(user: AuthenticatedUser, requestId: string) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Stock request ${requestId} not found`);
    }

    if (
      request.status !== RequestStatus.DRAFT &&
      request.status !== RequestStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException(
        `Cannot cancel request in status ${request.status}`,
      );
    }

    if (user.role !== UserRole.SUPER_ADMIN && request.requesterId !== user.id) {
      throw new ForbiddenException('Only the requester can cancel this request');
    }

    return this.prisma.$transaction(async (tx) => {
      if (request.status === RequestStatus.PENDING_APPROVAL) {
        await this.reservationsService.releaseReservationsForRequest(tx, requestId);
      }

      return tx.stockRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.CANCELLED },
      });
    });
  }

  /**
   * Super Admin rejects request. Requires mandatory reason and releases reservations immediately.
   */
  async rejectRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: RejectStockRequestDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can reject requests');
    }

    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: {
        lines: {
          include: {
            product: { select: { name: true, kind: true, ownerScope: true } },
          },
        },
        sourceLocation: {
          include: {
            warehouse: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
        destinationLocation: {
          include: {
            warehouse: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
        project: { select: { name: true } },
      },
    });

    if (!request) {
      throw new NotFoundException(`Stock request ${requestId} not found`);
    }

    if (request.status !== RequestStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Cannot reject request ${requestId} in status ${request.status}`,
      );
    }

    const rejected = await this.prisma.$transaction(async (tx) => {
      // Release reservations
      await this.reservationsService.releaseReservationsForRequest(tx, requestId);

      // Record approval decision
      await tx.approval.create({
        data: {
          requestId,
          decision: ApprovalDecision.REJECTED,
          approverId: user.id,
          reason: dto.reason,
        },
      });

      return tx.stockRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.REJECTED },
        include: { approvals: true },
      });
    });

    const { whatText, fromText, toText, reqCode } = this.formatMovementSummary(request);

    await this.notificationsService.notifyUser(
      request.requesterId,
      'Request rejected',
      `[${reqCode}] Rejected: ${whatText} (From: ${fromText} → To: ${toText}). Reason: ${dto.reason}`,
      'STOCK_REQUEST',
      request.id,
    );
    return rejected;
  }

  /**
   * Super Admin approves request. Atomically consumes reservation, posts ledger entries,
   * updates inventory, and records decision. Fully idempotent.
   */
  async approveRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: ApproveStockRequestDto,
    automated = false,
  ) {
    if (!automated && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve requests');
    }

    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: {
        lines: {
          include: {
            product: { select: { name: true, kind: true, ownerScope: true } },
          },
        },
        sourceLocation: {
          include: {
            warehouse: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
        destinationLocation: {
          include: {
            warehouse: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
        project: { select: { name: true } },
        approvals: true,
      },
    });

    if (!request) {
      throw new NotFoundException(`Stock request ${requestId} not found`);
    }

    // Idempotency check: if already approved, return without duplicate posting
    if (request.status === RequestStatus.APPROVED || request.status === RequestStatus.POSTED) {
      return request;
    }

    if (request.status !== RequestStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Cannot approve request ${requestId} in status ${request.status}`,
      );
    }

    if (request.sourceLocation?.warehouseId && request.lines.some((line) => (
      line.product?.kind !== ProductKind.RAW_MATERIAL || line.product?.ownerScope !== CatalogScope.COMPANY
    ))) {
      throw new BadRequestException('Warehouse stock requests can only contain company raw materials');
    }

    if (this.isProjectLocation(request.sourceLocation) && this.isProjectLocation(request.destinationLocation)) {
      throw new BadRequestException('Project-to-project transfer is strictly prohibited.');
    }
    if (request.requestType === RequestType.DISPATCH && request.sourceLocation && !this.isWarehouseLocation(request.sourceLocation)) {
      throw new BadRequestException('Dispatch must originate from a warehouse.');
    }
    if (
      request.requestType === RequestType.TRANSFER &&
      ((request.sourceLocation && !this.isWarehouseLocation(request.sourceLocation)) ||
       (request.destinationLocation && !this.isWarehouseLocation(request.destinationLocation)))
    ) {
      throw new BadRequestException('Transfers are strictly inter-warehouse.');
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      // 1. Consume reservations if stock-out, dispatch or transfer
      if (
        request.requestType === RequestType.STOCK_OUT ||
        request.requestType === RequestType.DISPATCH ||
        request.requestType === RequestType.TRANSFER
      ) {
        await this.reservationsService.consumeReservationsForRequest(tx, requestId);

        if (
          request.requestType === RequestType.DISPATCH ||
          request.requestType === RequestType.TRANSFER
        ) {
          await this.shipmentsService.createShipmentForApprovedDispatch(
            tx,
            request,
            user.id,
          );
        } else {
          // 2. Post ledger transaction (deduction) in shared atomic transaction
          await this.ledgerService.postTransaction(
            {
              transactionType: TransactionType.STOCK_OUT,
              idempotencyKey: dto.idempotencyKey || `req-approve-${request.id}`,
              sourceRefType: 'STOCK_REQUEST',
              sourceRefId: request.id,
              reason: request.reason || undefined,
              lines: request.lines.map((l) => ({
                locationId: request.sourceLocationId!,
                productId: l.productId,
                condition: l.condition,
                quantity: l.quantity.toNumber(),
                unitName: l.unitNameSnapshot,
                direction: 'OUT' as const,
              })),
            },
            user.id,
            tx,
          );
        }
      } else if (request.requestType === RequestType.STOCK_IN) {
        // Post ledger transaction (addition) in shared atomic transaction
        await this.ledgerService.postTransaction(
          {
            transactionType: TransactionType.STOCK_IN,
            idempotencyKey: dto.idempotencyKey || `req-approve-${request.id}`,
            sourceRefType: 'STOCK_REQUEST',
            sourceRefId: request.id,
            reason: request.reason || undefined,
            lines: request.lines.map((l) => ({
              locationId: (request.destinationLocationId || request.sourceLocationId)!,
              productId: l.productId,
              condition: l.condition,
              quantity: l.quantity.toNumber(),
              unitName: l.unitNameSnapshot,
              direction: 'IN' as const,
            })),
          },
          user.id,
          tx,
        );
      } else if (request.requestType === RequestType.ADJUSTMENT) {
        // Physical count adjustment posting in shared atomic transaction
        const adjustmentLines: any[] = [];
        for (const l of request.lines) {
          const delta = l.varianceQuantity
            ? l.varianceQuantity.toNumber()
            : l.quantity.toNumber();

          if (delta > 0) {
            adjustmentLines.push({
              locationId: (request.sourceLocationId || request.destinationLocationId)!,
              productId: l.productId,
              condition: l.condition,
              quantity: delta,
              unitName: l.unitNameSnapshot,
              direction: 'IN' as const,
            });
          } else if (delta < 0) {
            adjustmentLines.push({
              locationId: (request.sourceLocationId || request.destinationLocationId)!,
              productId: l.productId,
              condition: l.condition,
              quantity: Math.abs(delta),
              unitName: l.unitNameSnapshot,
              direction: 'OUT' as const,
            });
          }
        }

        if (adjustmentLines.length > 0) {
          await this.ledgerService.postTransaction(
            {
              transactionType: TransactionType.ADJUSTMENT,
              idempotencyKey: dto.idempotencyKey || `req-approve-${request.id}`,
              sourceRefType: 'STOCK_REQUEST',
              sourceRefId: request.id,
              lines: adjustmentLines,
            },
            user.id,
            tx,
          );
        }
      }

      // 3. Record approval record
      if (automated) {
        await tx.auditEvent.create({ data: {
          actorUserId: user.id,
          action: 'REQUEST_AUTO_POSTED',
          entityType: 'STOCK_REQUEST',
          entityId: requestId,
          reason: 'Super Admin approval settings allow immediate posting for this request type.',
        } });
      } else {
        await tx.approval.create({
          data: {
            requestId,
            decision: ApprovalDecision.APPROVED,
            approverId: user.id,
            reason: 'Approved by Super Admin',
          },
        });
      }

      // 4. Update request status to APPROVED
      return tx.stockRequest.update({
        where: { id: requestId },
        data: { status: automated ? RequestStatus.POSTED : RequestStatus.APPROVED },
        include: {
          lines: true,
          approvals: true,
        },
      });
    }, {
      maxWait: 10000,
      timeout: 30000,
    });
    const { whatText, fromText, toText, reqCode } = this.formatMovementSummary(request);

    await this.notificationsService.notifyUser(
      request.requesterId,
      'Request approved',
      `[${reqCode}] Approved: ${whatText} · From: ${fromText} → To: ${toText}. Inventory posted.`,
      'STOCK_REQUEST',
      request.id,
    );
    if (request.requestType === RequestType.DISPATCH || request.requestType === RequestType.TRANSFER) {
      await this.notificationsService.notifyProjectAdmins(
        request.projectId,
        'Stock shipment dispatched',
        `[${reqCode}] Dispatch on the way: ${whatText} to ${toText}. Confirm receipt upon arrival.`,
        'STOCK_REQUEST',
        request.id,
      );
    }
    return approved;
  }

  /**
   * List requests scoped to caller's role.
   */
  async getRequests(
    user: AuthenticatedUser,
    statusOrFilters?:
      | RequestStatus
      | {
          status?: RequestStatus;
          requestType?: RequestType;
          projectId?: string;
          warehouseId?: string;
        },
    pagination?: { limit?: number; page?: number },
  ) {
    const where: Prisma.StockRequestWhereInput = {};
    let status: RequestStatus | undefined;
    let requestType: RequestType | undefined;
    let filterProjectId: string | undefined;
    let filterWarehouseId: string | undefined;

    if (typeof statusOrFilters === 'string') {
      status = statusOrFilters;
    } else if (statusOrFilters && typeof statusOrFilters === 'object') {
      status = statusOrFilters.status;
      requestType = statusOrFilters.requestType;
      filterProjectId = statusOrFilters.projectId;
      filterWarehouseId = statusOrFilters.warehouseId;
    }

    if (status) {
      where.status = status;
    }
    if (requestType) {
      where.requestType = requestType;
    }

    if (user.role === UserRole.STORE_ADMIN) {
      const warehouseId = user.warehouseId !== undefined
        ? user.warehouseId
        : (await this.prisma.user.findUnique({ where: { id: user.id } }))?.warehouseId;
      if (!warehouseId) return [];
      where.OR = [
        { sourceLocation: { warehouseId } },
        { destinationLocation: { warehouseId } },
      ];
      if (filterProjectId) {
        where.projectId = filterProjectId;
      }
    } else if (user.role === UserRole.PROJECT_ADMIN) {
      const projectId = user.projectId !== undefined
        ? user.projectId
        : (await this.prisma.user.findUnique({ where: { id: user.id } }))?.projectId;
      if (!projectId) return [];
      where.projectId = projectId;
      if (filterWarehouseId) {
        where.OR = [
          { sourceLocation: { warehouseId: filterWarehouseId } },
          { destinationLocation: { warehouseId: filterWarehouseId } },
        ];
      }
    } else if (user.role === UserRole.SUPER_ADMIN) {
      if (filterProjectId) {
        where.projectId = filterProjectId;
      }
      if (filterWarehouseId) {
        where.OR = [
          { sourceLocation: { warehouseId: filterWarehouseId } },
          { destinationLocation: { warehouseId: filterWarehouseId } },
        ];
      }
    }

    const pageSize = pagination?.limit ? Math.min(Number(pagination.limit), 500) : 100;
    const pageNumber = pagination?.page ? Math.max(Number(pagination.page), 1) : 1;

    const requests = await this.prisma.stockRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip: (pageNumber - 1) * pageSize,
      include: {
        lines: {
          include: { product: { select: { id: true, name: true } } },
        },
        approvals: true,
        requester: { select: { id: true, username: true } },
        project: { select: { id: true, name: true } },
        sourceLocation: {
          include: {
            warehouse: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        },
        destinationLocation: {
          include: {
            warehouse: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (user.role === UserRole.SUPER_ADMIN && requests.some((r) => r.status === RequestStatus.PENDING_APPROVAL)) {
      for (const req of requests) {
        if (req.status !== RequestStatus.PENDING_APPROVAL || !req.sourceLocationId) continue;
        const sourceLocName = req.sourceLocation?.warehouse?.name || req.sourceLocation?.project?.name || 'Selected Location';
        for (const line of req.lines) {
          const bal = await this.prisma.inventoryBalance.findFirst({
            where: {
              locationId: req.sourceLocationId,
              productId: line.productId,
            },
          });
          const availAtSource = bal ? bal.usableQty.minus(bal.reservedQty) : new Prisma.Decimal(0);
          if (availAtSource.lessThan(line.quantity)) {
            const otherBals = await this.prisma.inventoryBalance.findMany({
              where: {
                productId: line.productId,
                locationId: { not: req.sourceLocationId },
                location: { locationType: LocationType.WAREHOUSE },
              },
              include: { location: { include: { warehouse: { select: { name: true } } } } },
            });
            const whMap = new Map<string, Prisma.Decimal>();
            for (const ob of otherBals) {
              const whName = ob.location?.warehouse?.name;
              if (!whName) continue;
              const avail = ob.usableQty.minus(ob.reservedQty);
              if (avail.greaterThan(0)) {
                whMap.set(whName, (whMap.get(whName) || new Prisma.Decimal(0)).add(avail));
              }
            }
            const unitSuffix = line.unitNameSnapshot ? ` ${line.unitNameSnapshot}` : '';
            if (whMap.size > 0) {
              const availList = Array.from(whMap.entries())
                .map(([wh, q]) => `"${wh}" (${q.toString()}${unitSuffix} available)`)
                .join(', ');
              (line as any).stockWarning = `Product "${line.product?.name || 'Selected product'}" is not available at "${sourceLocName}" (${availAtSource}${unitSuffix} available, ${line.quantity}${unitSuffix} requested). Stock is available in: ${availList}.`;
            } else {
              (line as any).stockWarning = `Product "${line.product?.name || 'Selected product'}" is not available at "${sourceLocName}" (${availAtSource}${unitSuffix} available, ${line.quantity}${unitSuffix} requested). No usable stock is currently available in other warehouses.`;
            }
          }
        }
      }
    }

    return requests;
  }

  async getRequestById(user: AuthenticatedUser, requestId: string) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: {
        lines: {
          include: {
            reservations: true,
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        },
        approvals: {
          include: { approver: { select: { id: true, username: true } } },
        },
        requester: { select: { id: true, username: true } },
        sourceLocation: {
          include: {
            warehouse: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        },
        destinationLocation: {
          include: {
            warehouse: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`Stock request ${requestId} not found`);
    }

    if (user.role === UserRole.SUPER_ADMIN && request.status === RequestStatus.PENDING_APPROVAL && request.sourceLocationId) {
      const sourceLocName = request.sourceLocation?.warehouse?.name || request.sourceLocation?.project?.name || 'Selected Location';
      for (const line of request.lines) {
        const bal = await this.prisma.inventoryBalance.findFirst({
          where: {
            locationId: request.sourceLocationId,
            productId: line.productId,
          },
        });
        const availAtSource = bal ? bal.usableQty.minus(bal.reservedQty) : new Prisma.Decimal(0);
        if (availAtSource.lessThan(line.quantity)) {
          const otherBals = await this.prisma.inventoryBalance.findMany({
            where: {
              productId: line.productId,
              locationId: { not: request.sourceLocationId },
              location: { locationType: LocationType.WAREHOUSE },
            },
            include: { location: { include: { warehouse: { select: { name: true } } } } },
          });
          const whMap = new Map<string, Prisma.Decimal>();
          for (const ob of otherBals) {
            const whName = ob.location?.warehouse?.name;
            if (!whName) continue;
            const avail = ob.usableQty.minus(ob.reservedQty);
            if (avail.greaterThan(0)) {
              whMap.set(whName, (whMap.get(whName) || new Prisma.Decimal(0)).add(avail));
            }
          }
          const unitSuffix = line.unitNameSnapshot ? ` ${line.unitNameSnapshot}` : '';
          if (whMap.size > 0) {
            const availList = Array.from(whMap.entries())
              .map(([wh, q]) => `"${wh}" (${q.toString()}${unitSuffix} available)`)
              .join(', ');
            (line as any).stockWarning = `Product "${line.product?.name || 'Selected product'}" is not available at "${sourceLocName}" (${availAtSource}${unitSuffix} available, ${line.quantity}${unitSuffix} requested). Stock is available in: ${availList}.`;
          } else {
            (line as any).stockWarning = `Product "${line.product?.name || 'Selected product'}" is not available at "${sourceLocName}" (${availAtSource}${unitSuffix} available, ${line.quantity}${unitSuffix} requested). No usable stock is currently available in other warehouses.`;
          }
        }
      }
    }

    // Tenancy checks without redundant DB queries
    if (user.role === UserRole.STORE_ADMIN) {
      const warehouseId = user.warehouseId !== undefined
        ? user.warehouseId
        : (await this.prisma.user.findUnique({ where: { id: user.id } }))?.warehouseId;
      if (!warehouseId) {
        throw new ForbiddenException('Store Admin is not assigned to any warehouse');
      }
      const isSourceMatch = request.sourceLocation?.warehouseId === warehouseId || request.sourceLocation?.warehouse?.id === warehouseId;
      const isDestMatch = request.destinationLocation?.warehouseId === warehouseId || request.destinationLocation?.warehouse?.id === warehouseId;
      if (!isSourceMatch && !isDestMatch) {
        throw new ForbiddenException('Access denied to requests from another warehouse');
      }
    } else if (user.role === UserRole.PROJECT_ADMIN) {
      const projectId = user.projectId !== undefined
        ? user.projectId
        : (await this.prisma.user.findUnique({ where: { id: user.id } }))?.projectId;
      if (request.projectId && request.projectId !== projectId) {
        throw new ForbiddenException('Access denied to requests from another project');
      }
    }

    return request;
  }
}
