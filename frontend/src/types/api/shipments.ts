import { ShipmentStatus, StockCondition } from './common';

export interface ShipmentLineDto {
  id: string;
  productId: string;
  productName?: string;
  product?: { id: string; name: string };
  unitName?: string;
  dispatchedQty: number;
  receivedQty?: number | null;
  discrepancyQty?: number | null;
  condition: StockCondition;
}

export interface ShipmentDto {
  id: string;
  shipmentNumber?: string;
  requestId?: string;
  sourceLocationId?: string;
  sourceWarehouseName?: string;
  destinationLocationId: string;
  destinationName?: string;
  sourceLocation?: { warehouse?: { id: string; name: string } | null };
  destinationLocation?: {
    project?: { id: string; name: string } | null;
    warehouse?: { id: string; name: string } | null;
  };
  sourceDescription?: string;
  status: ShipmentStatus;
  dispatchedAt: string;
  receivedAt?: string;
  notes?: string;
  discrepancyResolution?: 'MISSING' | 'CALCULATION_MISTAKE' | null;
  discrepancyResolvedAt?: string | null;
  discrepancyResolvedById?: string | null;
  discrepancyResolutionNote?: string | null;
  lines: ShipmentLineDto[];
}

export interface ReceiveShipmentDto {
  lines: Array<{
    shipmentLineId: string;
    receivedQty: number;
    discrepancyReason?: string;
  }>;
}

export interface ApproveReceiptDto {
  idempotencyKey?: string;
}

export interface ResolveDiscrepancyDto {
  resolution: 'MISSING' | 'CALCULATION_MISTAKE';
  note?: string;
}
