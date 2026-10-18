import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { actionIdempotency } from '../../lib/api/idempotency';
import {
  Department,
  DepartmentIssue,
  CreateDepartmentPayload,
  CreateDepartmentIssuePayload,
  DepartmentIssueStatus,
  DepartmentReturn,
  CreateDepartmentReturnPayload,
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

  getReturns: async (params?: { clientId?: string; departmentId?: string; condition?: string; status?: string }): Promise<DepartmentReturn[]> =>
    apiClient.get<DepartmentReturn[]>(endpoints.departments.returns(params)),

  createReturn: async (payload: CreateDepartmentReturnPayload): Promise<DepartmentReturn> =>
    apiClient.post<DepartmentReturn>(endpoints.departments.createReturn(), payload),

  approveReturn: async (id: string): Promise<DepartmentReturn> => {
    const actionKey = `approve-department-return-${id}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);
    try {
      const result = await apiClient.post<DepartmentReturn>(
        endpoints.departments.approveReturn(id),
        {},
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
      return result;
    } catch (err) {
      throw err;
    }
  },

  rejectReturn: async (id: string, reason: string): Promise<DepartmentReturn> =>
    apiClient.post<DepartmentReturn>(endpoints.departments.rejectReturn(id), { reason }),

  writeOff: async (payload: {
    clientId: string;
    productId: string;
    batchId?: string;
    condition: 'DAMAGED' | 'EXPIRED';
    quantity: number;
    unitName?: string;
    reason: string;
  }): Promise<unknown> => {
    const actionKey = `write-off-${payload.clientId}-${payload.productId}-${payload.batchId || 'untracked'}-${payload.condition}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);
    try {
      const result = await apiClient.post<unknown>(
        endpoints.departments.writeOff(),
        { ...payload, idempotencyKey },
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
      return result;
    } catch (err) {
      throw err;
    }
  },
};
