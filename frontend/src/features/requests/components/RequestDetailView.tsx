'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StockRequest, StockRequestLine } from '../requests.types';
import { requestsService } from '../requests.service';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/layout/PageHeader';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';

export function RequestDetailView({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<StockRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    requestsService
      .getRequestById(requestId)
      .then((data) => setRequest(data))
      .catch(() => setRequest(null))
      .finally(() => setLoading(false));
  }, [requestId]);

  const handleCancel = async () => {
    if (!request) return;
    try {
      await requestsService.cancelRequest(request.id);
      const refreshed = await requestsService.getRequestById(request.id);
      setRequest(refreshed);
      setActionMsg(`Request ${request.requestNumber} cancelled and stock reservations released.`);
    } catch {
      setActionMsg('Failed to cancel request.');
    }
  };

  if (loading) {
    return <LoadingState message="Loading request details..." />;
  }

  if (!request) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock Request Details" />
        <EmptyState
          title="Stock request not found"
          description={`Unable to locate stock request with ID [${requestId}].`}
          action={
            <Link href="/requests">
              <Button variant="secondary">Back to Requests</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isPending = request.status === 'PENDING_APPROVAL';
  const isDraft = request.status === 'DRAFT';

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Request ${request.requestNumber}`}
        description="Detailed line items and atomic reservation status."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/requests">
              <Button variant="secondary" size="sm">← Back to Requests</Button>
            </Link>
            {(isDraft || isPending) && (
              <Button variant="danger" size="sm" onClick={handleCancel}>
                Cancel Request &amp; Release Stock
              </Button>
            )}
          </div>
        }
      />

      {actionMsg && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-xs text-[#18794e]">
          {actionMsg}
        </div>
      )}

      {/* Meta Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 border border-[#dbe3ee] rounded-xl shadow-xs text-xs">
        <div>
          <span className="text-[#5b6678] block">Status</span>
          <Badge variant={isPending ? 'warning' : request.status === 'APPROVED' ? 'success' : 'neutral'}>
            {request.status}
          </Badge>
        </div>
        <div>
          <span className="text-[#5b6678] block">Priority</span>
          <span className="font-semibold text-[#172033]">{request.priority}</span>
        </div>
        <div>
          <span className="text-[#5b6678] block">Requester</span>
          <span className="font-semibold text-[#172033]">{request.requesterUsername || request.requesterId}</span>
        </div>
        <div>
          <span className="text-[#5b6678] block">Location</span>
          <span className="font-semibold text-[#172033]">{request.locationName || request.locationId}</span>
        </div>
      </div>

      {/* Lines Table */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#172033]">Requested Line Items</h3>
        <Table>
          <TableHeader sticky>
            <tr>
              <TableHead>Product</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Batch / Lot</TableHead>
              <TableHead>Reservation Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {request.lines.map((line: StockRequestLine, idx: number) => (
              <TableRow key={idx}>
                <TableCell className="font-semibold text-[#172033]">{line.productName || line.productId}</TableCell>
                <TableCell className="font-bold text-[#172033]">{line.quantity}</TableCell>
                <TableCell className="text-[#5b6678]">{line.unit || 'units'}</TableCell>
                <TableCell className="text-[#172033]">{line.condition}</TableCell>
                <TableCell className="text-[#5b6678]">{line.batchNumber || 'AUTO_FIFO'}</TableCell>
                <TableCell>
                  <Badge variant={isPending ? 'warning' : 'neutral'}>
                    {isPending ? 'RESERVED (HELD)' : 'COMMITTED / RELEASED'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default RequestDetailView;
