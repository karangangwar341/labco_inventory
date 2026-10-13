import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, ReservationStatus, StockCondition } from '@prisma/client';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically reserve stock for an array of lines.
   * Enforces: Available = Usable - Reserved >= baseQuantity.
   */
  async reserveStockForLines(
    tx: Prisma.TransactionClient,
    locationId: string,
    lines: Array<{
      id: string;
      productId: string;
      batchId?: string | null;
      baseQuantity: Prisma.Decimal;
      condition?: StockCondition;
    }>,
  ) {
    for (const line of lines) {
      if (line.condition && line.condition !== StockCondition.USABLE) {
        throw new BadRequestException(
          'Reservations can only be placed on USABLE stock condition',
        );
      }

      // Query inventory balance under lock / transaction
      const balance = await tx.inventoryBalance.findFirst({
        where: {
          locationId,
          productId: line.productId,
          batchId: line.batchId || null,
        },
      });

      if (!balance) {
        throw new BadRequestException(
          `No inventory balance exists at source location for product ${line.productId}`,
        );
      }

      const availableQty = balance.usableQty.minus(balance.reservedQty);
      if (availableQty.lessThan(line.baseQuantity)) {
        throw new BadRequestException(
          `Insufficient available stock for product ${line.productId}. Available: ${availableQty}, Requested: ${line.baseQuantity}`,
        );
      }

      // 1. Create active reservation record
      await tx.reservation.create({
        data: {
          requestLineId: line.id,
          locationId,
          productId: line.productId,
          batchId: line.batchId || null,
          quantityBase: line.baseQuantity,
          status: ReservationStatus.ACTIVE,
        },
      });

      // 2. Increment reservedQty on inventory balance
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          reservedQty: balance.reservedQty.add(line.baseQuantity),
          version: balance.version + 1,
        },
      });
    }
  }

  /**
   * Atomically release all active reservations for a request.
   * Decrements reservedQty and marks status as RELEASED.
   */
  async releaseReservationsForRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
  ) {
    const activeReservations = await tx.reservation.findMany({
      where: {
        requestLine: { requestId },
        status: ReservationStatus.ACTIVE,
      },
    });

    for (const reservation of activeReservations) {
      const balance = await tx.inventoryBalance.findFirst({
        where: {
          locationId: reservation.locationId,
          productId: reservation.productId,
          batchId: reservation.batchId || null,
        },
      });

      if (balance) {
        const newReserved = balance.reservedQty.minus(reservation.quantityBase);
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            reservedQty: newReserved.isNegative() ? new Prisma.Decimal(0) : newReserved,
            version: balance.version + 1,
          },
        });
      }

      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date(),
        },
      });
    }
  }

  /**
   * Atomically consume reservations on approval.
   * Decrements reservedQty and marks status as CONSUMED.
   */
  async consumeReservationsForRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
  ) {
    const activeReservations = await tx.reservation.findMany({
      where: {
        requestLine: { requestId },
        status: ReservationStatus.ACTIVE,
      },
    });

    for (const reservation of activeReservations) {
      const balance = await tx.inventoryBalance.findFirst({
        where: {
          locationId: reservation.locationId,
          productId: reservation.productId,
          batchId: reservation.batchId || null,
        },
      });

      if (balance) {
        const newReserved = balance.reservedQty.minus(reservation.quantityBase);
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            reservedQty: newReserved.isNegative() ? new Prisma.Decimal(0) : newReserved,
            version: balance.version + 1,
          },
        });
      }

      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CONSUMED,
          releasedAt: new Date(),
        },
      });
    }
  }
}
