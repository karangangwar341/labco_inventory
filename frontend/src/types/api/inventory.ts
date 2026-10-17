import { StockCondition } from './common';

export interface StockBalanceDto {
  id: string;
  locationId: string;
  locationName?: string;
  locationType?: 'WAREHOUSE' | 'CLIENT';
  warehouseId?: string | null;
  clientId?: string | null;
  productId: string;
  productName?: string;
  brand?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  batchNumber?: string;
  usableQty: number;
  reservedQty: number;
  damagedQty: number;
  expiredQty: number;
  physicalQty: number;
  availableQty: number;
  unit?: string;
  version: number;
  minThreshold?: number;
  updatedAt?: string;
}

export interface StockLocationDto {
  id: string;
  locationType: 'WAREHOUSE' | 'CLIENT';
  warehouseId?: string | null;
  clientId?: string | null;
  name: string;
}

export interface StockTransactionDto {
  id: string;
  locationId: string;
  productId: string;
  productName?: string;
  transactionType: string;
  quantity: number;
  condition: StockCondition;
  batchNumber?: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
  createdBy: string;
  isReversal: boolean;
  reversalOfTxId?: string;
}

export interface CorrectTransactionDto {
  reason: string;
  replacementLines?: Array<{
    productId: string;
    quantity: number;
    condition: StockCondition;
    batchNumber?: string;
    locationId: string;
  }>;
}
