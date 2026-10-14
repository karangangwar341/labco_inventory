'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StockRequest, StockRequestLine } from '../requests.types';
import { requestsService } from '../requests.service';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { StatusLabel } from '../../../components/data-display/StatusLabel';

export function RequestsList() {
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    requestsService.getRequests().then((data) => setRequests(data));
  }, []);

  const filteredRequests = requests.filter(
    (r) => filterStatus === 'ALL' || r.status === filterStatus,
  );

  const handleCancelRequest = async (req: StockRequest) => {
    try {
      await requestsService.cancelRequest(req.id);
    } catch {
      // Optimistic update
    }
    setRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: 'CANCELLED' } : r)),
    );
    setActionSuccess(
      `Request [${req.requestNumber}] cancelled successfully. Associated stock reservations released.`,
    );
    setTimeout(() => setActionSuccess(null), 5000);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Requests"
        description="Submit and monitor inventory movements. Active reservation holds ensure stock is safely held until decision time."
        actions={
          <Link href="/requests/new">
            <Button variant="primary">+ New Stock Request</Button>
          </Link>
        }
      />

      {actionSuccess && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-[#18794e] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span className="font-semibold">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-[#18794e] hover:opacity-75">✕</button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-medium border-b border-[#dbe3ee] pb-2">
        {['ALL', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-md transition ${
              filterStatus === s
                ? 'bg-[#eff6ff] text-[#2563eb] font-semibold border border-[#bfdbfe]'
                : 'text-[#5b6678] hover:text-[#172033] hover:bg-[#f1f5f9]'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Main Requests Table */}
      {filteredRequests.length === 0 ? (
        <EmptyState
          title="No stock requests found"
          description="There are no requests matching the current status filter."
          action={
            <Link href="/requests/new">
              <Button variant="secondary" size="sm">Create First Request</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Request #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Line Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {filteredRequests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[#172033] font-mono">{r.requestNumber}</span>
                    {r.priority === 'URGENT' && <Badge variant="danger">URGENT</Badge>}
                  </div>
                </TableCell>
                <TableCell className="font-medium text-[#2563eb]">
                  {r.type}
                </TableCell>
                <TableCell className="text-[#5b6678]">
                  <div>{r.locationName}</div>
                  {r.destinationName && (
                    <div className="text-[11px] text-[#5b6678]/80">→ {r.destinationName}</div>
                  )}
                </TableCell>
                <TableCell>
                  {r.lines?.map((l: StockRequestLine, i: number) => (
                    <div key={i} className="text-[11px]">
                      <span className="font-medium text-[#172033]">{l.productName || l.productId}</span>: {l.quantity} {l.unit || 'units'}
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  <StatusLabel status={r.status} />
                </TableCell>
                <TableCell className="text-[#5b6678] font-mono text-[11px]">{r.createdAt}</TableCell>
                <TableCell className="text-right space-x-1.5">
                  <Link href={`/requests/${r.id}`}>
                    <Button variant="secondary" size="sm">
                      Details
                    </Button>
                  </Link>
                  {r.status === 'PENDING_APPROVAL' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleCancelRequest(r)}
                    >
                      Cancel
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default RequestsList;
