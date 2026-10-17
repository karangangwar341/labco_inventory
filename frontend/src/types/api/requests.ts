import { RequestStatus, StockCondition } from './common';

export interface StockRequestLineDto {
  id?: string;
  productId: string;
  productName?: string;
  product?: {
    id: string;
    name: string;
    brand?: string | null;
    category?: { name: string } | null;
  };
  unitId?: string;
  unitNameSnapshot?: string;
  quantity: number | string;
  unit?: string;
  condition: StockCondition;
  batchId?: string | null;
  batchNumber?: string;
  expiryDate?: string | null;
  reservations?: Array<{ id: string; quantityBase: number | string }>;
}

export interface StockRequestDto {
  id: string;
  requestNumber?: string;
  type?: string;
  requestType?: string;
  status: RequestStatus;
  requesterId: string;
  requesterUsername?: string;
  requester?: { id: string; username: string };
  locationId?: string;
  locationName?: string;
  sourceLocationId?: string | null;
  sourceType?: string | null;
  sourceLocation?: {
    id: string;
    warehouse?: { id: string; name: string } | null;
    client?: { id: string; name: string } | null;
  } | null;
  destinationLocationId?: string;
  destinationName?: string;
  destinationLocation?: {
    id: string;
    warehouse?: { id: string; name: string } | null;
    client?: { id: string; name: string } | null;
  } | null;
  clientId?: string | null;
  client?: { id: string; name: string } | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  notes?: string;
  reason?: string;
  rejectionReason?: string;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lines: StockRequestLineDto[];
  approvals?: Array<{
    id: string;
    decision: string;
    reason?: string | null;
    createdAt: string;
    approver?: { id: string; username: string } | null;
  }>;
}

export interface CreateStockRequestDto {
  requestType: 'STOCK_IN' | 'STOCK_OUT' | 'DISPATCH' | 'TRANSFER' | 'ADJUSTMENT';
  sourceType?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  clientId?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  reason?: string;
  lines: Array<{
    productId: string;
    unitId: string;
    quantity: number;
    condition?: StockCondition;
    batchNumber?: string;
    expiryDate?: string;
  }>;
}

export interface UpdateStockRequestDto {
  priority?: 'NORMAL' | 'URGENT';
  reason?: string;
  lines?: Array<{
    productId: string;
    unitId: string;
    quantity: number;
    condition?: StockCondition;
    batchNumber?: string;
    expiryDate?: string;
  }>;
}

export interface ApproveStockRequestDto {
  notes?: string;
  idempotencyKey?: string;
}

export interface RejectStockRequestDto {
  reason: string;
}
