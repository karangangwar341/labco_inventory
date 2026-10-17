import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { actionIdempotency } from '../../lib/api/idempotency';
import {
  Department,
  DepartmentIssue,
  CreateDepartmentPayload,
  CreateDepartmentIssuePayload,
  DepartmentIssueStatus,
} from './departments.types';

export const departmentsService = {
  getDepartments: async (clientId?: string): Promise<Department[]> => {
    return apiClient.get<Department[]>(endpoints.departments.list({ clientId }));
  },

  getDepartmentById: async (id: string): Promise<Department> => {
    return apiClient.get<Department>(endpoints.departments.byId(id));
  },

  createDepartment: async (
    payload: CreateDepartmentPayload,
  ): Promise<Department> => {
    return apiClient.post<Department>(endpoints.departments.create(), payload);
  },

  approveDepartment: async (id: string): Promise<Department> => {
    const actionKey = `approve-department-${id}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);
    try {
      const result = await apiClient.post<Department>(
        endpoints.departments.approve(id),
        {},
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
      return result;
    } catch (err) {
      throw err;
    }
  },

  rejectDepartment: async (id: string, reason: string): Promise<Department> =>
    apiClient.post<Department>(endpoints.departments.reject(id), { reason }),

  getIssues: async (params?: {
    clientId?: string;
    departmentId?: string;
    status?: DepartmentIssueStatus;
  }): Promise<DepartmentIssue[]> => {
    return apiClient.get<DepartmentIssue[]>(
      endpoints.departments.issues(params),
    );
  },

  createIssue: async (
    payload: CreateDepartmentIssuePayload,
  ): Promise<DepartmentIssue> => {
    return apiClient.post<DepartmentIssue>(
      endpoints.departments.createIssue(),
      payload,
    );
  },

  approveIssue: async (id: string): Promise<void> => {
    const actionKey = `approve-issue-${id}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);

    try {
      await apiClient.post(
        endpoints.departments.approveIssue(id),
        {},
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
    } catch (err) {
      throw err;
    }
  },

  rejectIssue: async (id: string, reason: string): Promise<void> => {
    return apiClient.post(endpoints.departments.rejectIssue(id), { reason });
  },
};
