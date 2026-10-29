import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';

export interface UserAccount {
  id: string;
  username: string;
  role: 'SUPER_ADMIN' | 'STORE_ADMIN' | 'PROJECT_ADMIN';
  status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  projectId?: string | null;
  warehouseId?: string | null;
  project?: { id: string; name: string };
  warehouse?: { id: string; name: string };
  managedWarehouses?: Array<{ id: string; name: string; status?: 'ACTIVE' | 'INACTIVE' }>;
  createdAt: string;
}

export interface OrganizationOption {
  id: string;
  name: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface ManagedProject extends OrganizationOption {
  warehouseAssignments?: Array<{ id: string; warehouseId: string; isActive: boolean; warehouse: OrganizationOption }>;
}

export interface ManagedWarehouse extends OrganizationOption {
  locationDescription?: string | null;
  storeAdminId?: string | null;
  storeAdmin?: { id: string; username: string; status?: string } | null;
  projectAssignments?: Array<{ id: string; projectId: string; isActive: boolean; project: OrganizationOption }>;
}

export const administrationService = {
  getUsers: async (): Promise<UserAccount[]> => {
    return apiClient.get<UserAccount[]>(endpoints.users.list());
  },

  createUser: async (payload: {
    username: string;
    password?: string;
    role: string;
    projectId?: string;
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

  getProjects: async (): Promise<ManagedProject[]> => {
    return apiClient.get<ManagedProject[]>(endpoints.organization.projects());
  },

  getProject: async (id: string): Promise<ManagedProject> => {
    return apiClient.get<ManagedProject>(endpoints.organization.projectById(id));
  },

  getWarehouses: async (): Promise<ManagedWarehouse[]> => {
    return apiClient.get<ManagedWarehouse[]>(endpoints.organization.warehouses());
  },


  createBulkProjects: async (items: Array<{ name: string; warehouseIds?: string[] }>): Promise<{
    totalCreated: number;
    totalSkipped: number;
    created: ManagedProject[];
    skipped: Array<{ name: string; reason: string }>;
  }> => {
    return apiClient.post(endpoints.organization.createProjectsBulk(), { items });
  },
  createProject: async (name: string): Promise<ManagedProject> => {
    return apiClient.post(endpoints.organization.createProject(), { name });
  },

  updateProject: async (id: string, payload: { name?: string; status?: 'ACTIVE' | 'INACTIVE' }): Promise<ManagedProject> => {
    return apiClient.patch(endpoints.organization.updateProject(id), payload);
  },

  createWarehouse: async (payload: { name: string; locationDescription?: string; storeAdminId?: string | null }): Promise<ManagedWarehouse> => {
    return apiClient.post(endpoints.organization.createWarehouse(), payload);
  },

  updateWarehouse: async (id: string, payload: { name?: string; locationDescription?: string; status?: 'ACTIVE' | 'INACTIVE'; storeAdminId?: string | null }): Promise<ManagedWarehouse> => {
    return apiClient.patch(endpoints.organization.updateWarehouse(id), payload);
  },

  assignWarehouse: async (projectId: string, warehouseId: string) => {
    return apiClient.post(endpoints.organization.projectWarehouses(projectId), { warehouseId });
  },

  deactivateAssignment: async (projectId: string, warehouseId: string) => {
    return apiClient.delete(endpoints.organization.projectWarehouseAssignment(projectId, warehouseId));
  },
};
