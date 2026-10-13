import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LedgerService } from '../inventory/ledger.service.js';
import {
  UserRole,
  ShipmentStatus,
  ShipmentType,
  TransactionType,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto.js';
import { ApproveReceiptDto } from './dto/approve-receipt.dto.js';

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Called during dispatch approval.
   * If receipt confirmation is enabled (baseline): deducts warehouse stock and creates IN_TRANSIT shipment.
   * If receipt confirmation is disabled (D-001): atomically transfers stock to client in the same transaction.
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

    const shipmentType =
      request.requestType === 'DISPATCH'
        ? ShipmentType.DISPATCH_TO_CLIENT
        : ShipmentType.WAREHOUSE_TRANSFER;

    // Deduct source location stock
    await this.ledgerService.postTransaction(
      {
        transactionType: TransactionType.TRANSFER_DISPATCH,
        idempotencyKey: `dispatch-deduct-${request.id}`,
        sourceRefType: 'STOCK_REQUEST',
        sourceRefId: request.id,
        lines: request.lines.map((l: any) => ({
          locationId: request.sourceLocationId,
          productId: l.productId,
          batchId: l.batchId || undefined,
          condition: l.condition,
          quantity: l.quantity.toNumber(),
          unitName: l.unitNameSnapshot,
          direction: 'OUT' as const,
        })),
      },
      actorId,
    );

    if (!receiptConfirmationEnabled) {
      // D-001: Immediate atomic warehouse-to-client transfer on dispatch approval
      await this.ledgerService.postTransaction(
        {
          transactionType: TransactionType.TRANSFER_RECEIPT,
          idempotencyKey: `dispatch-receipt-atomic-${request.id}`,
          sourceRefType: 'STOCK_REQUEST',
          sourceRefId: request.id,
          lines: request.lines.map((l: any) => ({
            locationId: request.destinationLocationId,
            productId: l.productId,
            batchId: l.batchId || undefined,
            condition: l.condition,
            quantity: l.quantity.toNumber(),
            unitName: l.unitNameSnapshot,
            direction: 'IN' as const,
          })),
        },
        actorId,
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
              batchId: l.batchId || null,
              unitName: l.unitNameSnapshot,
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
            batchId: l.batchId || null,
            unitName: l.unitNameSnapshot,
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
    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (shipment.destinationLocation.clientId !== dbUser?.clientId) {
        throw new ForbiddenException('Cannot receive shipment for another client');
      }
    } else if (user.role === UserRole.STORE_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (shipment.destinationLocation.warehouseId !== dbUser?.warehouseId) {
        throw new ForbiddenException('Cannot receive shipment for another warehouse');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let hasDiscrepancy = false;

      for (const lineDto of dto.lines) {
        const line = shipment.lines.find((l) => l.id === lineDto.shipmentLineId);
        if (!line) {
          throw new NotFoundException(
            `ShipmentLine ${lineDto.shipmentLineId} does not belong to shipment ${shipmentId}`,
          );
        }

        const receivedQtyDec = new Prisma.Decimal(lineDto.receivedQty);
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

      return tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: ShipmentStatus.AWAITING_RECEIPT_APPROVAL,
          receivedAt: new Date(),
          notes: dto.notes || shipment.notes,
        },
        include: { lines: true },
      });
    });
  }

  /**
   * Super Admin approves receipt.
   * D-002: Received quantity credits client usable stock; discrepancies enter DISCREPANCY_HOLD.
   */
  async approveReceipt(
    user: AuthenticatedUser,
    shipmentId: string,
    dto: ApproveReceiptDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve shipment receipt');
    }

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

    return this.prisma.$transaction(async (tx) => {
      // 1. Post approved received quantities to destination usable stock
      const linesToCredit = shipment.lines
        .filter((l) => l.receivedQty && !l.receivedQty.isZero())
        .map((l) => ({
          locationId: shipment.destinationLocationId,
          productId: l.productId,
          batchId: l.batchId || undefined,
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
        );
      }

      // 2. D-002: Check if unresolved discrepancy exists
      const hasDiscrepancy = shipment.lines.some(
        (l) => l.discrepancyQty && !l.discrepancyQty.isZero(),
      );

      const nextStatus =
        hasDiscrepancy && dto.holdDiscrepancy !== false
          ? ShipmentStatus.DISCREPANCY_HOLD
          : ShipmentStatus.COMPLETED;

      return tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: nextStatus,
        },
        include: { lines: true },
      });
    });
  }

  /**
   * List shipments within caller scope.
   */
  async getShipments(user: AuthenticatedUser, status?: ShipmentStatus) {
    const where: Prisma.ShipmentWhereInput = {};
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
      const location = await this.prisma.stockLocation.findUnique({
        where: { clientId: dbUser.clientId },
      });
      if (!location) return [];
      where.destinationLocationId = location.id;
    }

    return this.prisma.shipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        lines: {
          include: { product: { select: { id: true, name: true } } },
        },
        sourceLocation: {
          include: { warehouse: { select: { id: true, name: true } } },
        },
        destinationLocation: {
          include: {
            client: { select: { id: true, name: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
    });
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
            client: { select: { id: true, name: true } },
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
    } else if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      const location = await this.prisma.stockLocation.findUnique({
        where: { clientId: dbUser?.clientId || '' },
      });
      if (shipment.destinationLocationId !== location?.id) {
        throw new ForbiddenException('Access denied to shipment for another client');
      }
    }

    return shipment;
  }
}
