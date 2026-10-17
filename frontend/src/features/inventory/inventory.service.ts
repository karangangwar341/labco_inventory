import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { StockBalance, StockTransaction, InventoryFilterParams } from './inventory.types';
import { StockLocationDto } from '../../types/api';

export const inventoryService = {
  getLocations: async (): Promise<StockLocationDto[]> => {
    return apiClient.get<StockLocationDto[]>(endpoints.inventory.locations());
  },

  getLowStockCount: async (): Promise<{ count: number }> => {
    return apiClient.get<{ count: number }>(endpoints.inventory.lowStockCount());
  },

  getBalances: async (params?: InventoryFilterParams): Promise<StockBalance[]> => {
    return apiClient.get<StockBalance[]>(endpoints.inventory.balances(params));
  },

  getTransactions: async (): Promise<StockTransaction[]> => {
    return apiClient.get<StockTransaction[]>(endpoints.inventory.transactions());
  },
};
