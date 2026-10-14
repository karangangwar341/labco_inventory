import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { actionIdempotency } from '../../lib/api/idempotency';
import {
  Shipment,
  ReceiveShipmentDto,
  ApproveReceiptDto,
  ShipmentStatus,
} from './shipments.types';

export const shipmentsService = {
  getShipments: async (params?: {
    status?: ShipmentStatus;
    limit?: number;
    page?: number;
  }): Promise<Shipment[]> => {
    return apiClient.get<Shipment[]>(endpoints.shipments.list(params));
  },

  getShipmentById: async (id: string): Promise<Shipment> => {
    return apiClient.get<Shipment>(endpoints.shipments.byId(id));
  },

  confirmReceipt: async (
    id: string,
    dto: ReceiveShipmentDto,
  ): Promise<Shipment> => {
    return apiClient.post<Shipment>(endpoints.shipments.receive(id), dto);
  },

  approveReceipt: async (
    id: string,
    dto?: ApproveReceiptDto,
  ): Promise<Shipment> => {
    const actionKey = `approve-receipt-${id}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);

    try {
      const res = await apiClient.post<Shipment>(
        endpoints.shipments.approveReceipt(id),
        { ...dto, idempotencyKey },
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
      return res;
    } catch (err) {
      throw err;
    }
  },
};
