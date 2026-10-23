import { StockCondition } from './common';

export interface StockBalanceDto {
  id: string;
  locationId: string;
  locationName?: string;
  locationType?: 'WAREHOUSE' | 'PROJECT';
  warehouseId?: string | null;
  projectId?: string | null;
  productId: string;
  productName?: string;
  productKind?: 'RAW_MATERIAL' | 'MANUFACTURED_PRODUCT';
  brand?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  subCategoryName?: string | null;
  subCategoryId?: string | null;
  usableQty: number;
  reservedQty: number;
  availableQty: number;
  physicalQty: number;
  unit?: string;
  version: number;
  minThreshold?: number;
  updatedAt?: string;
}

export interface StockLocationDto {
  id: string;
  locationType: 'WAREHOUSE' | 'PROJECT';
  warehouseId?: string | null;
  projectId?: string | null;
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
    locationId: string;
  }>;
}
