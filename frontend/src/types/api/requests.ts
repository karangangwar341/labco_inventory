import { RequestStatus, StockCondition } from './common';

export interface StockRequestLineDto {
  id?: string;
  productId: string;
  productName?: string;
  quantity: number;
  unit?: string;
  condition: StockCondition;
  batchNumber?: string;
}

export interface StockRequestDto {
  id: string;
  requestNumber: string;
  type: string;
  status: RequestStatus;
  requesterId: string;
  requesterUsername?: string;
  locationId: string;
  locationName?: string;
  destinationLocationId?: string;
  destinationName?: string;
  priority: 'NORMAL' | 'URGENT';
  notes?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  lines: StockRequestLineDto[];
}

export interface CreateStockRequestDto {
  type: string;
  locationId: string;
  destinationLocationId?: string;
  priority?: 'NORMAL' | 'URGENT';
  notes?: string;
  lines: Array<{
    productId: string;
    quantity: number;
    condition?: StockCondition;
    batchNumber?: string;
  }>;
}

export interface UpdateStockRequestDto {
  priority?: 'NORMAL' | 'URGENT';
  notes?: string;
  lines?: Array<{
    productId: string;
    quantity: number;
    condition?: StockCondition;
    batchNumber?: string;
  }>;
}

export interface ApproveStockRequestDto {
  notes?: string;
  idempotencyKey?: string;
}

export interface RejectStockRequestDto {
  reason: string;
}
