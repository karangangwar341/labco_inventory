import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PostTransactionDto } from './dto/post-transaction.dto.js';
import {
  TransactionType,
  StockCondition,
  Prisma,
} from '@prisma/client';
import { calculateProjectedQuantities } from './inventory.types.js';

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async postTransaction(dto: PostTransactionDto, actorId: string) {
    // 1. Idempotency Check (REQ-016 & Non-negotiables)
    if (dto.idempotencyKey) {
      const existing = await this.prisma.ledgerTransaction.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { entries: true },
      });
      if (existing) {
        return existing; // Return existing transaction, prevent double-posting
      }
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Transaction must contain at least one line');
    }

    // 2. Atomic Database Transaction (ACID / Pessimistic concurrency)
    return this.prisma.$transaction(async (tx) => {
      // Validate all lines and resolve conversion snapshots
      const processedLines: Array<{
        locationId: string;
        productId: string;
        batchId: string | null;
        condition: StockCondition;
        qtyDeltaBase: Prisma.Decimal;
        originalQty: Prisma.Decimal;
        unitNameSnapshot: string;
        conversionToBaseSnapshot: Prisma.Decimal;
      }> = [];

      for (const line of dto.lines) {
        // Find product unit for snapshotting
        const unit = await tx.productUnit.findFirst({
          where: {
            productId: line.productId,
            unitName: line.unitName.trim(),
            status: 'ACTIVE',
          },
        });

        if (!unit) {
          throw new NotFoundException(
            `Unit "${line.unitName}" is not active or not configured for product ${line.productId}`,
          );
        }

        const originalQtyDec = new Prisma.Decimal(line.quantity);
        const conversionSnapshot = new Prisma.Decimal(unit.conversionToBase);
        const baseQuantity = originalQtyDec.mul(conversionSnapshot);

        const product = await tx.product.findUnique({
          where: { id: line.productId },
        });
        if (!product) {
          throw new NotFoundException(`Product ${line.productId} not found`);
        }

        if (product.quantityPrecision === 0 && !baseQuantity.isInteger()) {
          throw new BadRequestException(
            `Product "${product.name}" requires integer whole-unit quantities. Base quantity ${baseQuantity} is fractional.`,
          );
        }

        const qtyDeltaBase =
          line.direction === 'IN' ? baseQuantity : baseQuantity.negated();

        processedLines.push({
          locationId: line.locationId,
          productId: line.productId,
          batchId: line.batchId || null,
          condition: line.condition,
          qtyDeltaBase,
          originalQty: originalQtyDec,
          unitNameSnapshot: unit.unitName,
          conversionToBaseSnapshot: conversionSnapshot,
        });

        // Upsert / update inventory balance
        let balance = await tx.inventoryBalance.findFirst({
          where: {
            locationId: line.locationId,
            productId: line.productId,
            batchId: line.batchId || null,
          },
        });

        if (!balance) {
          balance = await tx.inventoryBalance.create({
            data: {
              locationId: line.locationId,
              productId: line.productId,
              batchId: line.batchId || null,
              usableQty: new Prisma.Decimal(0),
              reservedQty: new Prisma.Decimal(0),
              damagedQty: new Prisma.Decimal(0),
              expiredQty: new Prisma.Decimal(0),
              version: 0,
            },
          });
        }

        let newUsable = balance.usableQty;
        let newDamaged = balance.damagedQty;
        let newExpired = balance.expiredQty;

        if (line.condition === StockCondition.USABLE) {
          newUsable = newUsable.add(qtyDeltaBase);
          // Non-negotiable invariant: Available = Usable - Reserved >= 0
          if (newUsable.minus(balance.reservedQty).isNegative()) {
            throw new BadRequestException(
              `Insufficient available usable stock for product ${line.productId}. Available = Usable (${newUsable}) - Reserved (${balance.reservedQty}) cannot drop below zero.`,
            );
          }
        } else if (line.condition === StockCondition.DAMAGED) {
          newDamaged = newDamaged.add(qtyDeltaBase);
          if (newDamaged.isNegative()) {
            throw new BadRequestException(
              `Damaged stock balance cannot drop below zero for product ${line.productId}`,
            );
          }
        } else if (line.condition === StockCondition.EXPIRED) {
          newExpired = newExpired.add(qtyDeltaBase);
          if (newExpired.isNegative()) {
            throw new BadRequestException(
              `Expired stock balance cannot drop below zero for product ${line.productId}`,
            );
          }
        }

        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            usableQty: newUsable,
            damagedQty: newDamaged,
            expiredQty: newExpired,
            version: balance.version + 1,
          },
        });
      }

      // Create immutable LedgerTransaction header
      const ledgerTx = await tx.ledgerTransaction.create({
        data: {
          transactionType: dto.transactionType,
          sourceRefType: dto.sourceRefType || null,
          sourceRefId: dto.sourceRefId || null,
          idempotencyKey: dto.idempotencyKey || null,
          postedById: actorId,
          entries: {
            create: processedLines.map((l) => ({
              locationId: l.locationId,
              productId: l.productId,
              batchId: l.batchId,
              condition: l.condition,
              qtyDeltaBase: l.qtyDeltaBase,
              originalQty: l.originalQty,
              unitNameSnapshot: l.unitNameSnapshot,
              conversionToBaseSnapshot: l.conversionToBaseSnapshot,
            })),
          },
        },
        include: {
          entries: true,
        },
      });

      return ledgerTx;
    });
  }

  async reverseTransaction(originalTxId: string, actorId: string, reason?: string) {
    const originalTx = await this.prisma.ledgerTransaction.findUnique({
      where: { id: originalTxId },
      include: { entries: true },
    });

    if (!originalTx) {
      throw new NotFoundException(`Transaction ${originalTxId} not found`);
    }

    if (originalTx.transactionType === TransactionType.REVERSAL) {
      throw new BadRequestException('Cannot reverse a transaction that is already a reversal');
    }

    // Check if already reversed
    const existingReversal = await this.prisma.ledgerTransaction.findFirst({
      where: { reversalOfTxId: originalTxId },
    });
    if (existingReversal) {
      throw new ConflictException(`Transaction ${originalTxId} has already been reversed`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Create compensating entries with opposite delta
      for (const entry of originalTx.entries) {
        const compensatingDelta = entry.qtyDeltaBase.negated();

        const balance = await tx.inventoryBalance.findFirst({
          where: {
            locationId: entry.locationId,
            productId: entry.productId,
            batchId: entry.batchId || null,
          },
        });

        if (!balance) {
          throw new NotFoundException('Inventory balance row not found during reversal');
        }

        let newUsable = balance.usableQty;
        let newDamaged = balance.damagedQty;
        let newExpired = balance.expiredQty;

        if (entry.condition === StockCondition.USABLE) {
          newUsable = newUsable.add(compensatingDelta);
          if (newUsable.minus(balance.reservedQty).isNegative()) {
            throw new BadRequestException(
              'Cannot reverse transaction: insufficient usable stock to compensate deduction',
            );
          }
        } else if (entry.condition === StockCondition.DAMAGED) {
          newDamaged = newDamaged.add(compensatingDelta);
        } else if (entry.condition === StockCondition.EXPIRED) {
          newExpired = newExpired.add(compensatingDelta);
        }

        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            usableQty: newUsable,
            damagedQty: newDamaged,
            expiredQty: newExpired,
            version: balance.version + 1,
          },
        });
      }

      // Record new immutable reversal transaction
      const reversalTx = await tx.ledgerTransaction.create({
        data: {
          transactionType: TransactionType.REVERSAL,
          sourceRefType: 'REVERSAL_REASON',
          sourceRefId: reason || null,
          reversalOfTxId: originalTxId,
          postedById: actorId,
          entries: {
            create: originalTx.entries.map((e) => ({
              locationId: e.locationId,
              productId: e.productId,
              batchId: e.batchId,
              condition: e.condition,
              qtyDeltaBase: e.qtyDeltaBase.negated(),
              originalQty: e.originalQty,
              unitNameSnapshot: e.unitNameSnapshot,
              conversionToBaseSnapshot: e.conversionToBaseSnapshot,
              reversalOfEntryId: e.id,
            })),
          },
        },
        include: {
          entries: true,
        },
      });

      return reversalTx;
    });
  }

  /**
   * Historical transaction correction: Atomically creates reversal transaction for originalTxId,
   * then posts replacement lines linked to originalTxId. Never modifies or deletes historical rows.
   */
  async correctTransaction(
    originalTxId: string,
    dto: {
      reason: string;
      idempotencyKey?: string;
      replacementLines: Array<{
        locationId: string;
        productId: string;
        batchId?: string;
        condition: StockCondition;
        quantity: number;
        unitName: string;
        direction: 'IN' | 'OUT';
      }>;
    },
    actorId: string,
  ) {
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException(
        'A non-empty reason is required for historical transaction correction',
      );
    }

    const reversal = await this.reverseTransaction(
      originalTxId,
      actorId,
      dto.reason,
    );

    const replacement = await this.postTransaction(
      {
        transactionType: TransactionType.ADJUSTMENT,
        idempotencyKey: dto.idempotencyKey,
        sourceRefType: 'CORRECTION_REPLACEMENT',
        sourceRefId: originalTxId,
        lines: dto.replacementLines,
      },
      actorId,
    );

    return {
      reversal,
      replacement,
    };
  }
}

