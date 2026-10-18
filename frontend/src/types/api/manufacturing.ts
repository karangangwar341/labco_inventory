import { ProductionStatus } from './common';

export interface BOMItemDto {
  productId: string;
  productName?: string;
  quantity: number | string;
  unit?: string;
  unitId?: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
}

export interface ProductionRunDto {
  id: string;
  runNumber: string;
  status: ProductionStatus;
  clientId: string;
  clientName?: string;
  client?: { id: string; name: string };
  locationId: string;
  locationName?: string;
  yieldProductId: string;
  yieldProductName?: string;
  plannedQuantity: number | string;
  plannedOutput?: number | string | null;
  actualOutput?: number | string | null;
  wastage?: number | string | null;
  productionReference?: string | null;
  actualQuantity?: number | string | null;
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
