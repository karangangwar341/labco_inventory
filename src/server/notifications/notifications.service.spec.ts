import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationsService } from './notifications.service';
import {
  UserRole,
  NotificationEventType,
  Prisma,
} from '@prisma/client';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('Notifications Service (T-013: Notifications and low-stock alerts)', () => {
  let notificationsService: NotificationsService;
  let mockPrisma: any;

  const superAdminUser: any = {
    id: 'sa-1',
    username: 'superadmin',
    role: UserRole.SUPER_ADMIN,
    status: 'ACTIVE',
    sessionId: 'sess-1',
  };

  const projectAdminUser: any = {
    id: 'ca-1',
    username: 'projectadmin',
    role: UserRole.PROJECT_ADMIN,
    projectId: 'project-123',
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
    projectId: 'project-123',
    ownerScope: 'PROJECT',
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
      notification: {
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'notif-1', ...args.data })),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({}),
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
        .mockResolvedValueOnce([projectAdminUser]); // Project Admins

      const result = await notificationsService.checkLowStockForProduct('prod-cartridge');

      expect(result?.action).toBe('ALERT_TRIGGERED');
      expect(result?.isLowStock).toBe(true);
      expect(mockPrisma.stockAlertState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'state-1' },
          data: expect.objectContaining({ isLowStock: true }),
        }),
      );

      // Notification sent to Super Admin and Project Admin
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
        .mockResolvedValueOnce([projectAdminUser]);

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
        .mockResolvedValueOnce([projectAdminUser]);

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

  describe('3. In-App Notification Center & Read Status', () => {
    it('returns notifications and unread count scoped to caller', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: 'n1', title: 'Low Stock', readAt: null },
      ]);
      mockPrisma.notification.count.mockResolvedValue(1);

      const result = await notificationsService.getNotifications(projectAdminUser, { unreadOnly: true });

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

      await notificationsService.markAsRead('n1', projectAdminUser);

      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n1' },
          data: expect.objectContaining({ readAt: expect.any(Date) }),
        }),
      );
    });

    it('marks all unread notifications as read for current user', async () => {
      await notificationsService.markAllAsRead(projectAdminUser);

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recipientUserId: 'ca-1', readAt: null },
          data: expect.objectContaining({ readAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('4. Settings & Sound Policy (Decision Register)', () => {
    it('defaults to soundEnabled = false', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      const settings = await notificationsService.getSettings();

      expect(settings.soundEnabled).toBe(false);
      expect(settings.approvalRequirements.stockRequests.STOCK_OUT).toBe(true);
    });

    it('Super Admin updates notification settings successfully', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
      mockPrisma.systemSetting.upsert.mockResolvedValue({});

      const updated = await notificationsService.updateSettings(
        { soundEnabled: true },
        superAdminUser,
      );

      expect(updated.soundEnabled).toBe(true);
    });

    it('updates one approval rule while preserving other workflow defaults and audits the change', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
      mockPrisma.systemSetting.upsert.mockResolvedValue({});

      const updated = await notificationsService.updateSettings({
        approvalRequirements: { stockRequests: { STOCK_OUT: false } },
      }, superAdminUser);

      expect(updated.approvalRequirements.stockRequests.STOCK_OUT).toBe(false);
      expect(updated.approvalRequirements.stockRequests.STOCK_IN).toBe(true);
      expect(updated.approvalRequirements.departmentIssue).toBe(true);
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: 'SYSTEM_SETTINGS_UPDATED', beforeJson: expect.any(Object), afterJson: expect.any(Object) }),
      }));
    });

    it('rejects unknown approval workflows and non-boolean values', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(notificationsService.updateSettings({
        approvalRequirements: { unknown: false },
      }, superAdminUser)).rejects.toThrow('unknown workflow');
      await expect(notificationsService.updateSettings({
        approvalRequirements: { departmentIssue: 'false' },
      } as any, superAdminUser)).rejects.toThrow('must be a boolean');
    });

    it('forbids Project Admin from updating global notification settings', async () => {
      await expect(
        notificationsService.updateSettings({ soundEnabled: true }, projectAdminUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
