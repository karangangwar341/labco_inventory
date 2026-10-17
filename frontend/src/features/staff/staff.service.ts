import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import {
  ClientStaffMember,
  ClientStaffWorkLog,
  CreateStaffMemberPayload,
  UpdateStaffMemberPayload,
  CreateWorkLogPayload,
} from './staff.types';

export const staffService = {
  listStaff: async (params?: { clientId?: string; page?: number; limit?: number }): Promise<ClientStaffMember[]> => {
    return apiClient.get<ClientStaffMember[]>(endpoints.staff.list(params));
  },

  getStaff: async (id: string): Promise<ClientStaffMember> => {
    return apiClient.get<ClientStaffMember>(endpoints.staff.byId(id));
  },

  createStaff: async (payload: CreateStaffMemberPayload): Promise<ClientStaffMember> => {
    return apiClient.post<ClientStaffMember>(endpoints.staff.create(), payload);
  },

  updateStaff: async (id: string, payload: UpdateStaffMemberPayload): Promise<ClientStaffMember> => {
    return apiClient.patch<ClientStaffMember>(endpoints.staff.update(id), payload);
  },

  deleteStaff: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete<{ success: boolean; message: string }>(endpoints.staff.delete(id));
  },

  listClientWorkLogs: async (params?: { clientId?: string; page?: number; limit?: number }): Promise<ClientStaffWorkLog[]> => {
    return apiClient.get<ClientStaffWorkLog[]>(endpoints.staff.workLogs(params));
  },

  listStaffWorkLogs: async (staffId: string): Promise<ClientStaffWorkLog[]> => {
    return apiClient.get<ClientStaffWorkLog[]>(endpoints.staff.staffWorkLogs(staffId));
  },

  createWorkLog: async (staffId: string, payload: CreateWorkLogPayload): Promise<ClientStaffWorkLog> => {
    return apiClient.post<ClientStaffWorkLog>(endpoints.staff.createWorkLog(staffId), payload);
  },
};
