import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LedgerService } from '../inventory/ledger.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  UserRole,
  ProductionStatus,
  ProductionMode,
  ProductStatus,
  ProductKind,
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
import {
  SubmitProductionRunBatchDto,
  DecideProductionRunBatchDto,
} from './dto/batch-production-run.dto.js';
import { ReRunCycleDto } from './dto/re-run-cycle.dto.js';
import { QueryManufacturingAnalyticsDto } from './dto/query-manufacturing-analytics.dto.js';

@Injectable()
export class ManufacturingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Helper to validate and calculate input lines.
   */
  private async processInputs(
    inputs: ProductionInputDto[],
    tx: Prisma.TransactionClient,
    clientId: string,
  ) {
    if (!inputs || inputs.length === 0) {
      throw new BadRequestException(
        'At least one production input is required',
      );
    }

    const clientLocation = await tx.stockLocation.findUnique({
      where: { clientId },
    });
    if (!clientLocation) {
      throw new BadRequestException(
        'This client has no stock location configured',
      );
    }
    const inputProductIds = [
      ...new Set(inputs.map((input) => input.productId)),
    ];
    const [balances, ledgerEntries] = await Promise.all([
      tx.inventoryBalance.findMany({
        where: {
          locationId: clientLocation.id,
          productId: { in: inputProductIds },
        },
        select: { productId: true },
        distinct: ['productId'],
      }),
      tx.ledgerEntry.findMany({
        where: {
          locationId: clientLocation.id,
          productId: { in: inputProductIds },
        },
        select: { productId: true },
        distinct: ['productId'],
      }),
    ]);
    const stockedProductIds = new Set(
      [...balances, ...ledgerEntries].map(({ productId }) => productId),
    );
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
      if (product.kind !== ProductKind.RAW_MATERIAL) {
        throw new BadRequestException(
          `Manufacturing input "${product.name}" must be a raw material`,
        );
      }
      if (product.ownerScope === 'CLIENT' && product.clientId !== clientId) {
        throw new ForbiddenException(
          'Cannot use another client’s raw material',
        );
      }
      if (!stockedProductIds.has(product.id)) {
        throw new BadRequestException(
          `Raw material "${product.name}" has never been stocked at this client`,
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
    clientId: string,
  ) {
    if (!outputs || outputs.length === 0) {
      throw new BadRequestException(
        'At least one production output is required',
      );
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
      if (product.kind !== ProductKind.MANUFACTURED_PRODUCT) {
        throw new BadRequestException(
          `Manufacturing output "${product.name}" must be a manufactured product`,
        );
      }
      if (product.ownerScope !== 'CLIENT' || product.clientId !== clientId) {
        throw new ForbiddenException(
          'Manufacturing outputs must belong to this client’s catalog',
        );
      }

      // Tracking mode validation
      if (
        (product.trackingMode === 'BATCH_ONLY' ||
          product.trackingMode === 'BOTH') &&
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
  async createProductionRun(
    user: AuthenticatedUser,
    dto: CreateProductionRunDto,
  ) {
    let resolvedClientId = dto.clientId;

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
      });
      if (!dbUser?.clientId) {
        throw new ForbiddenException(
          'Client Admin is not assigned to any client',
        );
      }
      resolvedClientId = dbUser.clientId;
    } else if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException(
        'Store Admin cannot create client production runs',
      );
    } else if (user.role === UserRole.SUPER_ADMIN) {
      if (!resolvedClientId) {
        throw new BadRequestException(
          'clientId is required for Super Admin creation',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const processedInputs = await this.processInputs(
        dto.inputs,
        tx,
        resolvedClientId!,
      );
      const processedOutputs = await this.processOutputs(
        dto.outputs,
        tx,
        resolvedClientId!,
      );

      return tx.productionRun.create({
        data: {
          clientId: resolvedClientId!,
          mode: dto.mode || ProductionMode.LINKED,
          status: ProductionStatus.DRAFT,
          productionReference: dto.productionReference || null,
          plannedOutput:
            dto.plannedOutput !== undefined
              ? new Prisma.Decimal(dto.plannedOutput)
              : null,
          actualOutput:
            dto.actualOutput !== undefined
              ? new Prisma.Decimal(dto.actualOutput)
              : null,
          wastage:
            dto.wastage !== undefined ? new Prisma.Decimal(dto.wastage) : null,
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

  /** Update an owned draft in place. Draft edits never post inventory. */
  async updateProductionRun(
    user: AuthenticatedUser,
    runId: string,
    dto: CreateProductionRunDto,
  ) {
    if (user.role !== UserRole.CLIENT_ADMIN) {
      throw new ForbiddenException(
        'Only the Client Admin can edit their production draft',
      );
    }
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!dbUser?.clientId) {
      throw new ForbiddenException(
        'Client Admin is not assigned to any client',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM production_runs WHERE id = ${runId} FOR UPDATE`;
      const run = await tx.productionRun.findUnique({
        where: { id: runId },
      });
      if (!run)
        throw new NotFoundException(`Production run ${runId} not found`);
      if (run.clientId !== dbUser.clientId || run.submittedById !== user.id) {
        throw new ForbiddenException(
          'You can only edit your own production drafts',
        );
      }
      if (run.status !== ProductionStatus.DRAFT) {
        throw new ConflictException(
          'Only production runs in Draft can be edited',
        );
      }

      const inputs = await this.processInputs(dto.inputs, tx, run.clientId);
      const outputs = await this.processOutputs(dto.outputs, tx, run.clientId);
      const claimed = await tx.productionRun.updateMany({
        where: {
          id: runId,
          clientId: dbUser.clientId,
          submittedById: user.id,
          status: ProductionStatus.DRAFT,
        },
        data: {
          mode: dto.mode || ProductionMode.LINKED,
          productionReference: dto.productionReference || null,
          plannedOutput:
            dto.plannedOutput !== undefined
              ? new Prisma.Decimal(dto.plannedOutput)
              : null,
          actualOutput:
            dto.actualOutput !== undefined
              ? new Prisma.Decimal(dto.actualOutput)
              : null,
          wastage:
            dto.wastage !== undefined ? new Prisma.Decimal(dto.wastage) : null,
          notes: dto.notes || null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'This production draft has changed. Refresh and try again.',
        );
      }
      await tx.productionInput.deleteMany({
        where: { productionRunId: runId },
      });
      await tx.productionOutput.deleteMany({
        where: { productionRunId: runId },
      });
      await tx.productionInput.createMany({
        data: inputs.map((input) => ({ ...input, productionRunId: runId })),
      });
      await tx.productionOutput.createMany({
        data: outputs.map((output) => ({ ...output, productionRunId: runId })),
      });

      return tx.productionRun.findUnique({
        where: { id: runId },
        include: { inputs: true, outputs: true },
      });
    });
  }

  /** Delete an owned draft. Drafts have no inventory or ledger effect. */
  async deleteProductionRun(user: AuthenticatedUser, runId: string) {
    if (user.role !== UserRole.CLIENT_ADMIN) {
      throw new ForbiddenException(
        'Only the Client Admin can delete their production draft',
      );
    }
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!dbUser?.clientId) {
      throw new ForbiddenException(
        'Client Admin is not assigned to any client',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM production_runs WHERE id = ${runId} FOR UPDATE`;
      const run = await tx.productionRun.findUnique({ where: { id: runId } });
      if (!run)
        throw new NotFoundException(`Production run ${runId} not found`);
      if (run.clientId !== dbUser.clientId || run.submittedById !== user.id) {
        throw new ForbiddenException(
          'You can only delete your own production drafts',
        );
      }
      if (run.status !== ProductionStatus.DRAFT) {
        throw new ConflictException(
          'Only production runs in Draft can be deleted',
        );
      }

      const deleted = await tx.productionRun.deleteMany({
        where: {
          id: runId,
          clientId: dbUser.clientId,
          submittedById: user.id,
          status: ProductionStatus.DRAFT,
        },
      });
      if (deleted.count !== 1) {
        throw new ConflictException(
          'This production draft has changed. Refresh and try again.',
        );
      }
    });

    return { success: true };
  }

  /**
   * Internal helper to validate and transition a single production run draft to PENDING_APPROVAL.
   */
  private async submitProductionRunInternal(
    user: AuthenticatedUser,
    runId: string,
    batchNotes?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM production_runs WHERE id = ${runId} FOR UPDATE`;
      const run = await tx.productionRun.findUnique({
        where: { id: runId },
        include: { inputs: { include: { product: true } } },
      });
      if (!run) {
        throw new NotFoundException(`Production run ${runId} not found`);
      }
      if (run.status !== ProductionStatus.DRAFT) {
        throw new ConflictException(
          `Production run ${runId} is not in DRAFT status`,
        );
      }

      // If actualOutput is not yet explicitly set, auto-default to plannedOutput so user is not blocked
      let effectiveActualOutput = run.actualOutput;
      if (!effectiveActualOutput || !effectiveActualOutput.greaterThan(0)) {
        if (run.plannedOutput && run.plannedOutput.greaterThan(0)) {
          effectiveActualOutput = run.plannedOutput;
          await tx.productionRun.update({
            where: { id: runId },
            data: { actualOutput: effectiveActualOutput },
          });
          await tx.productionOutput.updateMany({
            where: { productionRunId: runId },
            data: { quantity: effectiveActualOutput },
          });
        } else {
          throw new BadRequestException(
            `Enter the actual finished quantity before submitting production run "${run.productionReference || runId}"`,
          );
        }
      }

      if (user.role !== UserRole.SUPER_ADMIN && run.submittedById !== user.id) {
        throw new ForbiddenException(
          'Only the submitter can submit this production run',
        );
      }

      const clientLocation = await tx.stockLocation.findUnique({
        where: { clientId: run.clientId },
      });
      if (!clientLocation) {
        throw new BadRequestException(
          `No stock location configured for client ${run.clientId}`,
        );
      }
      for (const input of run.inputs) {
        let available = new Prisma.Decimal(0);
        if (input.batchId) {
          const balance = await tx.inventoryBalance.findFirst({
            where: {
              locationId: clientLocation.id,
              productId: input.productId,
              batchId: input.batchId,
            },
          });
          available = balance
            ? balance.usableQty.minus(balance.reservedQty)
            : new Prisma.Decimal(0);
        } else {
          // Check aggregate available usable stock across all batches at this location
          const balances = await tx.inventoryBalance.findMany({
            where: {
              locationId: clientLocation.id,
              productId: input.productId,
            },
          });
          if (balances && balances.length > 0) {
            for (const b of balances) {
              const availInBatch = b.usableQty.minus(b.reservedQty);
              if (availInBatch.greaterThan(0)) {
                available = available.plus(availInBatch);
              }
            }
          } else {
            const fallback = await tx.inventoryBalance.findFirst({
              where: {
                locationId: clientLocation.id,
                productId: input.productId,
              },
            });
            available = fallback
              ? fallback.usableQty.minus(fallback.reservedQty)
              : new Prisma.Decimal(0);
          }
        }

        if (available.lessThan(input.baseQuantity)) {
          throw new BadRequestException(
            `Insufficient available raw material for "${input.product?.name || 'Selected product'}". Available: ${available}, Required: ${input.baseQuantity}`,
          );
        }
      }

      const updatedNotes = batchNotes
        ? run.notes
          ? `${run.notes} | ${batchNotes}`
          : batchNotes
        : run.notes;

      return tx.productionRun.update({
        where: { id: runId },
        data: {
          status: ProductionStatus.PENDING_APPROVAL,
          submittedAt: new Date(),
          notes: updatedNotes,
        },
        include: { inputs: true, outputs: true },
      });
    });
  }

  /**
   * Submit single production run for Super Admin approval.
   * Validates raw material stock availability at the client's location.
   */
  async submitProductionRun(user: AuthenticatedUser, runId: string) {
    const settings = await this.notificationsService.getSettings?.();
    const requiresApproval = settings?.approvalRequirements?.manufacturing ?? true;
    const submitted = await this.submitProductionRunInternal(user, runId);
    if (!requiresApproval) return this.approveProductionRun(user, runId, {}, true);
    await this.notificationsService.notifySuperAdmins(
      'Production run awaiting approval',
      'A client submitted a manufacturing run for review.',
      'PRODUCTION_RUN',
      runId,
    );
    return submitted;
  }

  /**
   * Submit multiple production runs as a single Day-End batch.
   * Diagnostic production runs recorded continuously during the day can be bundled
   * and submitted for single Super Admin approval.
   */
  async submitProductionRunBatch(
    user: AuthenticatedUser,
    dto: SubmitProductionRunBatchDto,
  ) {
    if (!dto.runIds || dto.runIds.length === 0) {
      throw new BadRequestException('At least one production run must be selected');
    }

    const settings = await this.notificationsService.getSettings?.();
    const requiresApproval = settings?.approvalRequirements?.manufacturing ?? true;

    const submittedRuns = [];
    for (const runId of dto.runIds) {
      const submitted = await this.submitProductionRunInternal(
        user,
        runId,
        dto.batchNotes,
      );
      submittedRuns.push(submitted);
    }

    if (!requiresApproval) {
      const approvedResults = [];
      for (const run of submittedRuns) {
        const approved = await this.approveProductionRun(user, run.id, {}, true);
        approvedResults.push(approved);
      }
      return {
        count: approvedResults.length,
        status: 'POSTED',
        runs: approvedResults,
      };
    }

    await this.notificationsService.notifySuperAdmins(
      'Day-End production batch awaiting approval',
      `Client submitted ${submittedRuns.length} continuous production runs for single day-end approval.`,
      'PRODUCTION_RUN',
      submittedRuns[0]?.id || '',
    );

    return {
      count: submittedRuns.length,
      status: 'PENDING_APPROVAL',
      runs: submittedRuns,
    };
  }

  /**
   * Super Admin approves multiple production runs together (Day-End batch).
   * Atomically executes inventory postings for each run.
   */
  async approveProductionRunBatch(
    user: AuthenticatedUser,
    dto: DecideProductionRunBatchDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only Super Admin can approve production runs',
      );
    }
    if (!dto.runIds || dto.runIds.length === 0) {
      throw new BadRequestException(
        'At least one production run must be provided',
      );
    }

    const results = [];
    for (const runId of dto.runIds) {
      const approved = await this.approveProductionRun(user, runId, {
        idempotencyKey: dto.idempotencyKey
          ? `${dto.idempotencyKey}-${runId}`
          : undefined,
      });
      results.push(approved);
    }

    return {
      count: results.length,
      status: 'APPROVED',
      runs: results,
    };
  }

  /**
   * Super Admin rejects multiple production runs together.
   */
  async rejectProductionRunBatch(
    user: AuthenticatedUser,
    dto: DecideProductionRunBatchDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only Super Admin can reject production runs',
      );
    }
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('A non-empty reason is required for rejection');
    }
    if (!dto.runIds || dto.runIds.length === 0) {
      throw new BadRequestException(
        'At least one production run must be provided',
      );
    }

    const results = [];
    for (const runId of dto.runIds) {
      const rejected = await this.rejectProductionRun(user, runId, {
        reason: dto.reason,
      });
      results.push(rejected);
    }

    return {
      count: results.length,
      status: 'REJECTED',
      runs: results,
    };
  }

  /**
   * Super Admin approves production run.
   * Linked: posts raw material deductions and finished product additions atomically. No partial posting!
   */
  async approveProductionRun(
    user: AuthenticatedUser,
    runId: string,
    dto: ApproveProductionRunDto,
    automated = false,
  ) {
    if (!automated && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only Super Admin can approve production runs',
      );
    }

    const run = await this.prisma.productionRun.findUnique({
      where: { id: runId },
      include: { inputs: true, outputs: true },
    });

    if (!run) {
      throw new NotFoundException(`Production run ${runId} not found`);
    }

    // Idempotency: if already approved, return without double-posting
    if (run.status === ProductionStatus.APPROVED || run.status === ProductionStatus.POSTED) {
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
      throw new BadRequestException(
        `No stock location exists for client ${run.clientId}`,
      );
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      const referencedProductIds = [
        ...new Set([
          ...run.inputs.map((input) => input.productId),
          ...run.outputs.map((output) => output.productId),
        ]),
      ];
      const referencedProducts = await tx.product.findMany({
        where: { id: { in: referencedProductIds } },
        select: {
          id: true,
          name: true,
          kind: true,
          status: true,
          ownerScope: true,
          clientId: true,
        },
      });
      const productsById = new Map(
        referencedProducts.map((product) => [product.id, product]),
      );
      for (const input of run.inputs) {
        const product = productsById.get(input.productId);
        if (
          !product ||
          product.kind !== ProductKind.RAW_MATERIAL ||
          product.status !== ProductStatus.APPROVED ||
          (product.ownerScope === 'CLIENT' && product.clientId !== run.clientId)
        ) {
          throw new BadRequestException(
            `Manufacturing input "${product?.name || 'Selected product'}" must be an approved raw material`,
          );
        }
      }
      for (const output of run.outputs) {
        const product = productsById.get(output.productId);
        if (
          !product ||
          product.kind !== ProductKind.MANUFACTURED_PRODUCT ||
          product.status !== ProductStatus.APPROVED ||
          product.ownerScope !== 'CLIENT' ||
          product.clientId !== run.clientId
        ) {
          throw new BadRequestException(
            `Manufacturing output "${product?.name || 'Selected product'}" must be an approved manufactured product`,
          );
        }
      }

      // 1. Post raw material deductions (MANUFACTURING_INPUT) in shared atomic transaction
      const inputPostingLines = [];
      for (const input of run.inputs) {
        if (input.batchId) {
          inputPostingLines.push({
            locationId: clientLocation.id,
            productId: input.productId,
            batchId: input.batchId,
            condition: StockCondition.USABLE,
            quantity: input.quantity.toNumber(),
            unitName: input.unitNameSnapshot,
            direction: 'OUT' as const,
          });
        } else {
          // If no specific batch was pre-selected, resolve available batches at location (FEFO)
          const balances = await tx.inventoryBalance.findMany({
            where: {
              locationId: clientLocation.id,
              productId: input.productId,
            },
            include: { batch: true },
          });

          const usableBalances = (balances || []).filter((b) =>
            b.usableQty.minus(b.reservedQty).greaterThan(0),
          );

          if (usableBalances.length > 0) {
            usableBalances.sort((a, b) => {
              if (a.batch?.expiryDate && b.batch?.expiryDate) {
                return a.batch.expiryDate.getTime() - b.batch.expiryDate.getTime();
              }
              if (a.batch?.expiryDate) return -1;
              if (b.batch?.expiryDate) return 1;
              return 0;
            });

            let remainingToDeduct = input.baseQuantity;
            const conv =
              input.conversionToBaseSnapshot && !input.conversionToBaseSnapshot.isZero()
                ? input.conversionToBaseSnapshot
                : new Prisma.Decimal(1);

            for (const b of usableBalances) {
              const avail = b.usableQty.minus(b.reservedQty);
              if (avail.greaterThan(0) && remainingToDeduct.greaterThan(0)) {
                const deductBase = avail.greaterThanOrEqualTo(remainingToDeduct)
                  ? remainingToDeduct
                  : avail;
                const deductInOriginalUnit = deductBase.dividedBy(conv);
                inputPostingLines.push({
                  locationId: clientLocation.id,
                  productId: input.productId,
                  batchId: b.batchId || undefined,
                  condition: StockCondition.USABLE,
                  quantity: deductInOriginalUnit.toNumber(),
                  unitName: input.unitNameSnapshot,
                  direction: 'OUT' as const,
                });
                remainingToDeduct = remainingToDeduct.minus(deductBase);
              }
            }

            if (remainingToDeduct.greaterThan(0)) {
              const deductInOriginalUnit = remainingToDeduct.dividedBy(conv);
              inputPostingLines.push({
                locationId: clientLocation.id,
                productId: input.productId,
                batchId: undefined,
                condition: StockCondition.USABLE,
                quantity: deductInOriginalUnit.toNumber(),
                unitName: input.unitNameSnapshot,
                direction: 'OUT' as const,
              });
            }
          } else {
            inputPostingLines.push({
              locationId: clientLocation.id,
              productId: input.productId,
              batchId: undefined,
              condition: StockCondition.USABLE,
              quantity: input.quantity.toNumber(),
              unitName: input.unitNameSnapshot,
              direction: 'OUT' as const,
            });
          }
        }
      }

      await this.ledgerService.postTransaction(
        {
          transactionType: TransactionType.MANUFACTURING_INPUT,
          idempotencyKey: dto.idempotencyKey
            ? `${dto.idempotencyKey}-inputs`
            : `prod-input-${run.id}`,
          sourceRefType: 'PRODUCTION_RUN',
          sourceRefId: run.id,
          lines: inputPostingLines,
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
          idempotencyKey: dto.idempotencyKey
            ? `${dto.idempotencyKey}-outputs`
            : `prod-output-${run.id}`,
          sourceRefType: 'PRODUCTION_RUN',
          sourceRefId: run.id,
          lines: outputLinesForPosting,
        },
        user.id,
        tx,
      );

      if (automated) {
        await tx.auditEvent.create({ data: {
          actorUserId: user.id,
          action: 'PRODUCTION_AUTO_POSTED',
          entityType: 'PRODUCTION_RUN',
          entityId: runId,
          reason: 'Super Admin approval settings allow immediate posting for manufacturing.',
        } });
      }

      // 4. Update production run status after the atomic ledger posting
      return tx.productionRun.update({
        where: { id: runId },
        data: {
          status: automated ? ProductionStatus.POSTED : ProductionStatus.APPROVED,
          approvedById: automated ? null : user.id,
          approvedAt: new Date(),
        },
        include: {
          inputs: true,
          outputs: true,
        },
      });
    });
    await this.notificationsService.notifyClientAdmins(
      run.clientId,
      'Production run approved',
      'Your production run was approved and inventory was updated.',
      'PRODUCTION_RUN',
      run.id,
    );
    return approved;
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
      throw new ForbiddenException(
        'Only Super Admin can reject production runs',
      );
    }

    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException(
        'A non-empty reason is required for rejection',
      );
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

    const rejected = await this.prisma.productionRun.update({
      where: { id: runId },
      data: {
        status: ProductionStatus.REJECTED,
        notes: updatedNotes,
      },
    });
    await this.notificationsService.notifyUser(
      run.submittedById,
      'Production run rejected',
      `Your production run was rejected. Reason: ${dto.reason}`,
      'PRODUCTION_RUN',
      run.id,
    );
    return rejected;
  }

  /**
   * List production runs scoped to caller role.
   */
  async getProductionRuns(
    user: AuthenticatedUser,
    status?: ProductionStatus,
    clientId?: string,
  ) {
    const where: Prisma.ProductionRunWhereInput = {};
    if (status) {
      where.status = status;
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
      });
      if (!dbUser?.clientId) return [];
      where.clientId = dbUser.clientId;
    } else if (user.role === UserRole.STORE_ADMIN) {
      return []; // Manufacturing is client-scoped
    } else if (user.role === UserRole.SUPER_ADMIN && clientId) {
      where.clientId = clientId;
    }

    const runs = await this.prisma.productionRun.findMany({
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

    return runs.map((r) => this.formatProductionRun(r));
  }

  private formatProductionRun(run: any) {
    if (!run) return run;
    const runNumber =
      run.runNumber ||
      (run.id ? `RUN-${run.id.substring(0, 8).toUpperCase()}` : 'RUN-UNKNOWN');
    const clientName = run.client?.name || 'Client Facility';
    const inputs = (run.inputs || []).map((i: any) => ({
      ...i,
      unit: i.unitNameSnapshot,
      productName: i.product?.name || i.productName || 'Raw Material',
    }));
    const outputs = (run.outputs || []).map((o: any) => ({
      ...o,
      unit: o.unitNameSnapshot,
      productName: o.product?.name || o.productName || 'Yield Product',
    }));
    const yieldProductName =
      outputs[0]?.productName || run.yieldProductName || 'Finished Product';

    return {
      ...run,
      runNumber,
      clientName,
      plannedQuantity:
        run.plannedOutput?.toNumber?.() ?? run.plannedOutput ?? 0,
      actualQuantity:
        run.actualOutput?.toNumber?.() ?? run.actualOutput ?? null,
      rejectionReason:
        run.status === ProductionStatus.REJECTED
          ? run.notes?.match(/Rejected: (.*)$/)?.[1] || run.notes || null
          : null,
      inputs,
      inputLines: inputs,
      outputs,
      outputLines: outputs,
      yieldProductName,
    };
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
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
      });
      if (run.clientId !== dbUser?.clientId) {
        throw new ForbiddenException(
          'Cannot view production run for another client',
        );
      }
    } else if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException(
        'Store Admin cannot view client production runs',
      );
    }

    return this.formatProductionRun(run);
  }

  /**
   * Get distinct production cycles with finished product stock levels,
   * replenishment alert status, and formula readiness.
   */
  async getProductionCycles(user: AuthenticatedUser) {
    let clientId: string | undefined;

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
      });
      if (!dbUser?.clientId) return [];
      clientId = dbUser.clientId;
    } else if (user.role === UserRole.STORE_ADMIN) {
      return [];
    }

    const where: Prisma.ProductionRunWhereInput = {};
    if (clientId) {
      where.clientId = clientId;
    }

    const runs = await this.prisma.productionRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        inputs: {
          include: {
            product: { select: { id: true, name: true } },
            unit: { select: { id: true, unitName: true } },
          },
        },
        outputs: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                minQuantity: true,
              },
            },
            unit: { select: { id: true, unitName: true } },
          },
        },
        client: { select: { id: true, name: true } },
      },
    });

    if (!runs || runs.length === 0) {
      return [];
    }

    const clientIds = [...new Set(runs.map((r) => r.clientId))];
    const clientLocations = await this.prisma.stockLocation.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true, clientId: true },
    });
    const locationMap = new Map(clientLocations.map((l) => [l.clientId, l.id]));

    const allLocationIds = clientLocations.map((l) => l.id);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { locationId: { in: allLocationIds } },
      select: {
        locationId: true,
        productId: true,
        usableQty: true,
        reservedQty: true,
      },
    });

    const getAvailableStock = (locId: string | undefined, prodId: string): Prisma.Decimal => {
      if (!locId) return new Prisma.Decimal(0);
      const productBalances = balances.filter(
        (b) => b.locationId === locId && b.productId === prodId,
      );
      return productBalances.reduce(
        (sum, b) => sum.add(b.usableQty.minus(b.reservedQty)),
        new Prisma.Decimal(0),
      );
    };

    const cyclesMap = new Map<string, any>();

    for (const run of runs) {
      const output = run.outputs[0];
      const outputProduct = output?.product;
      const ref = run.productionReference || outputProduct?.name || 'Standard Cycle';
      const key = `${run.clientId}_${outputProduct?.id || ref}`;

      if (!cyclesMap.has(key)) {
        const locId = locationMap.get(run.clientId);
        const currentStockDecimal = outputProduct
          ? getAvailableStock(locId, outputProduct.id)
          : new Prisma.Decimal(0);
        const currentStock = currentStockDecimal.toNumber();
        const minQuantity = outputProduct?.minQuantity
          ? Number(outputProduct.minQuantity)
          : 0;
        const isLowStock = currentStock <= minQuantity;
        const isOutOfStock = currentStock <= 0;

        let hasSufficientRawMaterials = true;
        const recipeInputs = run.inputs.map((inp) => {
          const availRaw = getAvailableStock(locId, inp.productId).toNumber();
          const reqQty = inp.baseQuantity ? inp.baseQuantity.toNumber() : Number(inp.quantity);
          const isAvailable = availRaw >= reqQty;
          if (!isAvailable) {
            hasSufficientRawMaterials = false;
          }
          return {
            productId: inp.productId,
            productName: inp.product?.name || 'Raw Material',
            sku: null,
            quantity: Number(inp.quantity),
            baseQuantity: reqQty,
            unitName: inp.unit?.unitName || inp.unitNameSnapshot,
            currentAvailableStock: availRaw,
            isStockSufficient: isAvailable,
          };
        });

        cyclesMap.set(key, {
          cycleKey: key,
          cycleReference: ref,
          clientId: run.clientId,
          clientName: run.client?.name || 'Client',
          outputProductId: outputProduct?.id || null,
          outputProductName: outputProduct?.name || 'Finished Product',
          outputProductSku: null,
          latestRunId: run.id,
          latestRunNumber: `RUN-${run.id.substring(0, 8).toUpperCase()}`,
          totalExecutions: 1,
          lastExecutedAt: run.submittedAt || run.createdAt,
          lastStatus: run.status,
          currentStock,
          minQuantity,
          isLowStock,
          isOutOfStock,
          canRunNow: hasSufficientRawMaterials,
          hasSufficientRawMaterials,
          plannedOutput: run.plannedOutput ? run.plannedOutput.toNumber() : 1,
          unitName: output?.unit?.unitName || output?.unitNameSnapshot || 'Units',
          recipeInputs,
        });
      } else {
        const existing = cyclesMap.get(key);
        existing.totalExecutions += 1;
      }
    }

    return Array.from(cyclesMap.values()).sort((a, b) => {
      if (a.isOutOfStock !== b.isOutOfStock) return a.isOutOfStock ? -1 : 1;
      if (a.isLowStock !== b.isLowStock) return a.isLowStock ? -1 : 1;
      return new Date(b.lastExecutedAt).getTime() - new Date(a.lastExecutedAt).getTime();
    });
  }

  /**
   * Re-run an existing production cycle: creates a new DRAFT production run
   * with the exact formulation recipe, fresh batch number, and optional quantity overrides.
   */
  async reRunCycle(
    user: AuthenticatedUser,
    runId: string,
    dto?: ReRunCycleDto,
  ) {
    const original = await this.prisma.productionRun.findUnique({
      where: { id: runId },
      include: {
        inputs: { include: { unit: true, product: true } },
        outputs: { include: { unit: true, product: true } },
        client: true,
      },
    });

    if (!original) {
      throw new NotFoundException(`Production run ${runId} not found`);
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
      });
      if (original.clientId !== dbUser?.clientId) {
        throw new ForbiddenException(
          'Cannot re-run a production run belonging to another client',
        );
      }
    } else if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException(
        'Store Admin cannot execute client production cycles',
      );
    }

    if (!original.inputs || original.inputs.length === 0) {
      throw new BadRequestException('Original production run has no inputs');
    }
    if (!original.outputs || original.outputs.length === 0) {
      throw new BadRequestException('Original production run has no outputs');
    }

    const previousPlanned = original.plannedOutput ? original.plannedOutput.toNumber() : null;
    const newPlanned = dto?.plannedOutput !== undefined ? dto.plannedOutput : previousPlanned;
    const ratio = previousPlanned && newPlanned && previousPlanned > 0
      ? newPlanned / previousPlanned
      : 1;

    const processedInputs: ProductionInputDto[] = original.inputs.map((inp) => {
      const scaledQty = Number(inp.quantity) * ratio;
      return {
        productId: inp.productId,
        unitId: inp.unitId,
        quantity: Math.round(scaledQty * 10000) / 10000,
        batchId: inp.batchId || undefined,
      };
    });

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const batchNumber = dto?.batchNumber || `BATCH-${dateStr}-${randSuffix}`;

    const processedOutputs: ProductionOutputDto[] = original.outputs.map((out) => {
      const outQty = newPlanned !== null ? newPlanned : Number(out.quantity);
      return {
        productId: out.productId,
        unitId: out.unitId,
        quantity: Math.round(outQty * 10000) / 10000,
        batchNumber,
        expiryDate: dto?.expiryDate || (out.expiryDate ? out.expiryDate.toISOString() : undefined),
      };
    });

    const ref = original.productionReference || `CYCLE-${original.outputs[0]?.product?.name || 'PROD'}`;

    return this.createProductionRun(user, {
      clientId: original.clientId,
      mode: original.mode,
      productionReference: ref,
      plannedOutput: newPlanned !== null ? newPlanned : undefined,
      notes: dto?.notes || `Cycle re-run based on ${ref} (${original.id.substring(0, 8)})`,
      inputs: processedInputs,
      outputs: processedOutputs,
    });
  }

  /**
   * Comprehensive analytics and reporting for production cycles and execution history.
   * Scoped for Client Admin, enterprise-wide for Super Admin.
   */
  async getManufacturingAnalytics(
    user: AuthenticatedUser,
    query?: QueryManufacturingAnalyticsDto,
  ) {
    let resolvedClientId = query?.clientId;

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
      });
      if (!dbUser?.clientId) {
        return {
          summary: {
            totalCycles: 0,
            totalRuns: 0,
            approvedRuns: 0,
            pendingRuns: 0,
            draftRuns: 0,
            rejectedRuns: 0,
            totalProduced: 0,
            totalPlanned: 0,
            avgYieldEfficiency: 0,
            totalWastage: 0,
            wastageRate: 0,
            lowStockCyclesCount: 0,
          },
          cycleBreakdown: [],
          materialConsumption: [],
          executionHistory: [],
        };
      }
      resolvedClientId = dbUser.clientId;
    } else if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException(
        'Store Admin cannot access manufacturing analytics',
      );
    }

    const where: Prisma.ProductionRunWhereInput = {};
    if (resolvedClientId) {
      where.clientId = resolvedClientId;
    }
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const runs = await this.prisma.productionRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        inputs: {
          include: {
            product: { select: { id: true, name: true } },
            unit: { select: { id: true, unitName: true } },
          },
        },
        outputs: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                minQuantity: true,
              },
            },
            unit: { select: { id: true, unitName: true } },
          },
        },
        client: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
      },
    });

    const totalRuns = runs.length;
    let approvedRuns = 0;
    let pendingRuns = 0;
    let draftRuns = 0;
    let rejectedRuns = 0;
    let totalProduced = 0;
    let totalPlanned = 0;
    let totalWastage = 0;

    const cycleStatsMap = new Map<string, any>();
    const materialConsumptionMap = new Map<string, any>();

    for (const run of runs) {
      if (run.status === ProductionStatus.APPROVED) {
        approvedRuns++;
        const actual = run.actualOutput ? run.actualOutput.toNumber() : 0;
        const planned = run.plannedOutput ? run.plannedOutput.toNumber() : 0;
        const waste = run.wastage ? run.wastage.toNumber() : 0;
        totalProduced += actual;
        totalPlanned += planned;
        totalWastage += waste;

        for (const input of run.inputs) {
          const pId = input.productId;
          const pName = input.product?.name || 'Raw Material';
          const qty = input.baseQuantity
            ? input.baseQuantity.toNumber()
            : Number(input.quantity);
          const uName = input.unitNameSnapshot || 'Units';

          if (!materialConsumptionMap.has(pId)) {
            materialConsumptionMap.set(pId, {
              productId: pId,
              productName: pName,
              totalConsumed: qty,
              unitName: uName,
            });
          } else {
            const existing = materialConsumptionMap.get(pId);
            existing.totalConsumed += qty;
          }
        }
      } else if (run.status === ProductionStatus.PENDING_APPROVAL) {
        pendingRuns++;
      } else if (run.status === ProductionStatus.DRAFT) {
        draftRuns++;
      } else if (run.status === ProductionStatus.REJECTED) {
        rejectedRuns++;
      }

      const outputProd = run.outputs[0]?.product;
      const cycleRef = run.productionReference || outputProd?.name || 'Standard Cycle';
      const cycleKey = `${run.clientId}_${outputProd?.id || cycleRef}`;

      if (!cycleStatsMap.has(cycleKey)) {
        cycleStatsMap.set(cycleKey, {
          cycleReference: cycleRef,
          clientId: run.clientId,
          clientName: run.client?.name || 'Client',
          outputProductName: outputProd?.name || 'Finished Good',
          outputProductSku: null,
          runsCount: 1,
          approvedCount: run.status === ProductionStatus.APPROVED ? 1 : 0,
          totalOutput: run.status === ProductionStatus.APPROVED && run.actualOutput ? run.actualOutput.toNumber() : 0,
          plannedOutputSum: run.status === ProductionStatus.APPROVED && run.plannedOutput ? run.plannedOutput.toNumber() : 0,
          lastRunAt: run.createdAt,
          lastStatus: run.status,
          latestRunId: run.id,
        });
      } else {
        const stats = cycleStatsMap.get(cycleKey);
        stats.runsCount += 1;
        if (run.status === ProductionStatus.APPROVED) {
          stats.approvedCount += 1;
          stats.totalOutput += run.actualOutput ? run.actualOutput.toNumber() : 0;
          stats.plannedOutputSum += run.plannedOutput ? run.plannedOutput.toNumber() : 0;
        }
      }
    }

    const avgYieldEfficiency = totalPlanned > 0
      ? Math.round((totalProduced / totalPlanned) * 1000) / 10
      : (approvedRuns > 0 ? 100 : 0);

    const wastageRate = (totalProduced + totalWastage) > 0
      ? Math.round((totalWastage / (totalProduced + totalWastage)) * 1000) / 10
      : 0;

    const cycleBreakdown = Array.from(cycleStatsMap.values()).map((c) => ({
      ...c,
      avgYield: c.plannedOutputSum > 0
        ? Math.round((c.totalOutput / c.plannedOutputSum) * 1000) / 10
        : (c.approvedCount > 0 ? 100 : null),
    }));

    const executionHistory = runs.map((run) => {
      const planned = run.plannedOutput ? run.plannedOutput.toNumber() : null;
      const actual = run.actualOutput ? run.actualOutput.toNumber() : null;
      const wastageVal = run.wastage ? run.wastage.toNumber() : null;
      const yieldEfficiency = planned && actual && planned > 0
        ? Math.round((actual / planned) * 1000) / 10
        : null;

      return {
        id: run.id,
        runNumber: `RUN-${run.id.substring(0, 8).toUpperCase()}`,
        cycleReference: run.productionReference || 'Standard Cycle',
        clientId: run.clientId,
        clientName: run.client?.name || 'Client',
        outputProductName: run.outputs[0]?.product?.name || 'Finished Product',
        batchNumber: run.outputs[0]?.batchNumber || null,
        plannedOutput: planned,
        actualOutput: actual,
        yieldEfficiency,
        wastage: wastageVal,
        status: run.status,
        submittedBy: run.submittedBy?.username || 'Unknown',
        submittedAt: run.submittedAt || run.createdAt,
        approvedBy: run.approvedBy?.username || null,
        approvedAt: run.approvedAt || null,
        notes: run.notes,
      };
    });

    const materialConsumption = Array.from(materialConsumptionMap.values()).sort(
      (a, b) => b.totalConsumed - a.totalConsumed,
    );

    // Compute active low stock cycles count
    let lowStockCyclesCount = 0;
    try {
      const cycles = await this.getProductionCycles(user);
      lowStockCyclesCount = cycles.filter((c: any) => c.isLowStock || c.isOutOfStock).length;
    } catch {
      lowStockCyclesCount = 0;
    }

    return {
      summary: {
        totalCycles: cycleStatsMap.size,
        totalRuns,
        approvedRuns,
        pendingRuns,
        draftRuns,
        rejectedRuns,
        totalProduced: Math.round(totalProduced * 100) / 100,
        totalPlanned: Math.round(totalPlanned * 100) / 100,
        avgYieldEfficiency,
        totalWastage: Math.round(totalWastage * 100) / 100,
        wastageRate,
        lowStockCyclesCount,
      },
      cycleBreakdown,
      materialConsumption,
      executionHistory,
    };
  }

  /**
   * Check for low-stock manufactured products that have production cycles,
   * and trigger in-app notification alerts for Client Admins.
   */
  async checkLowStockCycles(user: AuthenticatedUser) {
    const cycles = await this.getProductionCycles(user);
    const lowStockCycles = cycles.filter((c: any) => c.isLowStock || c.isOutOfStock);

    for (const cycle of lowStockCycles) {
      if (cycle.clientId && cycle.outputProductName) {
        await this.notificationsService.notifyClientAdmins(
          cycle.clientId,
          `Production Replenishment Needed: ${cycle.outputProductName}`,
          `Stock is low (${cycle.currentStock} remaining, min: ${cycle.minQuantity}). Production Cycle "${cycle.cycleReference}" is ready to re-run.`,
          'PRODUCTION_RUN',
          cycle.latestRunId,
        );
      }
    }

    return {
      checkedCyclesCount: cycles.length,
      alertedCyclesCount: lowStockCycles.length,
      cycles: lowStockCycles,
    };
  }
}

