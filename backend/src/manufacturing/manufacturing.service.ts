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
  ProductionStatus,
  ProductionMode,
  ProductStatus,
  StockCondition,
  TransactionType,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  CreateProductionRunDto,
  ProductionInputDto,
  ProductionOutputDto,
} from './dto/create-production-run.dto.js';
import {
  ApproveProductionRunDto,
  RejectProductionRunDto,
} from './dto/decide-production-run.dto.js';

@Injectable()
export class ManufacturingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Helper to validate and calculate input lines.
   */
  private async processInputs(
    inputs: ProductionInputDto[],
    tx: Prisma.TransactionClient,
  ) {
    if (!inputs || inputs.length === 0) {
      throw new BadRequestException('At least one production input is required');
    }

    const processed = [];

    for (const input of inputs) {
      const product = await tx.product.findUnique({
        where: { id: input.productId },
        include: { units: true },
      });

      if (!product) {
        throw new NotFoundException(`Product ${input.productId} not found`);
      }

      if (product.status !== ProductStatus.APPROVED) {
        throw new BadRequestException(
          `Product "${product.name}" is not approved (status: ${product.status})`,
        );
      }

      const unit = product.units.find(
        (u) => u.id === input.unitId && u.status === 'ACTIVE',
      );
      if (!unit) {
        throw new NotFoundException(
          `Unit ${input.unitId} not found or not active for product ${product.name}`,
        );
      }

      const originalQtyDec = new Prisma.Decimal(input.quantity);
      const conversionSnapshot = new Prisma.Decimal(unit.conversionToBase);
      const baseQuantity = originalQtyDec.mul(conversionSnapshot);

      if (product.quantityPrecision === 0 && !baseQuantity.isInteger()) {
        throw new BadRequestException(
          `Product "${product.name}" requires integer whole units. Base quantity ${baseQuantity} is fractional.`,
        );
      }

      processed.push({
        productId: input.productId,
        batchId: input.batchId || null,
        quantity: originalQtyDec,
        unitId: unit.id,
        unitNameSnapshot: unit.unitName,
        conversionToBaseSnapshot: conversionSnapshot,
        baseQuantity,
      });
    }

    return processed;
  }

  /**
   * Helper to validate and calculate output lines.
   */
  private async processOutputs(
    outputs: ProductionOutputDto[],
    tx: Prisma.TransactionClient,
  ) {
    if (!outputs || outputs.length === 0) {
      throw new BadRequestException('At least one production output is required');
    }

    const processed = [];

    for (const output of outputs) {
      const product = await tx.product.findUnique({
        where: { id: output.productId },
        include: { units: true },
      });

      if (!product) {
        throw new NotFoundException(`Product ${output.productId} not found`);
      }

      if (product.status !== ProductStatus.APPROVED) {
        throw new BadRequestException(
          `Product "${product.name}" is not approved (status: ${product.status})`,
        );
      }

      // Tracking mode validation
      if (
        (product.trackingMode === 'BATCH_ONLY' || product.trackingMode === 'BOTH') &&
        !output.batchNumber
      ) {
        throw new BadRequestException(
          `Finished product "${product.name}" requires batchNumber`,
        );
      }

      const unit = product.units.find(
        (u) => u.id === output.unitId && u.status === 'ACTIVE',
      );
      if (!unit) {
        throw new NotFoundException(
          `Unit ${output.unitId} not found or not active for product ${product.name}`,
        );
      }

      const originalQtyDec = new Prisma.Decimal(output.quantity);
      const conversionSnapshot = new Prisma.Decimal(unit.conversionToBase);
      const baseQuantity = originalQtyDec.mul(conversionSnapshot);

      if (product.quantityPrecision === 0 && !baseQuantity.isInteger()) {
        throw new BadRequestException(
          `Product "${product.name}" requires integer whole units. Base quantity ${baseQuantity} is fractional.`,
        );
      }

      processed.push({
        productId: output.productId,
        batchNumber: output.batchNumber || null,
        expiryDate: output.expiryDate ? new Date(output.expiryDate) : null,
        quantity: originalQtyDec,
        unitId: unit.id,
        unitNameSnapshot: unit.unitName,
        conversionToBaseSnapshot: conversionSnapshot,
        baseQuantity,
      });
    }

    return processed;
  }

  /**
   * Create a production run draft without altering stock.
   */
  async createProductionRun(user: AuthenticatedUser, dto: CreateProductionRunDto) {
    let resolvedClientId = dto.clientId;

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.clientId) {
        throw new ForbiddenException('Client Admin is not assigned to any client');
      }
      resolvedClientId = dbUser.clientId;
    } else if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot create client production runs');
    } else if (user.role === UserRole.SUPER_ADMIN) {
      if (!resolvedClientId) {
        throw new BadRequestException('clientId is required for Super Admin creation');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const processedInputs = await this.processInputs(dto.inputs, tx);
      const processedOutputs = await this.processOutputs(dto.outputs, tx);

      return tx.productionRun.create({
        data: {
          clientId: resolvedClientId!,
          mode: dto.mode || ProductionMode.LINKED,
          status: ProductionStatus.DRAFT,
          productionReference: dto.productionReference || null,
          plannedOutput: dto.plannedOutput !== undefined ? new Prisma.Decimal(dto.plannedOutput) : null,
          actualOutput: dto.actualOutput !== undefined ? new Prisma.Decimal(dto.actualOutput) : null,
          wastage: dto.wastage !== undefined ? new Prisma.Decimal(dto.wastage) : null,
          notes: dto.notes || null,
          submittedById: user.id,
          inputs: { create: processedInputs },
          outputs: { create: processedOutputs },
        },
        include: {
          inputs: true,
          outputs: true,
        },
      });
    });
  }

  /**
   * Submit production run for Super Admin approval.
   * Validates raw material stock availability at the client's location.
   */
  async submitProductionRun(user: AuthenticatedUser, runId: string) {
    const run = await this.prisma.productionRun.findUnique({
      where: { id: runId },
      include: { inputs: true },
    });

    if (!run) {
      throw new NotFoundException(`Production run ${runId} not found`);
    }

    if (run.status !== ProductionStatus.DRAFT) {
      throw new ConflictException(`Production run ${runId} is not in DRAFT status`);
    }

    if (user.role !== UserRole.SUPER_ADMIN && run.submittedById !== user.id) {
      throw new ForbiddenException('Only the submitter can submit this production run');
    }

    // Get client stock location
    const clientLocation = await this.prisma.stockLocation.findUnique({
      where: { clientId: run.clientId },
    });

    if (!clientLocation) {
      throw new BadRequestException(`No stock location configured for client ${run.clientId}`);
    }

    // Validate raw material availability
    for (const input of run.inputs) {
      const balance = await this.prisma.inventoryBalance.findFirst({
        where: {
          locationId: clientLocation.id,
          productId: input.productId,
          batchId: input.batchId || null,
        },
      });

      const available = balance ? balance.usableQty.minus(balance.reservedQty) : new Prisma.Decimal(0);
      if (available.lessThan(input.baseQuantity)) {
        throw new BadRequestException(
          `Insufficient available raw material for product ${input.productId}. Available: ${available}, Required: ${input.baseQuantity}`,
        );
      }
    }

    return this.prisma.productionRun.update({
      where: { id: runId },
      data: {
        status: ProductionStatus.PENDING_APPROVAL,
        submittedAt: new Date(),
      },
      include: {
        inputs: true,
        outputs: true,
      },
    });
  }

  /**
   * Super Admin approves production run.
   * Linked: posts raw material deductions and finished product additions atomically. No partial posting!
   */
  async approveProductionRun(
    user: AuthenticatedUser,
    runId: string,
    dto: ApproveProductionRunDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve production runs');
    }

    const run = await this.prisma.productionRun.findUnique({
      where: { id: runId },
      include: { inputs: true, outputs: true },
    });

    if (!run) {
      throw new NotFoundException(`Production run ${runId} not found`);
    }

    // Idempotency: if already approved, return without double-posting
    if (run.status === ProductionStatus.APPROVED) {
      return run;
    }

    if (run.status !== ProductionStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Production run ${runId} is not awaiting approval (status: ${run.status})`,
      );
    }

    const clientLocation = await this.prisma.stockLocation.findUnique({
      where: { clientId: run.clientId },
    });

    if (!clientLocation) {
      throw new BadRequestException(`No stock location exists for client ${run.clientId}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Post raw material deductions (MANUFACTURING_INPUT) in shared atomic transaction
      await this.ledgerService.postTransaction(
        {
          transactionType: TransactionType.MANUFACTURING_INPUT,
          idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}-inputs` : `prod-input-${run.id}`,
          sourceRefType: 'PRODUCTION_RUN',
          sourceRefId: run.id,
          lines: run.inputs.map((input) => ({
            locationId: clientLocation.id,
            productId: input.productId,
            batchId: input.batchId || undefined,
            condition: StockCondition.USABLE,
            quantity: input.quantity.toNumber(),
            unitName: input.unitNameSnapshot,
            direction: 'OUT' as const,
          })),
        },
        user.id,
        tx,
      );

      // 2. Resolve or create batches for outputs if batchNumber specified
      const outputLinesForPosting = [];
      for (const output of run.outputs) {
        let batchId: string | undefined = undefined;

        if (output.batchNumber) {
          let batch = await tx.stockBatch.findUnique({
            where: {
              productId_batchNumber: {
                productId: output.productId,
                batchNumber: output.batchNumber.trim(),
              },
            },
          });

          if (!batch) {
            batch = await tx.stockBatch.create({
              data: {
                productId: output.productId,
                batchNumber: output.batchNumber.trim(),
                expiryDate: output.expiryDate,
              },
            });
          }
          batchId = batch.id;
        }

        outputLinesForPosting.push({
          locationId: clientLocation.id,
          productId: output.productId,
          batchId,
          condition: StockCondition.USABLE,
          quantity: output.quantity.toNumber(),
          unitName: output.unitNameSnapshot,
          direction: 'IN' as const,
        });
      }

      // 3. Post finished goods additions (MANUFACTURING_OUTPUT) in the SAME atomic transaction!
      await this.ledgerService.postTransaction(
        {
          transactionType: TransactionType.MANUFACTURING_OUTPUT,
          idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}-outputs` : `prod-output-${run.id}`,
          sourceRefType: 'PRODUCTION_RUN',
          sourceRefId: run.id,
          lines: outputLinesForPosting,
        },
        user.id,
        tx,
      );

      // 4. Update production run status to APPROVED
      return tx.productionRun.update({
        where: { id: runId },
        data: {
          status: ProductionStatus.APPROVED,
          approvedById: user.id,
          approvedAt: new Date(),
        },
        include: {
          inputs: true,
          outputs: true,
        },
      });
    });
  }

  /**
   * Super Admin rejects production run. Requires mandatory reason.
   */
  async rejectProductionRun(
    user: AuthenticatedUser,
    runId: string,
    dto: RejectProductionRunDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can reject production runs');
    }

    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('A non-empty reason is required for rejection');
    }

    const run = await this.prisma.productionRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Production run ${runId} not found`);
    }

    if (run.status !== ProductionStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Production run ${runId} cannot be rejected in status ${run.status}`,
      );
    }

    const updatedNotes = run.notes
      ? `${run.notes} | Rejected: ${dto.reason}`
      : `Rejected: ${dto.reason}`;

    return this.prisma.productionRun.update({
      where: { id: runId },
      data: {
        status: ProductionStatus.REJECTED,
        notes: updatedNotes,
      },
    });
  }

  /**
   * List production runs scoped to caller role.
   */
  async getProductionRuns(user: AuthenticatedUser, status?: ProductionStatus) {
    const where: Prisma.ProductionRunWhereInput = {};
    if (status) {
      where.status = status;
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.clientId) return [];
      where.clientId = dbUser.clientId;
    } else if (user.role === UserRole.STORE_ADMIN) {
      return []; // Manufacturing is client-scoped
    }

    return this.prisma.productionRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        inputs: {
          include: { product: { select: { id: true, name: true } } },
        },
        outputs: {
          include: { product: { select: { id: true, name: true } } },
        },
        client: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, username: true } },
      },
    });
  }

  async getProductionRunById(user: AuthenticatedUser, runId: string) {
    const run = await this.prisma.productionRun.findUnique({
      where: { id: runId },
      include: {
        inputs: {
          include: { product: { select: { id: true, name: true } } },
        },
        outputs: {
          include: { product: { select: { id: true, name: true } } },
        },
        client: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
      },
    });

    if (!run) {
      throw new NotFoundException(`Production run ${runId} not found`);
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (run.clientId !== dbUser?.clientId) {
        throw new ForbiddenException('Cannot view production run for another client');
      }
    } else if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot view client production runs');
    }

    return run;
  }
}
