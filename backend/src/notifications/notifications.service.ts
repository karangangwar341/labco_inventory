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
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { QueryNotificationsDto } from './dto/query-notifications.dto.js';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto.js';
import {
  ApprovalRequirements,
  DEFAULT_APPROVAL_REQUIREMENTS,
  mergeApprovalRequirements,
} from './approval-requirements.js';

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

  async notifyProjectAdmins(projectId: string | null | undefined, title: string, message: string, entityType: string, entityId: string) {
    if (!projectId) return;
    try {
      const recipients = await this.prisma.user.findMany({
        where: { role: UserRole.PROJECT_ADMIN, status: UserStatus.ACTIVE, projectId },
        select: { id: true },
      });
      await this.notifyRecipients(recipients.map(({ id }) => id), title, message, entityType, entityId);
    } catch (error) {
      this.logger.error(`Could not notify project admins about ${entityType} ${entityId}`, error);
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

      // Find eligible recipients: Super Admins + applicable Project Admins (Store Admins strictly excluded!)
      const superAdmins = await this.prisma.user.findMany({
        where: { role: UserRole.SUPER_ADMIN, status: 'ACTIVE' },
      });

      let projectAdmins: any[] = [];
      if (product.projectId) {
        projectAdmins = await this.prisma.user.findMany({
          where: {
            role: UserRole.PROJECT_ADMIN,
            projectId: product.projectId,
            status: 'ACTIVE',
          },
        });
      }

      const recipients = [...superAdmins, ...projectAdmins];
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

      let projectAdmins: any[] = [];
      if (product.projectId) {
        projectAdmins = await this.prisma.user.findMany({
          where: {
            role: UserRole.PROJECT_ADMIN,
            projectId: product.projectId,
            status: 'ACTIVE',
          },
        });
      }

      const recipients = [...superAdmins, ...projectAdmins];
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
  // SETTINGS & CONFIGURATION
  // ==========================================

  async getSettings() {
    const [setting, receiptSetting] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: 'notification_settings' } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'RECEIPT_CONFIRMATION_ENABLED' } }),
    ]);
    const notificationSettings = setting?.valueJson as { soundEnabled?: boolean; approvalRequirements?: unknown } | undefined;

    return {
      soundEnabled: notificationSettings?.soundEnabled ?? false,
      receiptConfirmationEnabled: receiptSetting?.valueJson === undefined
        ? true
        : Boolean(receiptSetting.valueJson),
      approvalRequirements: mergeApprovalRequirements(notificationSettings?.approvalRequirements),
    };
  }

  async updateSettings(dto: UpdateNotificationSettingsDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can update notification settings');
    }

    const current = await this.getSettings();
    const updated = {
      soundEnabled: dto.soundEnabled ?? current.soundEnabled,
      receiptConfirmationEnabled: dto.receiptConfirmationEnabled ?? current.receiptConfirmationEnabled,
      approvalRequirements: dto.approvalRequirements === undefined
        ? current.approvalRequirements
        : this.validateApprovalRequirements(dto.approvalRequirements, current.approvalRequirements),
    };

    await this.prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.systemSetting.upsert({
          where: { key: 'notification_settings' },
          update: {
            valueJson: JSON.parse(JSON.stringify({
              soundEnabled: updated.soundEnabled,
              approvalRequirements: updated.approvalRequirements,
            })) as Prisma.InputJsonValue,
            updatedById: user.id,
          },
          create: {
            key: 'notification_settings',
            valueJson: JSON.parse(JSON.stringify({
              soundEnabled: updated.soundEnabled,
              approvalRequirements: updated.approvalRequirements,
            })) as Prisma.InputJsonValue,
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
            beforeJson: JSON.parse(JSON.stringify(current)) as Prisma.InputJsonValue,
            afterJson: JSON.parse(JSON.stringify(updated)) as Prisma.InputJsonValue,
          },
        }),
      ]);
    });

    return updated;
  }

  private validateApprovalRequirements(
    value: Record<string, unknown>,
    current: ApprovalRequirements,
  ): ApprovalRequirements {
    const validBooleanMap = (candidate: unknown, allowed: string[], label: string) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new BadRequestException(`${label} must be an object`);
      }
      const entries = Object.entries(candidate as Record<string, unknown>);
      if (entries.some(([key, setting]) => !allowed.includes(key) || typeof setting !== 'boolean')) {
        throw new BadRequestException(`${label} contains an unknown workflow or a non-boolean value`);
      }
    };

    const allowedTop = ['stockRequests', 'shipmentReceipt', 'manufacturing', 'departmentIssue', 'departmentReturn', 'imports'];
    if (Object.keys(value).some((key) => !allowedTop.includes(key))) {
      throw new BadRequestException('Approval requirements contain an unknown workflow');
    }
    for (const key of ['shipmentReceipt', 'manufacturing', 'departmentIssue', 'departmentReturn']) {
      if (value[key] !== undefined && typeof value[key] !== 'boolean') {
        throw new BadRequestException(`${key} approval requirement must be a boolean`);
      }
    }
    if (value.stockRequests !== undefined) {
      validBooleanMap(value.stockRequests, Object.keys(DEFAULT_APPROVAL_REQUIREMENTS.stockRequests), 'stockRequests');
    }
    if (value.imports !== undefined) {
      validBooleanMap(value.imports, Object.keys(DEFAULT_APPROVAL_REQUIREMENTS.imports), 'imports');
    }

    return {
      stockRequests: { ...current.stockRequests, ...(value.stockRequests as Partial<Record<keyof ApprovalRequirements['stockRequests'], boolean>> | undefined) },
      shipmentReceipt: (value.shipmentReceipt as boolean | undefined) ?? current.shipmentReceipt,
      manufacturing: (value.manufacturing as boolean | undefined) ?? current.manufacturing,
      departmentIssue: (value.departmentIssue as boolean | undefined) ?? current.departmentIssue,
      departmentReturn: (value.departmentReturn as boolean | undefined) ?? current.departmentReturn,
      imports: { ...current.imports, ...(value.imports as Partial<ApprovalRequirements['imports']> | undefined) },
    };
  }
}
