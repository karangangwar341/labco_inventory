import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { actionIdempotency } from '../../lib/api/idempotency';
import {
  Department,
  DepartmentIssue,
  DepartmentIssueBatch,
  CreateDepartmentPayload,
  CreateDepartmentIssuePayload,
  DepartmentIssueStatus,
  DepartmentReturn,
  CreateDepartmentReturnPayload,
} from './departments.types';

export const departmentsService = {
  getOpenIssueBatch: async (): Promise<DepartmentIssueBatch> =>
    apiClient.post<DepartmentIssueBatch>(endpoints.departments.issueDraft()),

  getIssueBatches: async (status?: string): Promise<DepartmentIssueBatch[]> =>
    apiClient.get<DepartmentIssueBatch[]>(endpoints.departments.issueBatches({ status })),

  saveIssueBatchLines: async (id: string, issues: CreateDepartmentIssuePayload[]): Promise<DepartmentIssueBatch> =>
    apiClient.patch<DepartmentIssueBatch>(endpoints.departments.issueBatchLines(id), { issues }),

  submitIssueBatch: async (id: string): Promise<DepartmentIssueBatch> =>
    apiClient.post<DepartmentIssueBatch>(endpoints.departments.submitIssueBatch(id)),

  getDepartments: async (projectId?: string): Promise<Department[]> => {
    return apiClient.get<Department[]>(endpoints.departments.list({ projectId }));
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
    projectId?: string;
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

  getReturns: async (params?: { projectId?: string; departmentId?: string; condition?: string; status?: string }): Promise<DepartmentReturn[]> =>
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

};
