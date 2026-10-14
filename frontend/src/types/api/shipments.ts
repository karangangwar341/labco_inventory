import { ShipmentStatus, StockCondition } from './common';

export interface ShipmentLineDto {
  id: string;
  productId: string;
  productName?: string;
  dispatchedQty: number;
  receivedQty: number;
  discrepancyQty: number;
  condition: StockCondition;
  batchNumber?: string;
}

export interface ShipmentDto {
  id: string;
  shipmentNumber: string;
  sourceLocationId?: string;
  sourceWarehouseName?: string;
  destinationLocationId: string;
  destinationName?: string;
  status: ShipmentStatus;
  dispatchedAt: string;
  receivedAt?: string;
  notes?: string;
  lines: ShipmentLineDto[];
}

export interface ReceiveShipmentDto {
  lines: Array<{
    lineId: string;
    receivedQty: number;
    discrepancyReason?: string;
  }>;
}

export interface ApproveReceiptDto {
  discrepancyResolution?: 'ACCEPT_RECEIVED' | 'QUARANTINE_DISCREPANCY';
  idempotencyKey?: string;
}
