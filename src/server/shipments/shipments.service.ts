import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../inventory/ledger.service';
import {
  UserRole,
  ShipmentStatus,
  ShipmentType,
  TransactionType,
  Prisma,
  LocationType,
  ShipmentDiscrepancyResolution,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { ApproveReceiptDto } from './dto/approve-receipt.dto';
import { ResolveDiscrepancyDto, DiscrepancyResolution } from './dto/resolve-discrepancy.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Called during dispatch approval.
   * If receipt confirmation is enabled (baseline): deducts warehouse stock and creates IN_TRANSIT shipment.
   * If receipt confirmation is disabled (D-001): atomically transfers stock to project in the same transaction.
   */
  async createShipmentForApprovedDispatch(
    tx: Prisma.TransactionClient,
    request: any,
    actorId: string,
  ) {
    // Check D-001 system setting
    const setting = await tx.systemSetting.findUnique({
      where: { key: 'RECEIPT_CONFIRMATION_ENABLED' },
    });
    const receiptConfirmationEnabled =
      setting?.valueJson !== undefined ? Boolean(setting.valueJson) : true;

    const isProjectLoc = (loc: any) =>
      Boolean(loc && (loc.locationType === LocationType.PROJECT || (!loc.warehouseId && Boolean(loc.projectId))));

    let sourceLoc = request.sourceLocation;
    let destLoc = request.destinationLocation;
    if (!sourceLoc && request.sourceLocationId) {
      sourceLoc = await tx.stockLocation.findUnique({ where: { id: request.sourceLocationId } });
    }
    if (!destLoc && request.destinationLocationId) {
      destLoc = await tx.stockLocation.findUnique({ where: { id: request.destinationLocationId } });
    }

    if (isProjectLoc(sourceLoc) && isProjectLoc(destLoc)) {
      throw new BadRequestException('Project-to-project shipment is strictly prohibited.');
    }
    if (request.requestType === 'DISPATCH' && isProjectLoc(sourceLoc)) {
      throw new BadRequestException('Dispatch must originate from a warehouse.');
    }
    if (request.requestType === 'TRANSFER' && (isProjectLoc(sourceLoc) || isProjectLoc(destLoc))) {
      throw new BadRequestException('Transfers are strictly inter-warehouse.');
    }

    const shipmentType =
      request.requestType === 'DISPATCH'
        ? ShipmentType.DISPATCH_TO_PROJECT
        : ShipmentType.WAREHOUSE_TRANSFER;

    // Deduct source location stock in shared atomic transaction
    await this.ledgerService.postTransaction(
      {
        transactionType: TransactionType.TRANSFER_DISPATCH,
        idempotencyKey: `dispatch-deduct-${request.id}`,
        sourceRefType: 'STOCK_REQUEST',
        sourceRefId: request.id,
        lines: request.lines.map((l: any) => ({
          locationId: request.sourceLocationId,
          productId: l.productId,
          condition: l.condition,
          quantity: l.quantity.toNumber(),
          unitName: l.unitNameSnapshot,
          direction: 'OUT' as const,
        })),
      },
      actorId,
      tx,
    );

    if (!receiptConfirmationEnabled) {
      // D-001: Immediate atomic warehouse-to-project transfer on dispatch approval
      await this.ledgerService.postTransaction(
        {
          transactionType: TransactionType.TRANSFER_RECEIPT,
          idempotencyKey: `dispatch-receipt-atomic-${request.id}`,
          sourceRefType: 'STOCK_REQUEST',
          sourceRefId: request.id,
          lines: request.lines.map((l: any) => ({
            locationId: request.destinationLocationId,
            productId: l.productId,
            condition: l.condition,
            quantity: l.quantity.toNumber(),
            unitName: l.unitNameSnapshot,
            direction: 'IN' as const,
          })),
        },
        actorId,
        tx,
      );

      return tx.shipment.create({
        data: {
          requestId: request.id,
          shipmentType,
          sourceLocationId: request.sourceLocationId,
          destinationLocationId: request.destinationLocationId,
          status: ShipmentStatus.COMPLETED,
          notes: 'D-001 immediate atomic transfer (receipt confirmation disabled)',
          receivedAt: new Date(),
          lines: {
            create: request.lines.map((l: any) => ({
              productId: l.productId,
              unitName: l.unitNameSnapshot,
              conversionToBaseSnapshot: l.conversionToBaseSnapshot ?? new Prisma.Decimal(1),
              dispatchedQty: l.quantity,
              receivedQty: l.quantity,
              discrepancyQty: new Prisma.Decimal(0),
              condition: l.condition,
            })),
          },
        },
        include: { lines: true },
      });
    }

    // Default: in-transit tracking created
    return tx.shipment.create({
      data: {
        requestId: request.id,
        shipmentType,
        sourceLocationId: request.sourceLocationId,
        destinationLocationId: request.destinationLocationId,
        status: ShipmentStatus.IN_TRANSIT,
        lines: {
          create: request.lines.map((l: any) => ({
            productId: l.productId,
            unitName: l.unitNameSnapshot,
            conversionToBaseSnapshot: l.conversionToBaseSnapshot ?? new Prisma.Decimal(1),
            dispatchedQty: l.quantity,
            condition: l.condition,
          })),
        },
      },
      include: { lines: true },
    });
  }

  /**
   * Recipient records received quantities and notes any discrepancy.
   */
  async recordReceipt(
    user: AuthenticatedUser,
    shipmentId: string,
    dto: ReceiveShipmentDto,
  ) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        lines: true,
        destinationLocation: true,
      },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${shipmentId} not found`);
    }

    if (shipment.status !== ShipmentStatus.IN_TRANSIT) {
      throw new ConflictException(
        `Shipment ${shipmentId} cannot record receipt in status ${shipment.status}`,
      );
    }

    // Access authorization check on destination
    if (user.role === UserRole.PROJECT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (shipment.destinationLocation.projectId !== dbUser?.projectId) {
        throw new ForbiddenException('Cannot receive shipment for another project');
      }
    } else if (user.role === UserRole.STORE_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (shipment.destinationLocation.warehouseId !== dbUser?.warehouseId) {
        throw new ForbiddenException('Cannot receive shipment for another warehouse');
      }
    }

    // Finding #4: Validate that all shipment lines are reported and no duplicates
    if (!dto.lines || dto.lines.length !== shipment.lines.length) {
      throw new BadRequestException(
        `Receipt submission must report all ${shipment.lines.length} shipment line(s)`,
      );
    }

    const reportedLineIds = new Set(dto.lines.map((l) => l.shipmentLineId));
    if (reportedLineIds.size !== shipment.lines.length) {
      throw new BadRequestException('Duplicate shipment lines detected in receipt submission');
    }

    const received = await this.prisma.$transaction(async (tx) => {
      let hasDiscrepancy = false;

      for (const lineDto of dto.lines) {
        const line = shipment.lines.find((l) => l.id === lineDto.shipmentLineId);
        if (!line) {
          throw new NotFoundException(
            `ShipmentLine ${lineDto.shipmentLineId} does not belong to shipment ${shipmentId}`,
          );
        }

        const receivedQtyDec = new Prisma.Decimal(lineDto.receivedQty);

        // Finding #4: Non-negative and capped at dispatched quantity
        if (receivedQtyDec.isNegative()) {
          throw new BadRequestException(
            `Received quantity cannot be negative for line ${line.id}`,
          );
        }
        if (receivedQtyDec.greaterThan(line.dispatchedQty)) {
          throw new BadRequestException(
            `Received quantity (${receivedQtyDec}) cannot exceed dispatched quantity (${line.dispatchedQty}) for line ${line.id}`,
          );
        }

        const discrepancyQtyDec = line.dispatchedQty.minus(receivedQtyDec);

        if (!discrepancyQtyDec.isZero()) {
          hasDiscrepancy = true;
        }

        await tx.shipmentLine.update({
          where: { id: line.id },
          data: {
            receivedQty: receivedQtyDec,
            discrepancyQty: discrepancyQtyDec,
          },
        });
      }

      const updated = await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: ShipmentStatus.AWAITING_RECEIPT_APPROVAL,
          receivedAt: new Date(),
          notes: dto.notes || shipment.notes,
        },
        include: {
          lines: {
            include: { product: { select: { id: true, name: true } } },
          },
          sourceLocation: {
            include: { warehouse: { select: { id: true, name: true } } },
          },
          destinationLocation: {
            include: {
              project: { select: { id: true, name: true } },
              warehouse: { select: { id: true, name: true } },
            },
          },
        },
      });

      return this.formatShipment(updated);
    });
    const shpNumber = (shipment as any).shipmentNumber || `SHP-${shipment.id.slice(0, 8).toUpperCase()}`;
    const destName = (shipment.destinationLocation as any)?.project?.name || (shipment.destinationLocation as any)?.warehouse?.name || 'Project Facility';
    const linesSummary = shipment.lines
      .slice(0, 2)
      .map((l: any) => `${Number(l.dispatchedQty)} ${l.unitName || 'units'} of ${l.productName || 'Item'}`)
      .join(', ');
    const extraCount = shipment.lines.length > 2 ? ` (+${shipment.lines.length - 2} more)` : '';
    const itemsText = linesSummary ? `${linesSummary}${extraCount}` : 'Shipment items';

    const settings = await this.notificationsService.getSettings?.();
    if (settings?.approvalRequirements?.shipmentReceipt === false) {
      return this.approveReceipt(user, shipment.id, { idempotencyKey: `shipment-receipt-auto-${shipment.id}` }, true);
    }

    await this.notificationsService.notifySuperAdmins(
      'Shipment receipt submitted',
      `[${shpNumber}] ${destName} reported receipt of ${itemsText}. Review in Approvals to finalize.`,
      'SHIPMENT',
      shipment.id,
    );
    return received;
  }

  /**
   * Super Admin approves receipt.
   * D-002: Received quantity credits project usable stock; discrepancies enter DISCREPANCY_HOLD.
   */
  async approveReceipt(
    user: AuthenticatedUser,
    shipmentId: string,
    dto: ApproveReceiptDto,
    automated = false,
  ) {
    if (!automated && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve shipment receipt');
    }

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        lines: {
          include: { product: { select: { id: true, name: true } } },
        },
        sourceLocation: {
          include: { warehouse: { select: { id: true, name: true } } },
        },
        destinationLocation: {
          include: {
            project: { select: { id: true, name: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${shipmentId} not found`);
    }

    // Idempotency: if already approved, return
    if (
      shipment.status === ShipmentStatus.COMPLETED ||
      shipment.status === ShipmentStatus.DISCREPANCY_HOLD
    ) {
      return shipment;
    }

    if (shipment.status !== ShipmentStatus.AWAITING_RECEIPT_APPROVAL) {
      throw new ConflictException(
        `Shipment ${shipmentId} is not awaiting receipt approval (status: ${shipment.status})`,
      );
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      // 1. Post approved received quantities to destination usable stock in shared atomic transaction
      const linesToCredit = shipment.lines
        .filter((l) => l.receivedQty && !l.receivedQty.isZero())
        .map((l) => ({
          locationId: shipment.destinationLocationId,
          productId: l.productId,
          condition: l.condition,
          quantity: l.receivedQty!.toNumber(),
          unitName: l.unitName,
          direction: 'IN' as const,
        }));

      if (linesToCredit.length > 0) {
        await this.ledgerService.postTransaction(
          {
            transactionType: TransactionType.TRANSFER_RECEIPT,
            idempotencyKey: dto.idempotencyKey || `shipment-receipt-approve-${shipment.id}`,
            sourceRefType: 'SHIPMENT',
            sourceRefId: shipment.id,
            lines: linesToCredit,
          },
          user.id,
          tx,
        );
      }

      // 2. D-002: Check if unresolved discrepancy exists
      const hasDiscrepancy = shipment.lines.some(
        (l) => l.discrepancyQty && !l.discrepancyQty.isZero(),
      );

      const nextStatus = hasDiscrepancy
        ? ShipmentStatus.DISCREPANCY_HOLD
        : ShipmentStatus.COMPLETED;

      if (automated) {
        await tx.auditEvent.create({ data: {
          actorUserId: user.id,
          action: 'SHIPMENT_RECEIPT_AUTO_POSTED',
          entityType: 'SHIPMENT',
          entityId: shipment.id,
          reason: 'Super Admin approval settings allow immediate receipt posting.',
        } });
      }

      const updated = await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: nextStatus,
        },
        include: {
          lines: {
            include: { product: { select: { id: true, name: true } } },
          },
          sourceLocation: {
            include: { warehouse: { select: { id: true, name: true } } },
          },
          destinationLocation: {
            include: {
              project: { select: { id: true, name: true } },
              warehouse: { select: { id: true, name: true } },
            },
          },
        },
      });

      return this.formatShipment(updated);
    });
    await this.notificationsService.notifyProjectAdmins(
      shipment.destinationLocation?.projectId,
      'Shipment receipt approved',
      'Your confirmed shipment quantities were approved and added to stock.',
      'SHIPMENT',
      shipment.id,
    );
    return approved;
  }

  /** Super Admin makes one immutable final decision for every shortage line on a shipment. */
  async resolveDiscrepancy(
    user: AuthenticatedUser,
    shipmentId: string,
    dto: ResolveDiscrepancyDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can resolve shipment discrepancies');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        include: {
          lines: { include: { product: { include: { units: { where: { isBaseUnit: true, status: 'ACTIVE' }, take: 1 } } } } },
          sourceLocation: true,
          destinationLocation: { include: { project: { select: { id: true, name: true } }, warehouse: { select: { id: true, name: true } } } },
        },
      });
      if (!shipment) throw new NotFoundException(`Shipment ${shipmentId} not found`);

      if (shipment.discrepancyResolution) {
        if (shipment.discrepancyResolution === dto.resolution) return shipment;
        throw new ConflictException('This shipment discrepancy has already been resolved with the other decision');
      }
      if (shipment.status !== ShipmentStatus.DISCREPANCY_HOLD) {
        throw new ConflictException('Shipment must be on discrepancy hold before it can be resolved');
      }

      const shortageLines = shipment.lines.filter((line) => line.discrepancyQty && line.discrepancyQty.greaterThan(0));
      if (shortageLines.length === 0) {
        throw new ConflictException('Shipment has no outstanding discrepancy quantities');
      }

      if (dto.resolution === DiscrepancyResolution.CALCULATION_MISTAKE) {
        if (!shipment.sourceLocation.warehouseId) {
          throw new BadRequestException('Calculation-mistake resolution requires a warehouse source location');
        }
        await this.ledgerService.postTransaction({
          transactionType: TransactionType.STOCK_IN,
          idempotencyKey: `shipment-discrepancy-return-${shipment.id}`,
          sourceRefType: 'SHIPMENT_DISCREPANCY',
          sourceRefId: shipment.id,
          reason: 'Super Admin resolved shipment discrepancy as a calculation mistake; shortage returned to source warehouse.',
          lines: shortageLines.map((line) => {
            const baseUnit = line.product.units[0];
            if (!baseUnit) throw new BadRequestException(`Product ${line.product.name} has no active base unit`);
            return {
              locationId: shipment.sourceLocationId,
              productId: line.productId,
              condition: line.condition,
              quantity: line.discrepancyQty!.mul(line.conversionToBaseSnapshot).toNumber(),
              unitName: baseUnit.unitName,
              direction: 'IN' as const,
            };
          }),
        }, user.id, tx);
      }

      const resolvedAt = new Date();
      const updatedCount = await tx.shipment.updateMany({
        where: { id: shipment.id, status: ShipmentStatus.DISCREPANCY_HOLD, discrepancyResolution: null },
        data: {
          status: ShipmentStatus.COMPLETED,
          discrepancyResolution: dto.resolution as ShipmentDiscrepancyResolution,
          discrepancyResolvedAt: resolvedAt,
          discrepancyResolvedById: user.id,
          discrepancyResolutionNote: dto.note?.trim() || null,
        },
      });
      if (updatedCount.count !== 1) {
        throw new ConflictException('Shipment discrepancy was resolved by another request; refresh and retry');
      }

      await tx.auditEvent.create({ data: {
        actorUserId: user.id,
        action: dto.resolution === DiscrepancyResolution.MISSING
          ? 'SHIPMENT_DISCREPANCY_MARKED_MISSING'
          : 'SHIPMENT_DISCREPANCY_RETURNED_TO_WAREHOUSE',
        entityType: 'SHIPMENT',
        entityId: shipment.id,
        beforeJson: { status: shipment.status },
        afterJson: {
          status: ShipmentStatus.COMPLETED,
          resolution: dto.resolution,
          lines: shortageLines.map((line) => ({ productId: line.productId, quantity: line.discrepancyQty!.toString(), unit: line.unitName })),
          resolvedAt: resolvedAt.toISOString(),
        },
        reason: dto.note?.trim() || null,
      } });

      return tx.shipment.findUnique({
        where: { id: shipment.id },
        include: {
          lines: { include: { product: { select: { id: true, name: true } } } },
          sourceLocation: { include: { warehouse: { select: { id: true, name: true } } } },
          destinationLocation: { include: { project: { select: { id: true, name: true } }, warehouse: { select: { id: true, name: true } } } },
        },
      });
    });

    return this.formatShipment(result);
  }

  private formatShipment(shipment: any) {
    if (!shipment) return shipment;
    const shipmentNumber =
      shipment.shipmentNumber ||
      (shipment.id ? `SHP-${shipment.id.substring(0, 8).toUpperCase()}` : 'SHP-UNKNOWN');
    const sourceWarehouseName =
      shipment.sourceLocation?.warehouse?.name ||
      shipment.sourceWarehouseName ||
      'Central Warehouse';
    const destinationName =
      shipment.destinationLocation?.project?.name ||
      shipment.destinationLocation?.warehouse?.name ||
      shipment.destinationName ||
      'Destination Facility';
    const lines = (shipment.lines || []).map((line: any) => ({
      ...line,
      productName: line.product?.name || line.productName || 'Product',
    }));

    return {
      ...shipment,
      shipmentNumber,
      sourceWarehouseName,
      destinationName,
      lines,
    };
  }

  /**
   * List shipments within caller scope.
   */
  async getShipments(
    user: AuthenticatedUser,
    status?: ShipmentStatus,
    pagination?: { limit?: number; page?: number },
  ) {
    const where: Prisma.ShipmentWhereInput = {};
    if (status) {
      if ((status as string) === 'ACTIVE') {
        where.status = { in: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.AWAITING_RECEIPT_APPROVAL] };
      } else if (Object.values(ShipmentStatus).includes(status)) {
        where.status = status;
      }
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
    } else if (user.role === UserRole.PROJECT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.projectId) return [];
      const location = await this.prisma.stockLocation.findUnique({
        where: { projectId: dbUser.projectId },
      });
      if (!location) return [];
      where.destinationLocationId = location.id;
    }

    const pageSize = pagination?.limit ? Math.min(Number(pagination.limit), 500) : 100;
    const pageNumber = pagination?.page ? Math.max(Number(pagination.page), 1) : 1;

    const shipments = await this.prisma.shipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip: (pageNumber - 1) * pageSize,
      include: {
        lines: {
          include: { product: { select: { id: true, name: true } } },
        },
        sourceLocation: {
          include: { warehouse: { select: { id: true, name: true } } },
        },
        destinationLocation: {
          include: {
            project: { select: { id: true, name: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
    });

    return shipments.map((s) => this.formatShipment(s));
  }

  async getShipmentById(user: AuthenticatedUser, shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        lines: {
          include: { product: { select: { id: true, name: true } } },
        },
        sourceLocation: {
          include: { warehouse: { select: { id: true, name: true } } },
        },
        destinationLocation: {
          include: {
            project: { select: { id: true, name: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${shipmentId} not found`);
    }

    // Tenancy checks
    if (user.role === UserRole.STORE_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      const location = await this.prisma.stockLocation.findUnique({
        where: { warehouseId: dbUser?.warehouseId || '' },
      });
      if (
        shipment.sourceLocationId !== location?.id &&
        shipment.destinationLocationId !== location?.id
      ) {
        throw new ForbiddenException('Access denied to shipment from another warehouse');
      }
    } else if (user.role === UserRole.PROJECT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      const location = await this.prisma.stockLocation.findUnique({
        where: { projectId: dbUser?.projectId || '' },
      });
      if (shipment.destinationLocationId !== location?.id) {
        throw new ForbiddenException('Access denied to shipment for another project');
      }
    }

    return this.formatShipment(shipment);
  }
}
