export interface InAppNotification {
  id: string;
  recipientUserId: string;
  type?: string;
  eventType?: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: InAppNotification[];
  unreadCount: number;
}

export interface NotificationSettings {
  expiryWarningIntervals: number[];
  soundEnabled: boolean;
  receiptConfirmationEnabled: boolean;
}
