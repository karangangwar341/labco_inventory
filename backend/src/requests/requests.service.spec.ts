import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestsService } from './requests.service.js';
import { ReservationsService } from './reservations.service.js';
import {
  UserRole,
  RequestStatus,
  RequestType,
  StockCondition,
  ProductStatus,
  ReservationStatus,
  ApprovalDecision,
  Prisma,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

describe('Requests & Reservations Service (T-007)', () => {
  let requestsService: RequestsService;
  let reservationsService: ReservationsService;
  let mockPrisma: any;
  let mockAuthService: any;
  let mockLedgerService: any;

  const superAdminUser = { id: 'sa-1', username: 'superadmin', role: UserRole.SUPER_ADMIN };
  const storeAdminUser = { id: 'sm-1', username: 'storeadmin', role: UserRole.STORE_ADMIN };

  const approvedProduct = {
    id: 'prod-1',
    name: 'Lab Test Tube',
    status: ProductStatus.APPROVED,
    quantityPrecision: 0,
    units: [
      {
        id: 'unit-ea',
        unitName: 'EACH',
        conversionToBase: new Prisma.Decimal(1),
        status: 'ACTIVE',
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
      stockRequest: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      stockRequestLine: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      reservation: {
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      inventoryBalance: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      stockLocation: {
        findUnique: vi.fn(),
      },
      approval: {
        create: vi.fn(),
      },
    };

    mockAuthService = {
      assertClientAccess: vi.fn(),
      assertWarehouseAccess: vi.fn(),
    };

    mockLedgerService = {
      postTransaction: vi.fn(),
    };

    reservationsService = new ReservationsService(mockPrisma as any);
    requestsService = new RequestsService(
      mockPrisma as any,
      mockAuthService as any,
      mockLedgerService as any,
      reservationsService,
    );
  });

  describe('1. Draft Creation (Zero Stock / Zero Reservation Effect)', () => {
    it('creates draft request without placing reservations or updating inventory balances', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(approvedProduct);
      const createdDraft = {
        id: 'req-1',
        status: RequestStatus.DRAFT,
        requesterId: storeAdminUser.id,
      };
      mockPrisma.stockRequest.create.mockResolvedValue(createdDraft);
      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'wh-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-1', warehouseId: 'wh-1' });

      const result = await requestsService.createDraft(storeAdminUser, {
        requestType: RequestType.STOCK_OUT,
        sourceLocationId: 'loc-1',
        lines: [
          {
            productId: 'prod-1',
            quantity: 10,
            unitId: 'unit-ea',
          },
        ],
      });

      expect(result).toBe(createdDraft);
      expect(mockPrisma.reservation.create).not.toHaveBeenCalled();
      expect(mockPrisma.inventoryBalance.update).not.toHaveBeenCalled();
    });
  });

  describe('2. Submission & Atomic Reservations', () => {
    it('atomically reserves stock and transitions request to PENDING_APPROVAL when available stock suffices', async () => {
      const draftRequest = {
        id: 'req-1',
        status: RequestStatus.DRAFT,
        requesterId: storeAdminUser.id,
        requestType: RequestType.STOCK_OUT,
        sourceLocationId: 'loc-1',
        lines: [
          {
            id: 'line-1',
            productId: 'prod-1',
            baseQuantity: new Prisma.Decimal(25),
            condition: StockCondition.USABLE,
          },
        ],
      };
      mockPrisma.stockRequest.findUnique.mockResolvedValue(draftRequest);

      // Usable: 100, Reserved: 20 -> Available: 80 (sufficient for 25)
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        usableQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(20),
        version: 1,
      });

      mockPrisma.stockRequest.update.mockResolvedValue({
        id: 'req-1',
        status: RequestStatus.PENDING_APPROVAL,
      });

      const result = await requestsService.submitRequest(storeAdminUser, 'req-1');

      expect(result.status).toBe(RequestStatus.PENDING_APPROVAL);
      expect(mockPrisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestLineId: 'line-1',
            quantityBase: new Prisma.Decimal(25),
            status: ReservationStatus.ACTIVE,
          }),
        }),
      );
      expect(mockPrisma.inventoryBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bal-1' },
          data: expect.objectContaining({
            reservedQty: new Prisma.Decimal(45), // 20 + 25 = 45
          }),
        }),
      );
    });

    it('rejects submission with BadRequestException when requested quantity exceeds available stock', async () => {
      const draftRequest = {
        id: 'req-1',
        status: RequestStatus.DRAFT,
        requesterId: storeAdminUser.id,
        requestType: RequestType.STOCK_OUT,
        sourceLocationId: 'loc-1',
        lines: [
          {
            id: 'line-1',
            productId: 'prod-1',
            baseQuantity: new Prisma.Decimal(90),
            condition: StockCondition.USABLE,
          },
        ],
      };
      mockPrisma.stockRequest.findUnique.mockResolvedValue(draftRequest);

      // Usable: 100, Reserved: 20 -> Available: 80 (less than requested 90)
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        usableQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(20),
        version: 1,
      });

      await expect(
        requestsService.submitRequest(storeAdminUser, 'req-1'),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.reservation.create).not.toHaveBeenCalled();
      expect(mockPrisma.stockRequest.update).not.toHaveBeenCalled();
    });
  });

  describe('3. Pending Cancellation (Immediate Reservation Release)', () => {
    it('releases active reservations and decrements reservedQty upon cancellation', async () => {
      const pendingRequest = {
        id: 'req-1',
        status: RequestStatus.PENDING_APPROVAL,
        requesterId: storeAdminUser.id,
      };
      mockPrisma.stockRequest.findUnique.mockResolvedValue(pendingRequest);

      mockPrisma.reservation.findMany.mockResolvedValue([
        {
          id: 'res-1',
          locationId: 'loc-1',
          productId: 'prod-1',
          batchId: null,
          quantityBase: new Prisma.Decimal(15),
          status: ReservationStatus.ACTIVE,
        },
      ]);

      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        usableQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(15),
        version: 2,
      });

      mockPrisma.stockRequest.update.mockResolvedValue({
        id: 'req-1',
        status: RequestStatus.CANCELLED,
      });

      const res = await requestsService.cancelRequest(storeAdminUser, 'req-1');
      expect(res.status).toBe(RequestStatus.CANCELLED);

      expect(mockPrisma.reservation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'res-1' },
          data: expect.objectContaining({
            status: ReservationStatus.RELEASED,
          }),
        }),
      );
      expect(mockPrisma.inventoryBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bal-1' },
          data: expect.objectContaining({
            reservedQty: new Prisma.Decimal(0),
          }),
        }),
      );
    });
  });

  describe('4. Super Admin Decisions (Reject & Approve)', () => {
    it('Super Admin reject releases reservations and creates rejection record', async () => {
      const pendingRequest = {
        id: 'req-1',
        status: RequestStatus.PENDING_APPROVAL,
        requesterId: storeAdminUser.id,
      };
      mockPrisma.stockRequest.findUnique.mockResolvedValue(pendingRequest);

      mockPrisma.reservation.findMany.mockResolvedValue([
        {
          id: 'res-1',
          locationId: 'loc-1',
          productId: 'prod-1',
          batchId: null,
          quantityBase: new Prisma.Decimal(10),
          status: ReservationStatus.ACTIVE,
        },
      ]);

      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        usableQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(10),
        version: 2,
      });

      mockPrisma.stockRequest.update.mockResolvedValue({
        id: 'req-1',
        status: RequestStatus.REJECTED,
      });

      await requestsService.rejectRequest(superAdminUser, 'req-1', {
        reason: 'Duplicate budget allocation',
      });

      expect(mockPrisma.approval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestId: 'req-1',
            decision: ApprovalDecision.REJECTED,
            reason: 'Duplicate budget allocation',
          }),
        }),
      );
      expect(mockPrisma.reservation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'res-1' },
          data: expect.objectContaining({
            status: ReservationStatus.RELEASED,
          }),
        }),
      );
    });

    it('Super Admin approve consumes reservations and posts ledger deduction atomically', async () => {
      const pendingRequest = {
        id: 'req-1',
        status: RequestStatus.PENDING_APPROVAL,
        requesterId: storeAdminUser.id,
        requestType: RequestType.STOCK_OUT,
        sourceLocationId: 'loc-1',
        lines: [
          {
            id: 'line-1',
            productId: 'prod-1',
            batchId: null,
            quantity: new Prisma.Decimal(10),
            unitNameSnapshot: 'EACH',
            condition: StockCondition.USABLE,
          },
        ],
      };
      mockPrisma.stockRequest.findUnique.mockResolvedValue(pendingRequest);

      mockPrisma.reservation.findMany.mockResolvedValue([
        {
          id: 'res-1',
          locationId: 'loc-1',
          productId: 'prod-1',
          batchId: null,
          quantityBase: new Prisma.Decimal(10),
          status: ReservationStatus.ACTIVE,
        },
      ]);

      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        usableQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(10),
        version: 2,
      });

      mockPrisma.stockRequest.update.mockResolvedValue({
        id: 'req-1',
        status: RequestStatus.APPROVED,
      });

      const res = await requestsService.approveRequest(superAdminUser, 'req-1', {
        idempotencyKey: 'idem-app-1',
      });

      expect(res.status).toBe(RequestStatus.APPROVED);
      // Reservation is marked CONSUMED
      expect(mockPrisma.reservation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'res-1' },
          data: expect.objectContaining({
            status: ReservationStatus.CONSUMED,
          }),
        }),
      );
      // Ledger deduction was called
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'STOCK_OUT',
          sourceRefId: 'req-1',
          lines: [
            expect.objectContaining({
              locationId: 'loc-1',
              productId: 'prod-1',
              direction: 'OUT',
              quantity: 10,
            }),
          ],
        }),
        superAdminUser.id,
      );
    });

    it('idempotency: already approved request returns immediately without double-posting', async () => {
      const approvedRequest = {
        id: 'req-1',
        status: RequestStatus.APPROVED,
      };
      mockPrisma.stockRequest.findUnique.mockResolvedValue(approvedRequest);

      const res = await requestsService.approveRequest(superAdminUser, 'req-1', {
        idempotencyKey: 'idem-app-1',
      });

      expect(res).toBe(approvedRequest);
      expect(mockLedgerService.postTransaction).not.toHaveBeenCalled();
      expect(mockPrisma.approval.create).not.toHaveBeenCalled();
    });
  });
});
