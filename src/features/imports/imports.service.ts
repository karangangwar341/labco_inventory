import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import {
  ImportBatchDto,
  ImportRowDto,
} from '../../types/api';
import {
  ImportBatch,
  CreateImportBatchPayload,
  ImportBatchStatus,
  ImportType,
} from './imports.types';
import type { ImportRow } from './imports.types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeRow(row: ImportRowDto): ImportRow {
  const normalizedData = asRecord(row.normalizedDataJson);
  const validationStatus = row.validationStatus;
  return {
    ...row,
    rowIndex: row.rowNumber,
    rawData: asRecord(row.rawDataJson),
    mappedData: normalizedData,
    validationErrors: Array.isArray(row.validationErrors) ? row.validationErrors : [],
    isDuplicate: row.hasDuplicateWarning,
    status: validationStatus === 'VALID' ? 'VALID'
      : validationStatus === 'INVALID' ? 'ERROR'
      : validationStatus,
  };
}

function normalizeBatch(batch: ImportBatchDto): ImportBatch {
  const rows = (batch.rows ?? []).map(normalizeRow);
  return {
    ...batch,
    fileName: batch.sourceFilename,
    totalRows: batch.rows ? rows.length : batch._count?.rows ?? 0,
    validRows: rows.filter((row) => row.status === 'VALID').length,
    errorRows: rows.filter((row) => row.status === 'ERROR').length,
    duplicateRows: rows.filter((row) => row.isDuplicate).length,
    rows,
  };
}

export const importsService = {
  getBatches: async (params?: {
    importType?: ImportType;
    status?: ImportBatchStatus;
  }): Promise<ImportBatch[]> => {
    const batches = await apiClient.get<ImportBatchDto[]>(endpoints.imports.batches(params));
    return batches.map(normalizeBatch);
  },

  getBatchById: async (id: string): Promise<ImportBatch> => {
    const batch = await apiClient.get<ImportBatchDto>(endpoints.imports.byId(id));
    return normalizeBatch(batch);
  },

  createBatch: async (
    payload: CreateImportBatchPayload,
  ): Promise<ImportBatch> => {
    const batch = await apiClient.post<ImportBatchDto>(endpoints.imports.create(), payload);
    return normalizeBatch(batch);
  },

  updateRow: async (
    batchId: string,
    rowId: string,
    mappedData: Record<string, unknown>,
  ): Promise<void> => {
    const row = await apiClient.patch<ImportRowDto>(endpoints.imports.updateRow(batchId, rowId), { normalizedData: mappedData });
    normalizeRow(row);
  },

  submitBatch: async (batchId: string, approvalMode: 'ALL_OR_NOTHING' | 'PARTIAL'): Promise<ImportBatch> => {
    const batch = await apiClient.post<ImportBatchDto>(endpoints.imports.submit(batchId), { approvalMode });
    return normalizeBatch(batch);
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
