import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';

export interface UserAccount {
  id: string;
  username: string;
  role: 'SUPER_ADMIN' | 'STORE_ADMIN' | 'CLIENT_ADMIN';
  status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  clientId?: string | null;
  warehouseId?: string | null;
  client?: { id: string; name: string };
  warehouse?: { id: string; name: string };
  createdAt: string;
}

export const administrationService = {
  getUsers: async (): Promise<UserAccount[]> => {
    return apiClient.get<UserAccount[]>(endpoints.users.list());
  },

  createUser: async (payload: {
    username: string;
    password?: string;
    role: string;
    clientId?: string;
    warehouseId?: string;
  }): Promise<UserAccount> => {
    return apiClient.post<UserAccount>(endpoints.users.create(), payload);
  },

  getClients: async (): Promise<any[]> => {
    return apiClient.get(endpoints.organization.clients());
  },

  getWarehouses: async (): Promise<any[]> => {
    return apiClient.get(endpoints.organization.warehouses());
  },
};
