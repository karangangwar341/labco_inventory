import { ShipmentStatus, StockCondition } from './common';

export interface ShipmentLineDto {
  id: string;
  productId: string;
  productName?: string;
  product?: { id: string; name: string };
  dispatchedQty: number;
  receivedQty?: number | null;
  discrepancyQty?: number | null;
  condition: StockCondition;
  batchNumber?: string;
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
    client?: { id: string; name: string } | null;
    warehouse?: { id: string; name: string } | null;
  };
  sourceDescription?: string;
  status: ShipmentStatus;
  dispatchedAt: string;
  receivedAt?: string;
  notes?: string;
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
  discrepancyResolution?: 'ACCEPT_RECEIVED' | 'QUARANTINE_DISCREPANCY';
  idempotencyKey?: string;
}
