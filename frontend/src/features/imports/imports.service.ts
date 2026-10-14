import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import {
  ImportBatch,
  CreateImportBatchPayload,
  ImportBatchStatus,
  ImportType,
} from './imports.types';

export const importsService = {
  getBatches: async (params?: {
    importType?: ImportType;
    status?: ImportBatchStatus;
  }): Promise<ImportBatch[]> => {
    return apiClient.get<ImportBatch[]>(endpoints.imports.batches(params));
  },

  getBatchById: async (id: string): Promise<ImportBatch> => {
    return apiClient.get<ImportBatch>(endpoints.imports.byId(id));
  },

  createBatch: async (
    payload: CreateImportBatchPayload,
  ): Promise<ImportBatch> => {
    return apiClient.post<ImportBatch>(endpoints.imports.create(), payload);
  },

  updateRow: async (
    batchId: string,
    rowId: string,
    mappedData: Record<string, unknown>,
  ): Promise<void> => {
    return apiClient.patch(endpoints.imports.updateRow(batchId, rowId), {
      mappedData,
    });
  },

  commitBatch: async (
    batchId: string,
    approvalMode?: 'ALL_OR_NOTHING' | 'PARTIAL',
  ): Promise<void> => {
    return apiClient.post(endpoints.imports.approve(batchId), { approvalMode });
  },

  rejectBatch: async (batchId: string, reason: string): Promise<void> => {
    return apiClient.post(endpoints.imports.reject(batchId), { reason });
  },

  validateBatch: async (batchId: string): Promise<void> => {
    return apiClient.post(endpoints.imports.validate(batchId));
  },
};
