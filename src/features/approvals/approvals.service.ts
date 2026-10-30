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
    stockWarning: line.stockWarning || undefined,
  }));
}

function locationName(location: any): string | undefined {
  return location?.warehouse?.name || location?.project?.name || location?.name;
}

export const approvalsService = {
  getQueue: async (): Promise<Record<ApprovalTab, QueueItem[]>> => {
    const queue: Record<ApprovalTab, QueueItem[]> = {
      REQUESTS: [],
      SHIPMENTS: [],
      DEPARTMENTS: [],
      CORRECTIONS: [],
    };

    try {
      // Execute independent queue queries concurrently (P-005 / Phase 2)
      const [requestsRes, shipmentsRes, departmentIssuesRes, departmentBatchesRes] =
        await Promise.all([
          apiClient
            .get<any[]>(endpoints.stockRequests.list({ status: 'PENDING_APPROVAL' }))
            .catch(() => []),
          apiClient
            .get<any[]>(endpoints.shipments.list({ status: 'AWAITING_RECEIPT_APPROVAL' }))
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
        const projectId = r.projectId || r.project?.id || r.destinationLocation?.projectId || r.sourceLocation?.projectId;
        const projectName = r.project?.name || r.destinationLocation?.project?.name || r.sourceLocation?.project?.name;
        return {
          id: r.id,
          type: `STOCK_REQUEST (${requestType})`,
          requester: r.requesterUsername || r.requester?.username || 'Store Admin',
          location,
          projectId,
          projectName,
          details: r.reason || r.notes || 'Review the requested products and quantities.',
          quantitySummary: `${lineItems.length} ${lineItems.length === 1 ? 'product' : 'products'}`,
          lineItems,
          createdAt: r.submittedAt ? new Date(r.submittedAt).toLocaleString() : r.createdAt ? new Date(r.createdAt).toLocaleString() : 'Recent',
          createdAtRaw: r.submittedAt || r.createdAt,
          priority: (r.priority === 'URGENT' ? 'URGENT' : 'NORMAL') as 'NORMAL' | 'URGENT',
        };
      });

      queue.SHIPMENTS = (Array.isArray(shipmentsRes) ? shipmentsRes : []).map((s) => ({
        id: s.id,
        type: 'SHIPMENT RECEIPT APPROVAL',
        requester: s.recipientUsername || 'Project Admin',
        location: s.destinationName || s.destinationLocation?.name || 'Project Location',
        projectId: s.destinationLocation?.projectId || s.projectId,
        projectName: s.destinationLocation?.project?.name || s.destinationName,
        details: `The project confirmed receipt${s.shipmentNumber ? ` for shipment ${s.shipmentNumber}` : ''}. Approve to add the received quantities to project stock.${s.notes ? ` Note: ${s.notes}` : ''}`,
        quantitySummary: `${s.lines?.length || 0} lines · awaiting receipt approval`,
        lineItems: (s.lines || []).map((line: any, index: number) => ({
          id: line.id || `shipment-line-${index}`,
          productName: line.product?.name || line.productName || `Item ${index + 1}`,
          quantity: asDisplayQuantity(line.dispatchedQty ?? line.quantity),
          unitName: line.unitName || line.unitNameSnapshot,
          label: 'Dispatched',
          quantityNote: line.receivedQty != null || line.discrepancyQty != null
            ? `Received: ${asDisplayQuantity(line.receivedQty)} · Discrepancy: ${asDisplayQuantity(line.discrepancyQty)}`
            : undefined,
        })),
        createdAt: s.dispatchedAt ? new Date(s.dispatchedAt).toLocaleString() : 'Recent',
        createdAtRaw: s.dispatchedAt || s.createdAt,
        priority: 'URGENT',
      }));

      queue.DEPARTMENTS = (Array.isArray(departmentIssuesRes) ? departmentIssuesRes : []).map((d) => ({
        id: d.id,
        type: 'DEPARTMENT_ISSUE',
        requester: d.issuedBy?.username || d.requesterName || 'Department Admin',
        location: d.department?.name || d.departmentName || 'Project department',
        projectId: d.projectId || d.department?.projectId,
        projectName: d.project?.name || d.department?.project?.name,
        details: d.notes || 'Review the requested product and quantity.',
        quantitySummary: `${asDisplayQuantity(d.quantity)} ${d.unit?.unitName || d.unitNameSnapshot || ''}`.trim(),
        lineItems: [{
          id: d.id,
          productName: d.product?.name || d.productName || 'Product',
          quantity: asDisplayQuantity(d.quantity),
          unitName: d.unit?.unitName || d.unitNameSnapshot,
        }],
        createdAt: d.createdAt ? new Date(d.createdAt).toLocaleString() : 'Recent',
        createdAtRaw: d.createdAt,
        priority: 'NORMAL',
      }));

      queue.DEPARTMENTS.push(...(Array.isArray(departmentBatchesRes) ? departmentBatchesRes : []).map((batch) => ({
        id: `batch:${batch.id}`,
        type: 'DEPARTMENT_ISSUE_BATCH',
        requester: batch.createdBy?.username || 'Project Admin',
        location: batch.project?.name || 'Project departments',
        projectId: batch.projectId || batch.project?.id,
        projectName: batch.project?.name,
        details: 'Review all department issues together. Approval posts every line atomically.',
        quantitySummary: `${batch.issues?.length || 0} issue lines · one decision`,
        lineItems: (batch.issues || []).map((issue: any, index: number) => ({
          id: issue.id || `issue-${index}`,
          productName: issue.product?.name || 'Product',
          quantity: asDisplayQuantity(issue.quantity),
          unitName: issue.unit?.unitName || issue.unitNameSnapshot,
          label: issue.department?.name || 'Department',
        })),
        createdAt: batch.submittedAt ? new Date(batch.submittedAt).toLocaleString() : 'Recent',
        createdAtRaw: batch.submittedAt || batch.createdAt,
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
        } else if (tab === 'DEPARTMENTS') {
      if (id.startsWith('batch:')) {
        await apiClient.post(endpoints.departments.rejectIssueBatch(id.slice(6)), { reason });
      } else {
        await apiClient.post(endpoints.departments.rejectIssue(id), { reason });
      }
    }
  },

  approveManufacturingBatch: async (
    runIds: string[],
    notes?: string,
  ): Promise<{ count: number; status: string }> => {
    const actionKey = `approve-mfg-batch-${runIds.join('-')}`;
    const idempotencyKey = actionIdempotency.getKey(actionKey);

    try {
      const res = await apiClient.post<{ count: number; status: string }>(
        endpoints.manufacturing.approveBatch(),
        { runIds, reason: notes, idempotencyKey },
        { idempotencyKey },
      );
      actionIdempotency.clearKey(actionKey);
      return res;
    } catch (err) {
      throw err;
    }
  },

  rejectManufacturingBatch: async (
    runIds: string[],
    reason: string,
  ): Promise<{ count: number; status: string }> => {
    return apiClient.post<{ count: number; status: string }>(
      endpoints.manufacturing.rejectBatch(),
      { runIds, reason },
    );
  },
};
