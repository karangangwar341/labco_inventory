import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { actionIdempotency } from '../../lib/api/idempotency';
import { QueueItem, ApprovalTab } from './approvals.types';

export const approvalsService = {
  getQueue: async (): Promise<Record<ApprovalTab, QueueItem[]>> => {
    const queue: Record<ApprovalTab, QueueItem[]> = {
      REQUESTS: [],
      SHIPMENTS: [],
      MANUFACTURING: [],
      DEPARTMENTS: [],
      CORRECTIONS: [],
    };

    try {
      // 1. Fetch pending stock requests
      const requests = await apiClient
        .get<any[]>(endpoints.stockRequests.list({ status: 'PENDING_APPROVAL' }))
        .catch(() => []);

      queue.REQUESTS = (Array.isArray(requests) ? requests : []).map((r) => ({
        id: r.id,
        type: `STOCK_REQUEST (${r.type || r.requestType || 'STOCK_OUT'})`,
        requester: r.requesterUsername || r.requester?.username || 'Store Admin',
        location: `${r.locationName || r.sourceLocation?.name || 'Central WH'} -> ${r.destinationName || r.destinationLocation?.name || 'Destination'}`,
        details: r.reason || r.notes || `Stock movement request with ${r.lines?.length || 0} line items`,
        quantitySummary: `${r.lines?.length || 0} items requested`,
        createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString() : 'Recent',
        priority: (r.priority === 'URGENT' ? 'URGENT' : 'NORMAL') as 'NORMAL' | 'URGENT',
      }));

      // 2. Fetch shipments on discrepancy hold or awaiting receipt approval
      const shipments = await apiClient
        .get<any[]>(endpoints.shipments.list({ status: 'DISCREPANCY_HOLD' }))
        .catch(() => []);

      queue.SHIPMENTS = (Array.isArray(shipments) ? shipments : []).map((s) => ({
        id: s.id,
        type: `SHIPMENT (${s.status})`,
        requester: s.recipientUsername || 'Client Admin',
        location: s.destinationName || s.destinationLocation?.name || 'Client Location',
        details: s.notes || `Shipment ${s.shipmentNumber} under quarantine/receipt audit`,
        quantitySummary: `${s.lines?.length || 0} lines dispatched`,
        createdAt: s.dispatchedAt ? new Date(s.dispatchedAt).toLocaleString() : 'Recent',
        priority: 'URGENT',
      }));

      // 3. Fetch pending client manufacturing runs
      const productionRuns = await apiClient
        .get<any[]>(endpoints.manufacturing.productionRuns({ status: 'PENDING_APPROVAL' }))
        .catch(() => []);

      queue.MANUFACTURING = (Array.isArray(productionRuns) ? productionRuns : []).map((p) => ({
        id: p.id,
        type: `PRODUCTION_RUN (${p.runNumber})`,
        requester: p.clientName || 'Client Admin',
        location: p.locationName || 'Client Production Suite',
        details: p.notes || `Production of ${p.plannedQuantity} units for yield product ${p.yieldProductId}`,
        quantitySummary: `Plan: ${p.plannedQuantity} units`,
        createdAt: p.createdAt ? new Date(p.createdAt).toLocaleString() : 'Recent',
        priority: 'NORMAL',
      }));

      // 4. Fetch pending department issues
      const departmentIssues = await apiClient
        .get<any[]>(endpoints.departments.issues({ status: 'PENDING_APPROVAL' }))
        .catch(() => []);

      queue.DEPARTMENTS = (Array.isArray(departmentIssues) ? departmentIssues : []).map((d) => ({
        id: d.id,
        type: `DEPARTMENT_ISSUE (${d.issueNumber})`,
        requester: d.requesterName || 'Department Head',
        location: d.departmentName || 'Client Department',
        details: d.reason || 'Consumables stock requisition',
        quantitySummary: `${d.items?.length || 0} items requested`,
        createdAt: d.createdAt ? new Date(d.createdAt).toLocaleString() : 'Recent',
        priority: 'NORMAL',
      }));

      return queue;
    } catch {
      return queue;
    }
  },

  approveItem: async (tab: ApprovalTab, id: string): Promise<void> => {
    const actionKey = `approve-${tab}-${id}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);

    try {
      if (tab === 'REQUESTS') {
        await apiClient.post(endpoints.stockRequests.approve(id), {}, { idempotencyKey });
      } else if (tab === 'SHIPMENTS') {
        await apiClient.post(endpoints.shipments.approveReceipt(id), {}, { idempotencyKey });
      } else if (tab === 'MANUFACTURING') {
        await apiClient.post(endpoints.manufacturing.approve(id), {}, { idempotencyKey });
      } else if (tab === 'DEPARTMENTS') {
        await apiClient.post(endpoints.departments.approveIssue(id), {}, { idempotencyKey });
      }
      actionIdempotency.clearKey(actionKey);
    } catch (err) {
      throw err;
    }
  },

  rejectItem: async (
    tab: ApprovalTab,
    id: string,
    reason: string,
  ): Promise<void> => {
    if (tab === 'REQUESTS') {
      await apiClient.post(endpoints.stockRequests.reject(id), { reason });
    } else if (tab === 'MANUFACTURING') {
      await apiClient.post(endpoints.manufacturing.reject(id), { reason });
    } else if (tab === 'DEPARTMENTS') {
      await apiClient.post(endpoints.departments.rejectIssue(id), { reason });
    }
  },
};
