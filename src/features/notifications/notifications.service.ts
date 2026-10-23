import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { NotificationSettings, NotificationsResponse } from './notifications.types';

export const notificationsService = {
  getNotifications: async (params?: {
    unreadOnly?: boolean;
    limit?: number;
  }): Promise<NotificationsResponse> => {
    return apiClient.get<NotificationsResponse>(
      endpoints.notifications.list(params),
    );
  },

  markAsRead: async (id: string): Promise<void> => {
    return apiClient.patch(endpoints.notifications.markRead(id), {});
  },

  markAllAsRead: async (): Promise<void> => {
    return apiClient.post(endpoints.notifications.markAllRead());
  },

  getSettings: async (): Promise<NotificationSettings> =>
    apiClient.get(endpoints.notifications.settings()),

  updateSettings: async (settings: Partial<NotificationSettings>): Promise<NotificationSettings> =>
    apiClient.patch(endpoints.notifications.settings(), settings),
};
