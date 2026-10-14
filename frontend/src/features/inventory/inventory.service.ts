import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { StockBalance, StockTransaction, InventoryFilterParams } from './inventory.types';

export const inventoryService = {
  getBalances: async (params?: InventoryFilterParams): Promise<StockBalance[]> => {
    return apiClient.get<StockBalance[]>(endpoints.inventory.balances(params));
  },

  getTransactions: async (): Promise<StockTransaction[]> => {
    return apiClient.get<StockTransaction[]>(endpoints.inventory.transactions());
  },
};
