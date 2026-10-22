import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShipmentsService } from './shipments.service.js';
import {
  UserRole,
  ShipmentStatus,
  ShipmentType,
  TransactionType,
  StockCondition,
  Prisma,
} from '@prisma/client';
import {
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

describe('Shipments Service (T-009: Dispatch, Transfers, Receipts & Discrepancies)', () => {
  let shipmentsService: ShipmentsService;
  let mockPrisma: any;
  let mockLedgerService: any;
  let mockNotificationsService: any;

  const superAdminUser = { id: 'sa-1', username: 'superadmin', role: UserRole.SUPER_ADMIN };
  const clientAdminUser = { id: 'ca-1', username: 'clientadmin', role: UserRole.CLIENT_ADMIN };
  const storeAdminUser = { id: 'sm-1', username: 'storeadmin', role: UserRole.STORE_ADMIN };

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
      shipment: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      shipmentLine: {
        update: vi.fn(),
      },
      systemSetting: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      stockLocation: {
        findUnique: vi.fn(),
      },
    };

    mockLedgerService = {
      postTransaction: vi.fn(),
    };
    mockNotificationsService = {
      notifySuperAdmins: vi.fn(),
      notifyClientAdmins: vi.fn(),
    };

    shipmentsService = new ShipmentsService(mockPrisma as any, mockLedgerService as any, mockNotificationsService as any);
  });

  describe('1. Dispatch Approval & D-001 Configuration', () => {
    const mockRequest = {
      id: 'req-disp-1',
      requestType: 'DISPATCH',
      sourceLocationId: 'loc-wh-1',
      destinationLocationId: 'loc-client-1',
      lines: [
        {
          productId: 'prod-1',
          batchId: null,
          condition: StockCondition.USABLE,
          quantity: new Prisma.Decimal(100),
          unitNameSnapshot: 'EACH',
        },
      ],
    };

    it('D-001: when receipt confirmation is disabled, atomically credits client stock and completes shipment', async () => {
      // Disabled receipt confirmation
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'RECEIPT_CONFIRMATION_ENABLED',
        valueJson: false,
      });

      const completedShipment = {
        id: 'ship-1',
        status: ShipmentStatus.COMPLETED,
      };
      mockPrisma.shipment.create.mockResolvedValue(completedShipment);

      const res = await shipmentsService.createShipmentForApprovedDispatch(
        mockPrisma,
        mockRequest,
        superAdminUser.id,
      );

      expect(res).toBe(completedShipment);
      // Deducts warehouse stock
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.TRANSFER_DISPATCH,
          lines: [expect.objectContaining({ locationId: 'loc-wh-1', direction: 'OUT', quantity: 100 })],
        }),
        superAdminUser.id,
        expect.anything(),
      );
      // Immediately credits client stock in same transaction
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.TRANSFER_RECEIPT,
          lines: [expect.objectContaining({ locationId: 'loc-client-1', direction: 'IN', quantity: 100 })],
        }),
        superAdminUser.id,
        expect.anything(),
      );
    });

    it('default: when receipt confirmation is enabled, deducts warehouse stock and creates IN_TRANSIT shipment', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'RECEIPT_CONFIRMATION_ENABLED',
        valueJson: true,
      });

      const inTransitShipment = {
        id: 'ship-1',
        status: ShipmentStatus.IN_TRANSIT,
      };
      mockPrisma.shipment.create.mockResolvedValue(inTransitShipment);

      const res = await shipmentsService.createShipmentForApprovedDispatch(
        mockPrisma,
        mockRequest,
        superAdminUser.id,
      );

      expect(res).toBe(inTransitShipment);
      // Deducts source stock
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.TRANSFER_DISPATCH,
        }),
        superAdminUser.id,
        expect.anything(),
      );
      // Does NOT credit destination stock yet
      expect(mockLedgerService.postTransaction).toHaveBeenCalledTimes(1);
      // Creates IN_TRANSIT shipment
      expect(mockPrisma.shipment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ShipmentStatus.IN_TRANSIT,
          }),
        }),
      );
    });
  });

  describe('2. Recording Receipt & Discrepancies', () => {
    it('records received count and flags discrepancy (100 dispatched, 95 received)', async () => {
      mockPrisma.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.IN_TRANSIT,
        destinationLocation: { clientId: 'client-123' },
        lines: [
          {
            id: 'line-1',
            dispatchedQty: new Prisma.Decimal(100),
          },
        ],
      });
      mockPrisma.user.findUnique.mockResolvedValue({ clientId: 'client-123' });
      mockPrisma.shipment.update.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.AWAITING_RECEIPT_APPROVAL,
      });

      const res = await shipmentsService.recordReceipt(clientAdminUser, 'ship-1', {
        lines: [
          {
            shipmentLineId: 'line-1',
            receivedQty: 95,
            discrepancyReason: '5 units damaged',
          },
        ],
        notes: 'Driver noted packaging tears',
      });

      expect(res.status).toBe(ShipmentStatus.AWAITING_RECEIPT_APPROVAL);
      expect(mockPrisma.shipmentLine.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'line-1' },
          data: expect.objectContaining({
            receivedQty: new Prisma.Decimal(95),
            discrepancyQty: new Prisma.Decimal(5),
          }),
        }),
      );
    });

    it('blocks Client Admin from receiving shipment destined for another client', async () => {
      mockPrisma.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.IN_TRANSIT,
        destinationLocation: { clientId: 'other-client-456' },
        lines: [],
      });
      mockPrisma.user.findUnique.mockResolvedValue({ clientId: 'client-123' });

      await expect(
        shipmentsService.recordReceipt(clientAdminUser, 'ship-1', { lines: [] }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Receipt Approval & D-002 Discrepancy Hold', () => {
    it('D-002: credits received quantity (95) and transitions shipment to DISCREPANCY_HOLD for unresolved missing items', async () => {
      mockPrisma.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.AWAITING_RECEIPT_APPROVAL,
        destinationLocationId: 'loc-client-1',
        lines: [
          {
            id: 'line-1',
            productId: 'prod-1',
            batchId: null,
            unitName: 'EACH',
            condition: StockCondition.USABLE,
            dispatchedQty: new Prisma.Decimal(100),
            receivedQty: new Prisma.Decimal(95),
            discrepancyQty: new Prisma.Decimal(5),
          },
        ],
      });

      mockPrisma.shipment.update.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.DISCREPANCY_HOLD,
      });

      const res = await shipmentsService.approveReceipt(superAdminUser, 'ship-1', {
        idempotencyKey: 'app-rec-1',
        holdDiscrepancy: true,
      });

      expect(res.status).toBe(ShipmentStatus.DISCREPANCY_HOLD);
      // Credits usable stock for the 95 received units
      expect(mockLedgerService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: TransactionType.TRANSFER_RECEIPT,
          lines: [
            expect.objectContaining({
              locationId: 'loc-client-1',
              productId: 'prod-1',
              quantity: 95,
              direction: 'IN',
            }),
          ],
        }),
        superAdminUser.id,
        expect.anything(),
      );
      // Status updated to DISCREPANCY_HOLD
      expect(mockPrisma.shipment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ship-1' },
          data: expect.objectContaining({
            status: ShipmentStatus.DISCREPANCY_HOLD,
          }),
        }),
      );
    });

    it('transitions shipment to COMPLETED when 100% of dispatched quantity is received without discrepancies', async () => {
      mockPrisma.shipment.findUnique.mockResolvedValue({
        id: 'ship-2',
        status: ShipmentStatus.AWAITING_RECEIPT_APPROVAL,
        destinationLocationId: 'loc-client-1',
        lines: [
          {
            id: 'line-2',
            productId: 'prod-1',
            batchId: null,
            unitName: 'EACH',
            condition: StockCondition.USABLE,
            dispatchedQty: new Prisma.Decimal(100),
            receivedQty: new Prisma.Decimal(100),
            discrepancyQty: new Prisma.Decimal(0),
          },
        ],
      });

      mockPrisma.shipment.update.mockResolvedValue({
        id: 'ship-2',
        status: ShipmentStatus.COMPLETED,
      });

      const res = await shipmentsService.approveReceipt(superAdminUser, 'ship-2', {});
      expect(res.status).toBe(ShipmentStatus.COMPLETED);
    });

    it('idempotency: already completed or held shipment returns immediately without double-crediting stock', async () => {
      const alreadyCompleted = {
        id: 'ship-1',
        status: ShipmentStatus.COMPLETED,
      };
      mockPrisma.shipment.findUnique.mockResolvedValue(alreadyCompleted);

      const res = await shipmentsService.approveReceipt(superAdminUser, 'ship-1', {});
      expect(res).toBe(alreadyCompleted);
      expect(mockLedgerService.postTransaction).not.toHaveBeenCalled();
    });
  });

  describe('5. Client-to-Client Shipment Prevention', () => {
    it('rejects creating shipment when source and destination are both client locations', async () => {
      const c2cRequest = {
        id: 'req-c2c',
        requestType: 'DISPATCH',
        sourceLocation: { id: 'loc-c1', locationType: 'CLIENT', clientId: 'c1' },
        destinationLocation: { id: 'loc-c2', locationType: 'CLIENT', clientId: 'c2' },
        lines: [],
      };

      await expect(
        shipmentsService.createShipmentForApprovedDispatch(mockPrisma, c2cRequest, superAdminUser.id),
      ).rejects.toThrow('Client-to-client shipment is strictly prohibited');
    });

    it('rejects creating transfer shipment when destination is a client location', async () => {
      const transferRequest = {
        id: 'req-trans-c',
        requestType: 'TRANSFER',
        sourceLocation: { id: 'loc-wh-1', locationType: 'WAREHOUSE', warehouseId: 'wh-1' },
        destinationLocation: { id: 'loc-c2', locationType: 'CLIENT', clientId: 'c2' },
        lines: [],
      };

      await expect(
        shipmentsService.createShipmentForApprovedDispatch(mockPrisma, transferRequest, superAdminUser.id),
      ).rejects.toThrow('Transfers are strictly inter-warehouse');
    });
  });
});
