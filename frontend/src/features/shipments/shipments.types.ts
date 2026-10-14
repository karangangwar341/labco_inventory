import {
  ShipmentDto,
  ShipmentLineDto,
  ReceiveShipmentDto,
  ApproveReceiptDto,
  ShipmentStatus,
} from '../../types/api';

export type Shipment = ShipmentDto;
export type ShipmentLine = ShipmentLineDto;
export type { ReceiveShipmentDto, ApproveReceiptDto, ShipmentStatus };
