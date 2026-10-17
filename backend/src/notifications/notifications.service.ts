import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  UserRole,
  UserStatus,
  NotificationEventType,
  BatchStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { QueryNotificationsDto } from './dto/query-notifications.dto.js';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // IN-APP NOTIFICATION RETRIEVAL
  // ==========================================

  async getNotifications(user: AuthenticatedUser, query?: QueryNotificationsDto) {
    const where: Prisma.NotificationWhereInput = {
      recipientUserId: user.id,
    };

    if (query?.unreadOnly) {
      where.readAt = null;
    }

    const limit = query?.limit ?? 50;

    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.notification.count({
        where: {
          recipientUserId: user.id,
          readAt: null,
        },
      }),
    ]);

    return {
      notifications,
      unreadCount,
    };
  }

  async markAsRead(notificationId: string, user: AuthenticatedUser) {
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }

    if (notif.recipientUserId !== user.id) {
      throw new ForbiddenException('Cannot modify notifications for another user');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(user: AuthenticatedUser) {
    await this.prisma.notification.updateMany({
      where: {
        recipientUserId: user.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { success: true, message: 'All notifications marked as read' };
  }

  async createNotification(
    recipientUserId: string,
    eventType: NotificationEventType,
    title: string,
    message: string,
    entityType?: string,
    entityId?: string,
  ) {
    return this.prisma.notification.create({
      data: {
        recipientUserId,
        eventType,
        title,
        message,
        entityType: entityType || null,
        entityId: entityId || null,
      },
    });
  }

  async notifyUser(
    recipientUserId: string | null | undefined,
    title: string,
    message: string,
    entityType: string,
    entityId: string,
    eventType = NotificationEventType.REQUEST_STATUS_CHANGED,
  ) {
    if (!recipientUserId) return;
    try {
      await this.createNotification(recipientUserId, eventType, title, message, entityType, entityId);
    } catch (error) {
      this.logger.error(`Could not create notification for ${entityType} ${entityId}`, error);
    }
  }

  async notifySuperAdmins(title: string, message: string, entityType: string, entityId: string) {
    await this.notifyRoleUsers(UserRole.SUPER_ADMIN, title, message, entityType, entityId);
  }

  async notifyClientAdmins(clientId: string | null | undefined, title: string, message: string, entityType: string, entityId: string) {
    if (!clientId) return;
    try {
      const recipients = await this.prisma.user.findMany({
        where: { role: UserRole.CLIENT_ADMIN, status: UserStatus.ACTIVE, clientId },
        select: { id: true },
      });
      await this.notifyRecipients(recipients.map(({ id }) => id), title, message, entityType, entityId);
    } catch (error) {
      this.logger.error(`Could not notify client admins about ${entityType} ${entityId}`, error);
    }
  }

  private async notifyRoleUsers(role: UserRole, title: string, message: string, entityType: string, entityId: string) {
    try {
      const recipients = await this.prisma.user.findMany({
        where: { role, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      await this.notifyRecipients(recipients.map(({ id }) => id), title, message, entityType, entityId);
    } catch (error) {
      this.logger.error(`Could not notify ${role} users about ${entityType} ${entityId}`, error);
    }
  }

  private async notifyRecipients(recipientIds: string[], title: string, message: string, entityType: string, entityId: string) {
    const results = await Promise.allSettled(
      [...new Set(recipientIds)].map((id) => this.createNotification(
        id,
        NotificationEventType.REQUEST_STATUS_CHANGED,
        title,
        message,
        entityType,
        entityId,
      )),
    );
    results.forEach((result) => {
      if (result.status === 'rejected') this.logger.error(`Could not create ${entityType} notification`, result.reason);
    });
  }

  // ==========================================
  // LOW-STOCK DOWNWARD CROSSING ENGINE
  // (REQ-018 & Test Plan 17)
  // ==========================================

  async checkLowStockForProduct(productId: string, locationId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.minQuantity.lte(0)) {
      return null;
    }

    // 1. Calculate available usable stock (Available = Usable - Reserved)
    const balanceWhere: Prisma.InventoryBalanceWhereInput = {
      productId,
    };
    if (locationId) {
      balanceWhere.locationId = locationId;
    }

    const balances = await this.prisma.inventoryBalance.findMany({
      where: balanceWhere,
    });

    let totalAvailable = new Prisma.Decimal(0);
    for (const b of balances) {
      totalAvailable = totalAvailable.add(b.usableQty.minus(b.reservedQty));
    }

    // 2. Fetch or create StockAlertState for tracking crossing vs persistence
    let alertState = await this.prisma.stockAlertState.findFirst({
      where: {
        productId,
        locationId: locationId || null,
      },
    });

    if (!alertState) {
      alertState = await this.prisma.stockAlertState.create({
        data: {
          productId,
          locationId: locationId || null,
          isLowStock: false,
        },
      });
    }

    const isBelowThreshold = totalAvailable.lt(product.minQuantity);

    // CASE A: DOWNWARD CROSSING (was NOT low stock, now below threshold)
    if (isBelowThreshold && !alertState.isLowStock) {
      await this.prisma.stockAlertState.update({
        where: { id: alertState.id },
        data: {
          isLowStock: true,
          lastAlertAt: new Date(),
        },
      });

      // Find eligible recipients: Super Admins + applicable Client Admins (Store Admins strictly excluded!)
      const superAdmins = await this.prisma.user.findMany({
        where: { role: UserRole.SUPER_ADMIN, status: 'ACTIVE' },
      });

      let clientAdmins: any[] = [];
      if (product.clientId) {
        clientAdmins = await this.prisma.user.findMany({
          where: {
            role: UserRole.CLIENT_ADMIN,
            clientId: product.clientId,
            status: 'ACTIVE',
          },
        });
      }

      const recipients = [...superAdmins, ...clientAdmins];
      const title = `Low Stock Alert: ${product.name}`;
      const message = `Product "${product.name}" has crossed below minimum threshold. Available: ${totalAvailable}, Min Threshold: ${product.minQuantity}.`;

      for (const recipient of recipients) {
        await this.createNotification(
          recipient.id,
          NotificationEventType.LOW_STOCK_DOWNWARD_CROSSING,
          title,
          message,
          'Product',
          product.id,
        );
      }

      return {
        action: 'ALERT_TRIGGERED',
        isLowStock: true,
        available: totalAvailable,
        threshold: product.minQuantity,
      };
    }

    // CASE B: PERSISTENCE (was low stock, remains low stock)
    // Invariant: Do NOT create duplicate alerts; alert remains active silently until recovery
    if (isBelowThreshold && alertState.isLowStock) {
      return {
        action: 'ALERT_PERSISTED',
        isLowStock: true,
        available: totalAvailable,
        threshold: product.minQuantity,
      };
    }

    // CASE C: RECOVERY (was low stock, now recovered above threshold)
    if (!isBelowThreshold && alertState.isLowStock) {
      await this.prisma.stockAlertState.update({
        where: { id: alertState.id },
        data: {
          isLowStock: false,
          lastRecoveryAt: new Date(),
        },
      });

      const superAdmins = await this.prisma.user.findMany({
        where: { role: UserRole.SUPER_ADMIN, status: 'ACTIVE' },
      });

      let clientAdmins: any[] = [];
      if (product.clientId) {
        clientAdmins = await this.prisma.user.findMany({
          where: {
            role: UserRole.CLIENT_ADMIN,
            clientId: product.clientId,
            status: 'ACTIVE',
          },
        });
      }

      const recipients = [...superAdmins, ...clientAdmins];
      const title = `Stock Recovered: ${product.name}`;
      const message = `Product "${product.name}" stock has recovered above minimum threshold. Available: ${totalAvailable}, Threshold: ${product.minQuantity}.`;

      for (const recipient of recipients) {
        await this.createNotification(
          recipient.id,
          NotificationEventType.LOW_STOCK_RECOVERED,
          title,
          message,
          'Product',
          product.id,
        );
      }

      return {
        action: 'ALERT_RECOVERED',
        isLowStock: false,
        available: totalAvailable,
        threshold: product.minQuantity,
      };
    }

    return {
      action: 'NORMAL',
      isLowStock: false,
      available: totalAvailable,
      threshold: product.minQuantity,
    };
  }

  // ==========================================
  // EXPIRY WARNING ENGINE
  // (REQ-019 & Test Plan 11)
  // ==========================================

  async checkExpiryWarnings(referenceDate?: Date) {
    const now = referenceDate || new Date();
    const settings = await this.getSettings();
    const intervals: number[] = settings.expiryWarningIntervals || [90, 30, 7];

    const activeBatches = await this.prisma.stockBatch.findMany({
      where: {
        expiryDate: { not: null },
        status: BatchStatus.ACTIVE,
      },
      include: {
        product: true,
      },
    });

    const superAdmins = await this.prisma.user.findMany({
      where: { role: UserRole.SUPER_ADMIN, status: 'ACTIVE' },
    });

    const warningsIssued = [];

    for (const batch of activeBatches) {
      if (!batch.expiryDate) continue;

      const msDiff = batch.expiryDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

      // 1. Expired batch handling
      if (daysRemaining <= 0) {
        await this.prisma.stockBatch.update({
          where: { id: batch.id },
          data: { status: BatchStatus.EXPIRED },
        });

        // Notify Super Admins
        const title = `Batch Expired: ${batch.product.name}`;
        const message = `Batch ${batch.batchNumber || batch.id} of "${batch.product.name}" has expired. Expired stock is isolated and blocked from routine dispatch.`;

        for (const sa of superAdmins) {
          await this.createNotification(
            sa.id,
            NotificationEventType.BATCH_EXPIRED,
            title,
            message,
            'StockBatch',
            batch.id,
          );
        }

        warningsIssued.push({ batchId: batch.id, type: 'EXPIRED', daysRemaining });
        continue;
      }

      // 2. Expiry interval alerts
      for (const interval of intervals) {
        if (daysRemaining <= interval) {
          const title = `Expiry Warning (${interval} Days): ${batch.product.name}`;
          const message = `Batch ${batch.batchNumber || batch.id} expires in ${daysRemaining} day(s) on ${batch.expiryDate.toISOString().slice(0, 10)}.`;

          for (const sa of superAdmins) {
            await this.createNotification(
              sa.id,
              NotificationEventType.EXPIRY_WARNING,
              title,
              message,
              'StockBatch',
              batch.id,
            );
          }

          warningsIssued.push({ batchId: batch.id, type: 'WARNING', interval, daysRemaining });
          break; // Avoid multi-alerting for the same batch in one check cycle
        }
      }
    }

    return {
      batchesChecked: activeBatches.length,
      warningsIssued,
    };
  }

  // ==========================================
  // SETTINGS & CONFIGURATION
  // ==========================================

  async getSettings() {
    const [setting, receiptSetting] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: 'notification_settings' } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'RECEIPT_CONFIRMATION_ENABLED' } }),
    ]);
    const notificationSettings = setting?.valueJson as { expiryWarningIntervals?: number[]; soundEnabled?: boolean } | undefined;

    return {
      expiryWarningIntervals: notificationSettings?.expiryWarningIntervals ?? [90, 30, 7],
      soundEnabled: notificationSettings?.soundEnabled ?? false,
      receiptConfirmationEnabled: receiptSetting?.valueJson === undefined
        ? true
        : Boolean(receiptSetting.valueJson),
    };
  }

  async updateSettings(dto: UpdateNotificationSettingsDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can update notification settings');
    }

    const current = await this.getSettings();
    const updated = {
      expiryWarningIntervals: dto.expiryWarningIntervals ?? current.expiryWarningIntervals,
      soundEnabled: dto.soundEnabled ?? current.soundEnabled,
      receiptConfirmationEnabled: dto.receiptConfirmationEnabled ?? current.receiptConfirmationEnabled,
    };

    const intervals = updated.expiryWarningIntervals;
    if (
      !Array.isArray(intervals) ||
      intervals.length === 0 ||
      intervals.some((v, idx) => v <= 0 || (idx > 0 && v >= intervals[idx - 1]))
    ) {
      throw new BadRequestException('Expiry warning intervals must contain positive, descending day values');
    }

    await this.prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.systemSetting.upsert({
          where: { key: 'notification_settings' },
          update: {
            valueJson: {
              expiryWarningIntervals: updated.expiryWarningIntervals,
              soundEnabled: updated.soundEnabled,
            },
            updatedById: user.id,
          },
          create: {
            key: 'notification_settings',
            valueJson: {
              expiryWarningIntervals: updated.expiryWarningIntervals,
              soundEnabled: updated.soundEnabled,
            },
            updatedById: user.id,
          },
        }),
        tx.systemSetting.upsert({
          where: { key: 'RECEIPT_CONFIRMATION_ENABLED' },
          update: { valueJson: updated.receiptConfirmationEnabled, updatedById: user.id },
          create: { key: 'RECEIPT_CONFIRMATION_ENABLED', valueJson: updated.receiptConfirmationEnabled, updatedById: user.id },
        }),
        tx.auditEvent.create({
          data: {
            actorUserId: user.id,
            action: 'SYSTEM_SETTINGS_UPDATED',
            entityType: 'SYSTEM_SETTINGS',
            entityId: 'global',
            afterJson: updated,
          },
        }),
      ]);
    });

    return updated;
  }
}
