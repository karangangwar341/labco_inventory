import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { actionIdempotency } from '../../lib/api/idempotency';
import { QueueItem, ApprovalTab } from './approvals.types';

function asDisplayQuantity(value: unknown): string {
  const text = String(value ?? '');
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return text || '—';
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

function mapRequestLines(lines: any[] = []) {
  return lines.map((line, index) => ({
    id: line.id || `${line.productId || 'line'}-${index}`,
    productName: line.product?.name || line.productName || `Item ${index + 1}`,
    quantity: asDisplayQuantity(line.quantity),
    unitName: line.unitNameSnapshot || line.unitName || line.unit?.unitName,
    batchNumber: line.batchNumber || line.batch?.batchNumber || null,
    expiryDate: line.expiryDate || null,
    stockWarning: line.stockWarning || undefined,
  }));
}

function locationName(location: any): string | undefined {
  return location?.warehouse?.name || location?.client?.name || location?.name;
}

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
      // Execute independent queue queries concurrently (P-005 / Phase 2)
      const [requestsRes, shipmentsRes, productionRunsRes, departmentIssuesRes, departmentBatchesRes] =
        await Promise.all([
          apiClient
            .get<any[]>(endpoints.stockRequests.list({ status: 'PENDING_APPROVAL' }))
            .catch(() => []),
          apiClient
            .get<any[]>(endpoints.shipments.list({ status: 'AWAITING_RECEIPT_APPROVAL' }))
            .catch(() => []),
          apiClient
            .get<any[]>(endpoints.manufacturing.productionRuns({ status: 'PENDING_APPROVAL' }))
            .catch(() => []),
          apiClient
            .get<any[]>(endpoints.departments.issues({ status: 'PENDING_APPROVAL' }))
            .catch(() => []),
          apiClient
            .get<any[]>(endpoints.departments.issueBatches({ status: 'PENDING_APPROVAL' }))
            .catch(() => []),
        ]);

      queue.REQUESTS = (Array.isArray(requestsRes) ? requestsRes : []).map((r) => {
        const lineItems = mapRequestLines(r.lines || []);
        const source = locationName(r.sourceLocation);
        const destination = locationName(r.destinationLocation);
        const requestType = r.requestType || r.type || 'STOCK_OUT';
        const location = requestType === 'STOCK_IN'
          ? `Into ${destination || source || 'Location not available'}`
          : requestType === 'STOCK_OUT'
            ? `Out of ${source || destination || 'Location not available'}`
            : source && destination ? `${source} → ${destination}` : source || destination || 'Location not available';
        return {
        id: r.id,
        type: `STOCK_REQUEST (${requestType})`,
        requester: r.requesterUsername || r.requester?.username || 'Store Admin',
        location,
        details: r.reason || r.notes || 'Review the requested products and quantities.',
        quantitySummary: `${lineItems.length} ${lineItems.length === 1 ? 'product' : 'products'}`,
        lineItems,
        createdAt: r.submittedAt ? new Date(r.submittedAt).toLocaleString() : r.createdAt ? new Date(r.createdAt).toLocaleString() : 'Recent',
        priority: (r.priority === 'URGENT' ? 'URGENT' : 'NORMAL') as 'NORMAL' | 'URGENT',
        };
      });

      queue.SHIPMENTS = (Array.isArray(shipmentsRes) ? shipmentsRes : []).map((s) => ({
        id: s.id,
        type: 'SHIPMENT RECEIPT APPROVAL',
        requester: s.recipientUsername || 'Client Admin',
        location: s.destinationName || s.destinationLocation?.name || 'Client Location',
        details: `The client confirmed receipt${s.shipmentNumber ? ` for shipment ${s.shipmentNumber}` : ''}. Approve to add the received quantities to client stock.${s.notes ? ` Note: ${s.notes}` : ''}`,
        quantitySummary: `${s.lines?.length || 0} lines · awaiting receipt approval`,
        lineItems: (s.lines || []).map((line: any, index: number) => ({
          id: line.id || `shipment-line-${index}`,
          productName: line.product?.name || line.productName || `Item ${index + 1}`,
          quantity: asDisplayQuantity(line.dispatchedQty ?? line.quantity),
          unitName: line.unitName || line.unitNameSnapshot,
          batchNumber: line.batch?.batchNumber || line.batchNumber || null,
          label: 'Dispatched',
          quantityNote: line.receivedQty != null || line.discrepancyQty != null
            ? `Received: ${asDisplayQuantity(line.receivedQty)} · Discrepancy: ${asDisplayQuantity(line.discrepancyQty)}`
            : undefined,
        })),
        createdAt: s.dispatchedAt ? new Date(s.dispatchedAt).toLocaleString() : 'Recent',
        priority: 'URGENT',
      }));

      queue.MANUFACTURING = (Array.isArray(productionRunsRes) ? productionRunsRes : []).map((p) => {
        const inputs = (p.inputs || []).map((line: any, index: number) => ({
          id: line.id || `input-${index}`,
          productName: line.product?.name || line.productName || `Input ${index + 1}`,
          quantity: asDisplayQuantity(line.quantity),
          unitName: line.unitNameSnapshot,
          label: 'Input',
        }));
        const outputs = (p.outputs || []).map((line: any, index: number) => ({
          id: line.id || `output-${index}`,
          productName: line.product?.name || line.productName || `Output ${index + 1}`,
          quantity: asDisplayQuantity(line.quantity),
          unitName: line.unitNameSnapshot,
          label: 'Output',
        }));
        return {
        id: p.id,
        type: `PRODUCTION_RUN${p.runNumber || p.productionReference ? ` (${p.runNumber || p.productionReference})` : ''}`,
        requester: p.submittedBy?.username || p.client?.name || 'Client Admin',
        location: p.client?.name || 'Client location',
        details: p.notes || `Review the production plan${p.plannedOutput ? ` for ${asDisplayQuantity(p.plannedOutput)} units` : ''}.`,
        quantitySummary: `${inputs.length} inputs · ${outputs.length} outputs`,
        lineItems: [...inputs, ...outputs],
        createdAt: p.createdAt ? new Date(p.createdAt).toLocaleString() : 'Recent',
        priority: 'NORMAL',
        };
      });

      queue.DEPARTMENTS = (Array.isArray(departmentIssuesRes) ? departmentIssuesRes : []).map((d) => ({
        id: d.id,
        type: 'DEPARTMENT_ISSUE',
        requester: d.issuedBy?.username || d.requesterName || 'Department Admin',
        location: d.department?.name || d.departmentName || 'Client department',
        details: d.notes || 'Review the requested product and quantity.',
        quantitySummary: `${asDisplayQuantity(d.quantity)} ${d.unit?.unitName || d.unitNameSnapshot || ''}`.trim(),
        lineItems: [{
          id: d.id,
          productName: d.product?.name || d.productName || 'Product',
          quantity: asDisplayQuantity(d.quantity),
          unitName: d.unit?.unitName || d.unitNameSnapshot,
          batchNumber: d.batch?.batchNumber || null,
        }],
        createdAt: d.createdAt ? new Date(d.createdAt).toLocaleString() : 'Recent',
        priority: 'NORMAL',
      }));

      queue.DEPARTMENTS.push(...(Array.isArray(departmentBatchesRes) ? departmentBatchesRes : []).map((batch) => ({
        id: `batch:${batch.id}`,
        type: 'DEPARTMENT_ISSUE_BATCH',
        requester: batch.createdBy?.username || 'Client Admin',
        location: batch.client?.name || 'Client departments',
        details: 'Review all department issues together. Approval posts every line atomically.',
        quantitySummary: `${batch.issues?.length || 0} issue lines · one decision`,
        lineItems: (batch.issues || []).map((issue: any, index: number) => ({
          id: issue.id || `issue-${index}`,
          productName: issue.product?.name || 'Product',
          quantity: asDisplayQuantity(issue.quantity),
          unitName: issue.unit?.unitName || issue.unitNameSnapshot,
          batchNumber: issue.batch?.batchNumber || null,
          label: issue.department?.name || 'Department',
        })),
        createdAt: batch.submittedAt ? new Date(batch.submittedAt).toLocaleString() : 'Recent',
        priority: 'NORMAL' as const,
      })));

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
        if (id.startsWith('batch:')) {
          await apiClient.post(endpoints.departments.approveIssueBatch(id.slice(6)), {}, { idempotencyKey });
        } else {
          await apiClient.post(endpoints.departments.approveIssue(id), {}, { idempotencyKey });
        }
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
      if (id.startsWith('batch:')) {
        await apiClient.post(endpoints.departments.rejectIssueBatch(id.slice(6)), { reason });
      } else {
        await apiClient.post(endpoints.departments.rejectIssue(id), { reason });
      }
    }
  },
};
