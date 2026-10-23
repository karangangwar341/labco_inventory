import { apiClient } from "../../lib/api/client";
import { endpoints } from "../../lib/api/endpoints";
import { actionIdempotency } from "../../lib/api/idempotency";
import {
  ProductionRun,
  CreateProductionRunPayload,
  ProductionStatus,
  ProductionCycle,
  ReRunCyclePayload,
  ManufacturingAnalytics,
} from "./manufacturing.types";

export const manufacturingService = {
  getProductionRuns: async (params?: {
    status?: ProductionStatus;
    projectId?: string;
  }): Promise<ProductionRun[]> => {
    return apiClient.get<ProductionRun[]>(
      endpoints.manufacturing.productionRuns(params),
    );
  },

  getProductionCycles: async (): Promise<ProductionCycle[]> => {
    return apiClient.get<ProductionCycle[]>(endpoints.manufacturing.cycles());
  },

  reRunCycle: async (
    id: string,
    payload?: ReRunCyclePayload,
  ): Promise<ProductionRun> => {
    return apiClient.post<ProductionRun>(
      endpoints.manufacturing.reRun(id),
      payload || {},
    );
  },

  getAnalytics: async (params?: {
    projectId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<ManufacturingAnalytics> => {
    return apiClient.get<ManufacturingAnalytics>(
      endpoints.manufacturing.analytics(params),
    );
  },

  checkLowStockCycles: async (): Promise<{
    checkedCyclesCount: number;
    alertedCyclesCount: number;
    cycles: ProductionCycle[];
  }> => {
    return apiClient.post(endpoints.manufacturing.checkLowStockCycles());
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

  updateProductionRun: async (
    id: string,
    payload: CreateProductionRunPayload,
  ): Promise<ProductionRun> => {
    return apiClient.patch<ProductionRun>(
      endpoints.manufacturing.update(id),
      payload,
    );
  },

  deleteProductionRun: async (id: string): Promise<void> => {
    return apiClient.delete(endpoints.manufacturing.delete(id));
  },

  submitProductionRun: async (id: string): Promise<ProductionRun> => {
    return apiClient.post<ProductionRun>(endpoints.manufacturing.submit(id));
  },

  submitProductionRunBatch: async (
    runIds: string[],
    batchNotes?: string,
  ): Promise<{ count: number; status: string }> => {
    return apiClient.post<{ count: number; status: string }>(
      endpoints.manufacturing.submitBatch(),
      { runIds, batchNotes },
    );
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

  approveProductionRunBatch: async (
    runIds: string[],
    notes?: string,
  ): Promise<{ count: number; status: string }> => {
    const actionKey = `approve-mfg-batch-${runIds.join('-')}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);

    try {
      const res = await apiClient.post<{ count: number; status: string }>(
        endpoints.manufacturing.approveBatch(),
        { runIds, reason: notes, idempotencyKey },
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
      return res;
    } catch (err) {
      throw err;
    }
  },

  rejectProductionRun: async (id: string, reason: string): Promise<void> => {
    return apiClient.post(endpoints.manufacturing.reject(id), { reason });
  },

  rejectProductionRunBatch: async (
    runIds: string[],
    reason: string,
  ): Promise<{ count: number; status: string }> => {
    return apiClient.post<{ count: number; status: string }>(
      endpoints.manufacturing.rejectBatch(),
      { runIds, reason },
    );
  },

  completeProductionRun: async (
    id: string,
    actualQuantity?: number,
  ): Promise<ProductionRun> => {
    return apiClient.post<ProductionRun>(endpoints.manufacturing.complete(id), {
      actualQuantity,
    });
  },
};
