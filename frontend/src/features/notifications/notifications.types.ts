export interface InAppNotification {
  id: string;
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: InAppNotification[];
  unreadCount: number;
}
