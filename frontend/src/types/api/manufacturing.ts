import { ProductionStatus } from './common';

export interface BOMItemDto {
  productId: string;
  productName?: string;
  quantity: number;
  unit?: string;
}

export interface ProductionRunDto {
  id: string;
  runNumber: string;
  status: ProductionStatus;
  clientId: string;
  clientName?: string;
  locationId: string;
  locationName?: string;
  yieldProductId: string;
  yieldProductName?: string;
  plannedQuantity: number;
  actualQuantity?: number;
  inputLines: BOMItemDto[];
  outputLines: BOMItemDto[];
  notes?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionRunDto {
  locationId: string;
  yieldProductId: string;
  plannedQuantity: number;
  inputLines: Array<{
    productId: string;
    quantity: number;
  }>;
  notes?: string;
}

export interface ApproveProductionRunDto {
  notes?: string;
  idempotencyKey?: string;
}

export interface RejectProductionRunDto {
  reason: string;
}
