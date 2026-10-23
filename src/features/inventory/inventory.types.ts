import { StockBalanceDto, StockTransactionDto } from '../../types/api';

export type StockBalance = StockBalanceDto;
export type StockTransaction = StockTransactionDto;

export interface InventoryFilterParams {
  locationId?: string;
  productId?: string;
  limit?: number;
  page?: number;
}
