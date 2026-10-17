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

export interface OrganizationOption {
  id: string;
  name: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface ManagedClient extends OrganizationOption {
  warehouseAssignments?: Array<{ id: string; warehouseId: string; isActive: boolean; warehouse: OrganizationOption }>;
}

export interface ManagedWarehouse extends OrganizationOption {
  locationDescription?: string | null;
  clientAssignments?: Array<{ id: string; clientId: string; isActive: boolean; client: OrganizationOption }>;
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

  disableUser: async (id: string): Promise<Pick<UserAccount, 'id' | 'status'>> => {
    return apiClient.patch(endpoints.users.disable(id));
  },

  resetPassword: async (id: string, newPassword: string): Promise<Pick<UserAccount, 'id' | 'status'>> => {
    return apiClient.post(endpoints.users.resetPassword(id), { newPassword });
  },

  getClients: async (): Promise<ManagedClient[]> => {
    return apiClient.get<ManagedClient[]>(endpoints.organization.clients());
  },

  getClient: async (id: string): Promise<ManagedClient> => {
    return apiClient.get<ManagedClient>(endpoints.organization.clientById(id));
  },

  getWarehouses: async (): Promise<ManagedWarehouse[]> => {
    return apiClient.get<ManagedWarehouse[]>(endpoints.organization.warehouses());
  },

  createClient: async (name: string): Promise<ManagedClient> => {
    return apiClient.post(endpoints.organization.createClient(), { name });
  },

  updateClient: async (id: string, payload: { name?: string; status?: 'ACTIVE' | 'INACTIVE' }): Promise<ManagedClient> => {
    return apiClient.patch(endpoints.organization.updateClient(id), payload);
  },

  createWarehouse: async (payload: { name: string; locationDescription?: string }): Promise<ManagedWarehouse> => {
    return apiClient.post(endpoints.organization.createWarehouse(), payload);
  },

  updateWarehouse: async (id: string, payload: { name?: string; locationDescription?: string; status?: 'ACTIVE' | 'INACTIVE' }): Promise<ManagedWarehouse> => {
    return apiClient.patch(endpoints.organization.updateWarehouse(id), payload);
  },

  assignWarehouse: async (clientId: string, warehouseId: string) => {
    return apiClient.post(endpoints.organization.clientWarehouses(clientId), { warehouseId });
  },

  deactivateAssignment: async (clientId: string, warehouseId: string) => {
    return apiClient.delete(endpoints.organization.clientWarehouseAssignment(clientId, warehouseId));
  },
};
