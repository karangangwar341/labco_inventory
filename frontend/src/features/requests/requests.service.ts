import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { actionIdempotency } from '../../lib/api/idempotency';
import {
  StockRequest,
  CreateStockRequestPayload,
  UpdateStockRequestPayload,
  RequestStatus,
} from './requests.types';

export const requestsService = {
  getRequests: async (params?: {
    status?: RequestStatus;
    requestType?: string;
    clientId?: string;
    warehouseId?: string;
    limit?: number;
    page?: number;
  }): Promise<StockRequest[]> => {
    return apiClient.get<StockRequest[]>(endpoints.stockRequests.list(params));
  },

  getRequestById: async (id: string): Promise<StockRequest> => {
    return apiClient.get<StockRequest>(endpoints.stockRequests.byId(id));
  },

  createRequest: async (
    payload: CreateStockRequestPayload,
  ): Promise<StockRequest> => {
    return apiClient.post<StockRequest>(endpoints.stockRequests.create(), payload);
  },

  updateRequest: async (
    id: string,
    payload: UpdateStockRequestPayload,
  ): Promise<StockRequest> => {
    return apiClient.patch<StockRequest>(endpoints.stockRequests.update(id), payload);
  },

  submitRequest: async (id: string): Promise<StockRequest> => {
    const actionKey = `submit-request-${id}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);

    try {
      const res = await apiClient.post<StockRequest>(
        endpoints.stockRequests.submit(id),
        {},
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
      return res;
    } catch (err) {
      // Keep key in actionIdempotency on failure to enable safe retry
      throw err;
    }
  },

  cancelRequest: async (id: string): Promise<void> => {
    return apiClient.post(endpoints.stockRequests.cancel(id));
  },

  approveRequest: async (id: string, notes?: string): Promise<StockRequest> => {
    const actionKey = `approve-request-${id}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);

    try {
      const res = await apiClient.post<StockRequest>(
        endpoints.stockRequests.approve(id),
        { notes, idempotencyKey },
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
      return res;
    } catch (err) {
      throw err;
    }
  },

  rejectRequest: async (id: string, reason: string): Promise<void> => {
    return apiClient.post(endpoints.stockRequests.reject(id), { reason });
  },
};
