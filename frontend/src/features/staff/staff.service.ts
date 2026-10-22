import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import {
  ProjectStaffMember,
  ProjectStaffWorkLog,
  CreateStaffMemberPayload,
  UpdateStaffMemberPayload,
  CreateWorkLogPayload,
} from './staff.types';

export const staffService = {
  listStaff: async (params?: { projectId?: string; page?: number; limit?: number }): Promise<ProjectStaffMember[]> => {
    return apiClient.get<ProjectStaffMember[]>(endpoints.staff.list(params));
  },

  getStaff: async (id: string): Promise<ProjectStaffMember> => {
    return apiClient.get<ProjectStaffMember>(endpoints.staff.byId(id));
  },

  createStaff: async (payload: CreateStaffMemberPayload): Promise<ProjectStaffMember> => {
    return apiClient.post<ProjectStaffMember>(endpoints.staff.create(), payload);
  },

  updateStaff: async (id: string, payload: UpdateStaffMemberPayload): Promise<ProjectStaffMember> => {
    return apiClient.patch<ProjectStaffMember>(endpoints.staff.update(id), payload);
  },

  deleteStaff: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete<{ success: boolean; message: string }>(endpoints.staff.delete(id));
  },

  listProjectWorkLogs: async (params?: { projectId?: string; page?: number; limit?: number }): Promise<ProjectStaffWorkLog[]> => {
    return apiClient.get<ProjectStaffWorkLog[]>(endpoints.staff.workLogs(params));
  },

  listStaffWorkLogs: async (staffId: string): Promise<ProjectStaffWorkLog[]> => {
    return apiClient.get<ProjectStaffWorkLog[]>(endpoints.staff.staffWorkLogs(staffId));
  },

  createWorkLog: async (staffId: string, payload: CreateWorkLogPayload): Promise<ProjectStaffWorkLog> => {
    return apiClient.post<ProjectStaffWorkLog>(endpoints.staff.createWorkLog(staffId), payload);
  },
};
