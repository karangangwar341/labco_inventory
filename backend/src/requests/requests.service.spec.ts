import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestsService } from './requests.service.js';
import { ReservationsService } from './reservations.service.js';
import {
  UserRole,
  RequestStatus,
  RequestType,
  StockCondition,
  ProductStatus,
  ProductKind,
  CatalogScope,
  ReservationStatus,
  ApprovalDecision,
  TrackingMode,
  TransactionType,
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
  let mockNotificationsService: any;

  const superAdminUser = { id: 'sa-1', username: 'superadmin', role: UserRole.SUPER_ADMIN, status: 'ACTIVE', sessionId: 'sess-sa' };
  const storeAdminUser = { id: 'sm-1', username: 'storeadmin', role: UserRole.STORE_ADMIN, status: 'ACTIVE', sessionId: 'sess-sm' };

  const approvedProduct = {
    id: 'prod-1',
    name: 'Lab Test Tube',
    status: ProductStatus.APPROVED,
    kind: ProductKind.RAW_MATERIAL,
    ownerScope: CatalogScope.COMPANY,
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
      stockBatch: {
        findUnique: vi.fn(),
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
    mockNotificationsService = {
      notifySuperAdmins: vi.fn(),
      notifyUser: vi.fn(),
      notifyClientAdmins: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({ approvalRequirements: { stockRequests: { STOCK_IN: true, STOCK_OUT: true, DISPATCH: true, TRANSFER: true, ADJUSTMENT: true } } }),
    };

    const mockShipmentsService: any = {
      createShipmentForApprovedDispatch: vi.fn(),
    };

    reservationsService = new ReservationsService(mockPrisma as any);
    requestsService = new RequestsService(
      mockPrisma as any,
      mockAuthService as any,
      mockLedgerService as any,
      reservationsService,
      mockShipmentsService,
      mockNotificationsService,
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

    it('rejects manufactured products in Store Admin stock requests', async () => {
      const manufacturedProduct = {
        ...approvedProduct,
        kind: ProductKind.MANUFACTURED_PRODUCT,
        ownerScope: CatalogScope.CLIENT,
      };
      mockPrisma.product.findUnique.mockResolvedValue(manufacturedProduct);
      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'wh-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-1', warehouseId: 'wh-1' });

      await expect(requestsService.createDraft(storeAdminUser, {
        requestType: RequestType.STOCK_OUT,
        sourceLocationId: 'loc-1',
        lines: [{ productId: 'finished-kit', quantity: 1, unitId: 'unit-ea' }],
      })).rejects.toThrow('Store Admins can only request company raw materials');
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
            product: { kind: ProductKind.RAW_MATERIAL, ownerScope: CatalogScope.COMPANY },
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
      expect(mockNotificationsService.notifySuperAdmins).toHaveBeenCalledWith(
        'Approval requested',
        expect.any(String),
        'STOCK_REQUEST',
        'req-1',
      );
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
            product: { kind: ProductKind.RAW_MATERIAL, ownerScope: CatalogScope.COMPANY },
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
      expect(mockNotificationsService.notifyUser).toHaveBeenCalledWith(
        storeAdminUser.id,
        'Request rejected',
        expect.stringContaining('Duplicate budget allocation'),
        'STOCK_REQUEST',
        'req-1',
      );

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
      expect(mockNotificationsService.notifyUser).toHaveBeenCalledWith(
        storeAdminUser.id,
        'Request approved',
        expect.any(String),
        'STOCK_REQUEST',
        'req-1',
      );
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
        expect.anything(),
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

  describe('5. Stock-In Tracking & Physical Count Adjustments (T-008)', () => {
    it('allows stock-in without a lot number even when product trackingMode is BATCH_ONLY', async () => {
      const batchProduct = {
        ...approvedProduct,
        id: 'prod-batch',
        trackingMode: TrackingMode.BATCH_ONLY,
      };
      mockPrisma.product.findUnique.mockResolvedValue(batchProduct);
      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'wh-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-1', warehouseId: 'wh-1' });
      mockPrisma.stockRequest.create.mockResolvedValue({ id: 'req-batch-optional' });

      const draft = await requestsService.createDraft(storeAdminUser, {
        requestType: RequestType.STOCK_IN,
        sourceType: 'DIRECT_PURCHASE',
        sourceLocationId: 'loc-1',
        lines: [
          {
            productId: 'prod-batch',
            quantity: 10,
            unitId: 'unit-ea',
          },
        ],
      });

      expect(draft.id).toBe('req-batch-optional');
      expect(mockPrisma.stockBatch.create).not.toHaveBeenCalled();
    });

    it('creates stockBatch automatically when batchNumber is specified on stock-in', async () => {
      const batchProduct = {
        ...approvedProduct,
        id: 'prod-batch',
        trackingMode: TrackingMode.BATCH_ONLY,
      };
      mockPrisma.product.findUnique.mockResolvedValue(batchProduct);
      mockPrisma.stockBatch.findUnique.mockResolvedValue(null);
      mockPrisma.stockBatch.create.mockResolvedValue({
        id: 'batch-created-1',
        productId: 'prod-batch',
        batchNumber: 'LOT-999',
      });
      mockPrisma.stockRequest.create.mockResolvedValue({ id: 'req-batch' });
      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'wh-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-1', warehouseId: 'wh-1' });

      await requestsService.createDraft(storeAdminUser, {
        requestType: RequestType.STOCK_IN,
        sourceType: 'DIRECT_PURCHASE',
        sourceLocationId: 'loc-1',
        lines: [
          {
            productId: 'prod-batch',
            quantity: 10,
            unitId: 'unit-ea',
            batchNumber: 'LOT-999',
          },
        ],
      });

      expect(mockPrisma.stockBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: 'prod-batch',
            batchNumber: 'LOT-999',
          }),
        }),
      );
    });

    it('records system snapshot and variance for physical count adjustments', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(approvedProduct);
      mockPrisma.user.findUnique.mockResolvedValue({ warehouseId: 'wh-1' });
      mockPrisma.stockLocation.findUnique.mockResolvedValue({ id: 'loc-1', warehouseId: 'wh-1' });

      // Current system stock is 50
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        usableQty: new Prisma.Decimal(50),
        damagedQty: new Prisma.Decimal(0),
        expiredQty: new Prisma.Decimal(0),
      });

      mockPrisma.stockRequest.create.mockImplementation(async (args: any) => args.data);

      // Counted quantity is 55 (variance is +5)
      const draft = await requestsService.createDraft(storeAdminUser, {
        requestType: RequestType.ADJUSTMENT,
        sourceLocationId: 'loc-1',
        lines: [
          {
            productId: 'prod-1',
            quantity: 55,
            countedQuantity: 55,
            unitId: 'unit-ea',
            condition: StockCondition.USABLE,
          },
        ],
      });

      expect(mockPrisma.stockRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestType: RequestType.ADJUSTMENT,
            lines: {
              create: [
                expect.objectContaining({
                  systemQuantitySnapshot: new Prisma.Decimal(50),
                  countedQuantity: new Prisma.Decimal(55),
                  varianceQuantity: new Prisma.Decimal(5),
                }),
              ],
            },
          }),
        }),
      );
    });

    it('approves physical count adjustment and posts delta to ledger', async () => {
      const adjustmentRequest = {
        id: 'req-adj-1',
        status: RequestStatus.PENDING_APPROVAL,
        requestType: RequestType.ADJUSTMENT,
        sourceLocationId: 'loc-1',
        lines: [
          {
            id: 'line-adj-1',
            productId: 'prod-1',
            batchId: null,
            quantity: new Prisma.Decimal(55),
            unitNameSnapshot: 'EACH',
            condition: StockCondition.USABLE,
            varianceQuantity: new Prisma.Decimal(5), // +5 delta
          },
        ],
      };
      mockPrisma.stockRequest.findUnique.mockResolvedValue(adjustmentRequest);
      mockPrisma.stockRequest.update.mockResolvedValue({
        id: 'req-adj-1',
        status: RequestStatus.APPROVED,
      });

      const res = await requestsService.approveRequest(superAdminUser, 'req-adj-1', {});
      expect(res.status).toBe(RequestStatus.APPROVED);

      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.ADJUSTMENT,
          sourceRefId: 'req-adj-1',
          lines: [
            expect.objectContaining({
              locationId: 'loc-1',
              productId: 'prod-1',
              quantity: 5,
              direction: 'IN',
            }),
          ],
        }),
        superAdminUser.id,
        expect.anything(),
      );
    });
  });

  describe('6. Client-to-Client Transfer Prevention & Location Invariants', () => {
    it('rejects Super Admin creating draft with client source and client destination', async () => {
      mockPrisma.stockLocation.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.id === 'loc-client-a') return { id: 'loc-client-a', locationType: 'CLIENT', clientId: 'client-a' };
        if (where.id === 'loc-client-b') return { id: 'loc-client-b', locationType: 'CLIENT', clientId: 'client-b' };
        return null;
      });

      await expect(
        requestsService.createDraft(superAdminUser, {
          requestType: RequestType.DISPATCH,
          sourceLocationId: 'loc-client-a',
          destinationLocationId: 'loc-client-b',
          lines: [{ productId: 'prod-1', quantity: 10, unitId: 'unit-ea' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects Super Admin creating dispatch request originating from a client location', async () => {
      mockPrisma.stockLocation.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.id === 'loc-client-a') return { id: 'loc-client-a', locationType: 'CLIENT', clientId: 'client-a' };
        if (where.id === 'loc-wh-1') return { id: 'loc-wh-1', locationType: 'WAREHOUSE', warehouseId: 'wh-1' };
        return null;
      });

      await expect(
        requestsService.createDraft(superAdminUser, {
          requestType: RequestType.DISPATCH,
          sourceLocationId: 'loc-client-a',
          destinationLocationId: 'loc-wh-1',
          lines: [{ productId: 'prod-1', quantity: 10, unitId: 'unit-ea' }],
        }),
      ).rejects.toThrow('Dispatch requests must originate from a warehouse stock location');
    });

    it('rejects Super Admin creating transfer request targeting a client location', async () => {
      mockPrisma.stockLocation.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.id === 'loc-wh-1') return { id: 'loc-wh-1', locationType: 'WAREHOUSE', warehouseId: 'wh-1' };
        if (where.id === 'loc-client-a') return { id: 'loc-client-a', locationType: 'CLIENT', clientId: 'client-a' };
        return null;
      });

      await expect(
        requestsService.createDraft(superAdminUser, {
          requestType: RequestType.TRANSFER,
          sourceLocationId: 'loc-wh-1',
          destinationLocationId: 'loc-client-a',
          lines: [{ productId: 'prod-1', quantity: 10, unitId: 'unit-ea' }],
        }),
      ).rejects.toThrow('Transfer requests must target a warehouse stock location');
    });

    it('rejects Super Admin client stock-out specifying another destination location', async () => {
      mockPrisma.stockLocation.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.id === 'loc-client-a') return { id: 'loc-client-a', locationType: 'CLIENT', clientId: 'client-a' };
        if (where.id === 'loc-client-b') return { id: 'loc-client-b', locationType: 'CLIENT', clientId: 'client-b' };
        return null;
      });

      await expect(
        requestsService.createDraft(superAdminUser, {
          requestType: RequestType.STOCK_OUT,
          sourceLocationId: 'loc-client-a',
          destinationLocationId: 'loc-client-b',
          lines: [{ productId: 'prod-1', quantity: 10, unitId: 'unit-ea' }],
        }),
      ).rejects.toThrow('Client-to-client transfer is strictly prohibited');
    });

    it('rejects submitRequest if both source and destination are client locations', async () => {
      const clientToClientRequest = {
        id: 'req-c2c-1',
        status: RequestStatus.DRAFT,
        requesterId: superAdminUser.id,
        requestType: RequestType.DISPATCH,
        sourceLocation: { id: 'loc-c1', locationType: 'CLIENT', clientId: 'c1' },
        destinationLocation: { id: 'loc-c2', locationType: 'CLIENT', clientId: 'c2' },
        lines: [{ id: 'l1', productId: 'p1', quantity: new Prisma.Decimal(10), condition: StockCondition.USABLE }],
      };
      mockPrisma.stockRequest.findUnique.mockResolvedValue(clientToClientRequest);

      await expect(
        requestsService.submitRequest(superAdminUser, 'req-c2c-1'),
      ).rejects.toThrow('Client-to-client transfer is strictly prohibited');
    });

    it('rejects approveRequest if both source and destination are client locations', async () => {
      const clientToClientRequest = {
        id: 'req-c2c-2',
        status: RequestStatus.PENDING_APPROVAL,
        requestType: RequestType.DISPATCH,
        sourceLocation: { id: 'loc-c1', locationType: 'CLIENT', clientId: 'c1' },
        destinationLocation: { id: 'loc-c2', locationType: 'CLIENT', clientId: 'c2' },
        lines: [{ id: 'l1', productId: 'p1', quantity: new Prisma.Decimal(10), condition: StockCondition.USABLE }],
      };
      mockPrisma.stockRequest.findUnique.mockResolvedValue(clientToClientRequest);

      await expect(
        requestsService.approveRequest(superAdminUser, 'req-c2c-2', {}),
      ).rejects.toThrow('Client-to-client transfer is strictly prohibited');
    });
  });
});
