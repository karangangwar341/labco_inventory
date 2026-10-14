import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { actionIdempotency } from '../../lib/api/idempotency';
import {
  ProductionRun,
  CreateProductionRunPayload,
  ProductionStatus,
} from './manufacturing.types';

export const manufacturingService = {
  getProductionRuns: async (params?: {
    status?: ProductionStatus;
  }): Promise<ProductionRun[]> => {
    return apiClient.get<ProductionRun[]>(
      endpoints.manufacturing.productionRuns(params),
    );
  },

  getProductionRunById: async (id: string): Promise<ProductionRun> => {
    return apiClient.get<ProductionRun>(endpoints.manufacturing.byId(id));
  },

  createProductionRun: async (
    payload: CreateProductionRunPayload,
  ): Promise<ProductionRun> => {
    return apiClient.post<ProductionRun>(
      endpoints.manufacturing.create(),
      payload,
    );
  },

  submitProductionRun: async (id: string): Promise<ProductionRun> => {
    return apiClient.post<ProductionRun>(endpoints.manufacturing.submit(id));
  },

  approveProductionRun: async (
    id: string,
    notes?: string,
  ): Promise<ProductionRun> => {
    const actionKey = `approve-mfg-${id}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);

    try {
      const res = await apiClient.post<ProductionRun>(
        endpoints.manufacturing.approve(id),
        { notes, idempotencyKey },
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
      return res;
    } catch (err) {
      throw err;
    }
  },

  rejectProductionRun: async (
    id: string,
    reason: string,
  ): Promise<void> => {
    return apiClient.post(endpoints.manufacturing.reject(id), { reason });
  },

  completeProductionRun: async (
    id: string,
    actualQuantity?: number,
  ): Promise<ProductionRun> => {
    return apiClient.post<ProductionRun>(
      endpoints.manufacturing.complete(id),
      { actualQuantity },
    );
  },
};
