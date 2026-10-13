import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthorizationService } from '../auth/authorization.service.js';
import { LedgerService } from '../inventory/ledger.service.js';
import { ReservationsService } from './reservations.service.js';
import {
  UserRole,
  RequestStatus,
  RequestType,
  ApprovalDecision,
  TransactionType,
  Prisma,
  StockCondition,
  ProductStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  CreateStockRequestDto,
  CreateStockRequestLineDto,
} from './dto/create-stock-request.dto.js';
import { UpdateStockRequestDto } from './dto/update-stock-request.dto.js';
import {
  ApproveStockRequestDto,
  RejectStockRequestDto,
} from './dto/decide-stock-request.dto.js';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthorizationService,
    private readonly ledgerService: LedgerService,
    private readonly reservationsService: ReservationsService,
  ) {}

  /**
   * Helper to validate and calculate line base quantities and snapshots.
   */
  private async processLines(
    lines: CreateStockRequestLineDto[],
    tx: Prisma.TransactionClient,
    locationId?: string | null,
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
        throw new NotFoundException(`Product ${line.productId} not found`);
      }

      if (product.status !== ProductStatus.APPROVED) {
        throw new BadRequestException(
          `Product "${product.name}" is not approved (status: ${product.status})`,
        );
      }

      // Tracking mode validation (BATCH_ONLY, EXPIRY_ONLY, BOTH)
      if (
        (product.trackingMode === 'BATCH_ONLY' || product.trackingMode === 'BOTH') &&
        !line.batchId &&
        !line.batchNumber
      ) {
        throw new BadRequestException(
          `Product "${product.name}" requires batch/lot tracking. batchNumber or batchId is required.`,
        );
      }

      if (
        (product.trackingMode === 'EXPIRY_ONLY' || product.trackingMode === 'BOTH') &&
        !line.batchId &&
        !line.expiryDate
      ) {
        throw new BadRequestException(
          `Product "${product.name}" requires expiry tracking. expiryDate is required.`,
        );
      }

      let batchId = line.batchId || null;
      let batchNumber = line.batchNumber || null;
      let expiryDate = line.expiryDate ? new Date(line.expiryDate) : null;

      if (line.batchNumber) {
        let batch = await tx.stockBatch.findUnique({
          where: {
            productId_batchNumber: {
              productId: product.id,
              batchNumber: line.batchNumber.trim(),
            },
          },
        });
        if (!batch) {
          batch = await tx.stockBatch.create({
            data: {
              productId: product.id,
              batchNumber: line.batchNumber.trim(),
              expiryDate,
            },
          });
        }
        batchId = batch.id;
        batchNumber = batch.batchNumber;
        if (batch.expiryDate && !expiryDate) {
          expiryDate = batch.expiryDate;
        }
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
            batchId: batchId || null,
          },
        });

        if (balance) {
          systemQuantitySnapshot =
            condition === StockCondition.USABLE
              ? balance.usableQty
              : condition === StockCondition.DAMAGED
                ? balance.damagedQty
                : balance.expiredQty;
        } else {
          systemQuantitySnapshot = new Prisma.Decimal(0);
        }

        varianceQuantity = countedBase.minus(systemQuantitySnapshot);
      }

      processed.push({
        productId: line.productId,
        batchId,
        batchNumber,
        expiryDate,
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
    // Role-scoped location validation
    if (user.role === UserRole.STORE_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.warehouseId) {
        throw new ForbiddenException('Store Admin is not assigned to any warehouse');
      }
      if (dto.sourceLocationId) {
        const sourceLoc = await this.prisma.stockLocation.findUnique({
          where: { id: dto.sourceLocationId },
        });
        if (sourceLoc?.warehouseId !== dbUser.warehouseId) {
          throw new ForbiddenException('Cannot create request for another warehouse');
        }
      }
    } else if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.clientId) {
        throw new ForbiddenException('Client Admin is not assigned to any client');
      }
      if (dto.clientId && dto.clientId !== dbUser.clientId) {
        throw new ForbiddenException('Cannot create request for another client');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const locationId = dto.sourceLocationId || dto.destinationLocationId || null;
      const processedLines = await this.processLines(dto.lines, tx, locationId);

      return tx.stockRequest.create({
        data: {
          requestType: dto.requestType,
          sourceType: dto.sourceType || null,
          priority: dto.priority,
          requesterId: user.id,
          sourceLocationId: dto.sourceLocationId || null,
          destinationLocationId: dto.destinationLocationId || null,
          clientId: dto.clientId || null,
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
      include: { lines: true },
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

    return this.prisma.$transaction(async (tx) => {
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
        const processedLines = await this.processLines(dto.lines, tx);
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
        const processedLines = await this.processLines(dto.lines, tx);
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
    });

    if (!request) {
      throw new NotFoundException(`Stock request ${requestId} not found`);
    }

    if (request.status !== RequestStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Cannot reject request ${requestId} in status ${request.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
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
  }

  /**
   * Super Admin approves request. Atomically consumes reservation, posts ledger entries,
   * updates inventory, and records decision. Fully idempotent.
   */
  async approveRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: ApproveStockRequestDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve requests');
    }

    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: { lines: true, approvals: true },
    });

    if (!request) {
      throw new NotFoundException(`Stock request ${requestId} not found`);
    }

    // Idempotency check: if already approved, return without duplicate posting
    if (request.status === RequestStatus.APPROVED) {
      return request;
    }

    if (request.status !== RequestStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Cannot approve request ${requestId} in status ${request.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Consume reservations if stock-out or dispatch
      if (
        request.requestType === RequestType.STOCK_OUT ||
        request.requestType === RequestType.DISPATCH
      ) {
        await this.reservationsService.consumeReservationsForRequest(tx, requestId);

        // 2. Post ledger transaction (deduction)
        await this.ledgerService.postTransaction(
          {
            transactionType: TransactionType.STOCK_OUT,
            idempotencyKey: dto.idempotencyKey || `req-approve-${request.id}`,
            sourceRefType: 'STOCK_REQUEST',
            sourceRefId: request.id,
            lines: request.lines.map((l) => ({
              locationId: request.sourceLocationId!,
              productId: l.productId,
              batchId: l.batchId || undefined,
              condition: l.condition,
              quantity: l.quantity.toNumber(),
              unitName: l.unitNameSnapshot,
              direction: 'OUT' as const,
            })),
          },
          user.id,
        );
      } else if (request.requestType === RequestType.STOCK_IN) {
        // Post ledger transaction (addition)
        await this.ledgerService.postTransaction(
          {
            transactionType: TransactionType.STOCK_IN,
            idempotencyKey: dto.idempotencyKey || `req-approve-${request.id}`,
            sourceRefType: 'STOCK_REQUEST',
            sourceRefId: request.id,
            lines: request.lines.map((l) => ({
              locationId: (request.destinationLocationId || request.sourceLocationId)!,
              productId: l.productId,
              batchId: l.batchId || undefined,
              condition: l.condition,
              quantity: l.quantity.toNumber(),
              unitName: l.unitNameSnapshot,
              direction: 'IN' as const,
            })),
          },
          user.id,
        );
      } else if (request.requestType === RequestType.ADJUSTMENT) {
        // Physical count adjustment posting
        const adjustmentLines: any[] = [];
        for (const l of request.lines) {
          const delta = l.varianceQuantity
            ? l.varianceQuantity.toNumber()
            : l.quantity.toNumber();

          if (delta > 0) {
            adjustmentLines.push({
              locationId: (request.sourceLocationId || request.destinationLocationId)!,
              productId: l.productId,
              batchId: l.batchId || undefined,
              condition: l.condition,
              quantity: delta,
              unitName: l.unitNameSnapshot,
              direction: 'IN' as const,
            });
          } else if (delta < 0) {
            adjustmentLines.push({
              locationId: (request.sourceLocationId || request.destinationLocationId)!,
              productId: l.productId,
              batchId: l.batchId || undefined,
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
          );
        }
      }

      // 3. Record approval record
      await tx.approval.create({
        data: {
          requestId,
          decision: ApprovalDecision.APPROVED,
          approverId: user.id,
          reason: 'Approved by Super Admin',
        },
      });

      // 4. Update request status to APPROVED
      return tx.stockRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.APPROVED },
        include: {
          lines: true,
          approvals: true,
        },
      });
    });
  }

  /**
   * List requests scoped to caller's role.
   */
  async getRequests(user: AuthenticatedUser, status?: RequestStatus) {
    const where: Prisma.StockRequestWhereInput = {};
    if (status) {
      where.status = status;
    }

    if (user.role === UserRole.STORE_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.warehouseId) return [];
      const location = await this.prisma.stockLocation.findUnique({
        where: { warehouseId: dbUser.warehouseId },
      });
      if (!location) return [];
      where.OR = [
        { sourceLocationId: location.id },
        { destinationLocationId: location.id },
      ];
    } else if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.clientId) return [];
      where.clientId = dbUser.clientId;
    }

    return this.prisma.stockRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        lines: true,
        approvals: true,
        requester: { select: { id: true, username: true } },
      },
    });
  }

  async getRequestById(user: AuthenticatedUser, requestId: string) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: {
        lines: {
          include: { reservations: true },
        },
        approvals: {
          include: { approver: { select: { id: true, username: true } } },
        },
        requester: { select: { id: true, username: true } },
        sourceLocation: true,
        destinationLocation: true,
      },
    });

    if (!request) {
      throw new NotFoundException(`Stock request ${requestId} not found`);
    }

    // Tenancy checks
    if (user.role === UserRole.STORE_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      const location = await this.prisma.stockLocation.findUnique({
        where: { warehouseId: dbUser?.warehouseId || '' },
      });
      if (
        request.sourceLocationId !== location?.id &&
        request.destinationLocationId !== location?.id
      ) {
        throw new ForbiddenException('Access denied to requests from another warehouse');
      }
    } else if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (request.clientId && request.clientId !== dbUser?.clientId) {
        throw new ForbiddenException('Access denied to requests from another client');
      }
    }

    return request;
  }
}
