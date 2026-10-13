import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import {
  UserRole,
  NotificationEventType,
  BatchStatus,
  Prisma,
} from '@prisma/client';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('Notifications Service (T-013: Notifications, low-stock and expiry alerts)', () => {
  let notificationsService: NotificationsService;
  let mockPrisma: any;

  const superAdminUser: any = {
    id: 'sa-1',
    username: 'superadmin',
    role: UserRole.SUPER_ADMIN,
    status: 'ACTIVE',
    sessionId: 'sess-1',
  };

  const clientAdminUser: any = {
    id: 'ca-1',
    username: 'clientadmin',
    role: UserRole.CLIENT_ADMIN,
    clientId: 'client-123',
    status: 'ACTIVE',
    sessionId: 'sess-2',
  };

  const storeAdminUser: any = {
    id: 'sm-1',
    username: 'storeadmin',
    role: UserRole.STORE_ADMIN,
    warehouseId: 'wh-1',
    status: 'ACTIVE',
    sessionId: 'sess-3',
  };

  const lowStockProduct = {
    id: 'prod-cartridge',
    name: 'Diagnostic Cartridge A',
    minQuantity: new Prisma.Decimal(50),
    clientId: 'client-123',
    ownerScope: 'CLIENT',
  };

  beforeEach(() => {
    mockPrisma = {
      notification: {
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'notif-1', ...args.data })),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      stockAlertState: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
      },
      inventoryBalance: {
        findMany: vi.fn(),
      },
      stockBatch: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
      systemSetting: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };

    notificationsService = new NotificationsService(mockPrisma as any);
  });

  describe('1. Low-Stock Downward Crossing Engine (REQ-018 & Test Plan 17)', () => {
    it('triggers low-stock alert on downward crossing below minimum threshold', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(lowStockProduct);
      // Available: 40 (< minQuantity 50)
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        { usableQty: new Prisma.Decimal(50), reservedQty: new Prisma.Decimal(10) },
      ]);
      // Alert state was NOT low stock
      mockPrisma.stockAlertState.findFirst.mockResolvedValue({
        id: 'state-1',
        productId: 'prod-cartridge',
        isLowStock: false,
      });
      mockPrisma.stockAlertState.update.mockResolvedValue({ id: 'state-1', isLowStock: true });

      mockPrisma.user.findMany
        .mockResolvedValueOnce([superAdminUser]) // Super Admins
        .mockResolvedValueOnce([clientAdminUser]); // Client Admins

      const result = await notificationsService.checkLowStockForProduct('prod-cartridge');

      expect(result?.action).toBe('ALERT_TRIGGERED');
      expect(result?.isLowStock).toBe(true);
      expect(mockPrisma.stockAlertState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'state-1' },
          data: expect.objectContaining({ isLowStock: true }),
        }),
      );

      // Notification sent to Super Admin and Client Admin
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientUserId: 'sa-1',
            eventType: NotificationEventType.LOW_STOCK_DOWNWARD_CROSSING,
          }),
        }),
      );
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientUserId: 'ca-1',
            eventType: NotificationEventType.LOW_STOCK_DOWNWARD_CROSSING,
          }),
        }),
      );
    });

    it('persists alert state silently while low without sending duplicate alerts', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(lowStockProduct);
      // Available: 30 (< 50)
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        { usableQty: new Prisma.Decimal(30), reservedQty: new Prisma.Decimal(0) },
      ]);
      // Alert state is ALREADY low stock
      mockPrisma.stockAlertState.findFirst.mockResolvedValue({
        id: 'state-1',
        productId: 'prod-cartridge',
        isLowStock: true,
      });

      const result = await notificationsService.checkLowStockForProduct('prod-cartridge');

      expect(result?.action).toBe('ALERT_PERSISTED');
      expect(result?.isLowStock).toBe(true);
      // Invariant check: No new notification created while remaining low!
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockPrisma.stockAlertState.update).not.toHaveBeenCalled();
    });

    it('resets alert state on stock recovery above threshold', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(lowStockProduct);
      // Available: 70 (>= 50)
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        { usableQty: new Prisma.Decimal(70), reservedQty: new Prisma.Decimal(0) },
      ]);
      // Alert state was low stock
      mockPrisma.stockAlertState.findFirst.mockResolvedValue({
        id: 'state-1',
        productId: 'prod-cartridge',
        isLowStock: true,
      });
      mockPrisma.stockAlertState.update.mockResolvedValue({ id: 'state-1', isLowStock: false });

      mockPrisma.user.findMany
        .mockResolvedValueOnce([superAdminUser])
        .mockResolvedValueOnce([clientAdminUser]);

      const result = await notificationsService.checkLowStockForProduct('prod-cartridge');

      expect(result?.action).toBe('ALERT_RECOVERED');
      expect(result?.isLowStock).toBe(false);
      expect(mockPrisma.stockAlertState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'state-1' },
          data: expect.objectContaining({ isLowStock: false }),
        }),
      );
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: NotificationEventType.LOW_STOCK_RECOVERED,
          }),
        }),
      );
    });

    it('re-triggers low-stock alert only after recovery and a subsequent new crossing', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(lowStockProduct);
      // Available: 45 (< 50)
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        { usableQty: new Prisma.Decimal(45), reservedQty: new Prisma.Decimal(0) },
      ]);
      // Alert state was recovered (isLowStock: false)
      mockPrisma.stockAlertState.findFirst.mockResolvedValue({
        id: 'state-1',
        productId: 'prod-cartridge',
        isLowStock: false,
      });
      mockPrisma.stockAlertState.update.mockResolvedValue({ id: 'state-1', isLowStock: true });

      mockPrisma.user.findMany
        .mockResolvedValueOnce([superAdminUser])
        .mockResolvedValueOnce([clientAdminUser]);

      const result = await notificationsService.checkLowStockForProduct('prod-cartridge');

      expect(result?.action).toBe('ALERT_TRIGGERED');
      expect(result?.isLowStock).toBe(true);
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it('strictly excludes Store Admin from receiving low-stock alerts', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(lowStockProduct);
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([
        { usableQty: new Prisma.Decimal(20), reservedQty: new Prisma.Decimal(0) },
      ]);
      mockPrisma.stockAlertState.findFirst.mockResolvedValue({
        id: 'state-1',
        productId: 'prod-cartridge',
        isLowStock: false,
      });

      mockPrisma.user.findMany
        .mockResolvedValueOnce([superAdminUser])
        .mockResolvedValueOnce([]);

      await notificationsService.checkLowStockForProduct('prod-cartridge');

      // Verify notification was NOT sent to store admin
      expect(mockPrisma.notification.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recipientUserId: storeAdminUser.id }),
        }),
      );
    });
  });

  describe('2. Expiry Warning Engine (REQ-019 & Test Plan 11)', () => {
    it('isolates expired batch and triggers BATCH_EXPIRED alert when daysRemaining <= 0', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        valueJson: { expiryWarningIntervals: [90, 30, 7], soundEnabled: false },
      });
      mockPrisma.stockBatch.findMany.mockResolvedValue([
        {
          id: 'batch-exp-1',
          batchNumber: 'LOT-EXPIRED',
          expiryDate: pastDate,
          status: BatchStatus.ACTIVE,
          product: { name: 'Expired Diagnostic Kit' },
        },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([superAdminUser]);

      const result = await notificationsService.checkExpiryWarnings(new Date());

      expect(result.warningsIssued).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ batchId: 'batch-exp-1', type: 'EXPIRED' }),
        ]),
      );
      // Batch updated to EXPIRED status
      expect(mockPrisma.stockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'batch-exp-1' },
          data: { status: BatchStatus.EXPIRED },
        }),
      );
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientUserId: 'sa-1',
            eventType: NotificationEventType.BATCH_EXPIRED,
          }),
        }),
      );
    });

    it('issues EXPIRY_WARNING notification when batch falls within warning interval (30 days)', async () => {
      const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days left
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        valueJson: { expiryWarningIntervals: [90, 30, 7], soundEnabled: false },
      });
      mockPrisma.stockBatch.findMany.mockResolvedValue([
        {
          id: 'batch-warn-1',
          batchNumber: 'LOT-SOON',
          expiryDate: futureDate,
          status: BatchStatus.ACTIVE,
          product: { name: 'Active Assay' },
        },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([superAdminUser]);

      const result = await notificationsService.checkExpiryWarnings(new Date());

      expect(result.warningsIssued).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ batchId: 'batch-warn-1', type: 'WARNING' }),
        ]),
      );
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientUserId: 'sa-1',
            eventType: NotificationEventType.EXPIRY_WARNING,
          }),
        }),
      );
    });
  });

  describe('3. In-App Notification Center & Read Status', () => {
    it('returns notifications and unread count scoped to caller', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: 'n1', title: 'Low Stock', readAt: null },
      ]);
      mockPrisma.notification.count.mockResolvedValue(1);

      const result = await notificationsService.getNotifications(clientAdminUser, { unreadOnly: true });

      expect(result.unreadCount).toBe(1);
      expect(result.notifications).toHaveLength(1);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ recipientUserId: 'ca-1', readAt: null }),
        }),
      );
    });

    it('marks notification as read', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue({
        id: 'n1',
        recipientUserId: 'ca-1',
      });
      mockPrisma.notification.update.mockResolvedValue({ id: 'n1', readAt: new Date() });

      await notificationsService.markAsRead('n1', clientAdminUser);

      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n1' },
          data: expect.objectContaining({ readAt: expect.any(Date) }),
        }),
      );
    });

    it('marks all unread notifications as read for current user', async () => {
      await notificationsService.markAllAsRead(clientAdminUser);

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recipientUserId: 'ca-1', readAt: null },
          data: expect.objectContaining({ readAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('4. Settings & Sound Policy (Decision Register)', () => {
    it('defaults to soundEnabled = false and [90, 30, 7] warning intervals', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      const settings = await notificationsService.getSettings();

      expect(settings.soundEnabled).toBe(false);
      expect(settings.expiryWarningIntervals).toEqual([90, 30, 7]);
    });

    it('Super Admin updates notification settings successfully', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
      mockPrisma.systemSetting.upsert.mockResolvedValue({});

      const updated = await notificationsService.updateSettings(
        { expiryWarningIntervals: [60, 15], soundEnabled: true },
        superAdminUser,
      );

      expect(updated.expiryWarningIntervals).toEqual([60, 15]);
      expect(updated.soundEnabled).toBe(true);
    });

    it('forbids Client Admin from updating global notification settings', async () => {
      await expect(
        notificationsService.updateSettings({ soundEnabled: true }, clientAdminUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
