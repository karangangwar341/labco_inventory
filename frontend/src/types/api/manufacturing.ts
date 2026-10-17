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
  clientId?: string;
  mode?: 'LINKED' | 'SEPARATE';
  productionReference?: string;
  plannedOutput?: number;
  actualOutput?: number;
  wastage?: number;
  inputs: Array<{
    productId: string;
    batchId?: string;
    quantity: number;
    unitId: string;
  }>;
  outputs: Array<{
    productId: string;
    batchNumber?: string;
    expiryDate?: string;
    quantity: number;
    unitId: string;
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
