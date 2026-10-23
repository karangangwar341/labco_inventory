'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { StockRequestLine } from '../requests.types';
import { requestsService } from '../requests.service';
import { useAuth } from '../../auth/auth.store';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardContent } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { DeliveryChallanModal } from './DeliveryChallanModal';
import { queryKeys } from '../../../lib/query/query-keys';
import { invalidation } from '../../../lib/query/invalidation';

export function RequestDetailView({ requestId }: { requestId: string }) {
  const { user, role } = useAuth();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: request, isLoading: loading, refetch } = useQuery({
    queryKey: queryKeys.requests.detail(requestId),
    queryFn: () => requestsService.getRequestById(requestId),
    enabled: Boolean(requestId),
    staleTime: 2 * 60 * 1000,
  });
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showChallanModal, setShowChallanModal] = useState(false);

  // Super Admin Decision Modals
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);

  useEffect(() => {
    if (searchParams.get('challan') === 'true') setShowChallanModal(true);
  }, [searchParams]);

  const refreshRequest = async () => {
    await refetch();
  };

  const handleCancel = async () => {
    if (!request) return;
    const confirmText =
      request.status === 'PENDING_APPROVAL'
        ? 'Cancel this request? Held stock will be released.'
        : 'Cancel this draft?';

    if (!window.confirm(confirmText)) return;

    try {
      await requestsService.cancelRequest(request.id);
      await refreshRequest();
      await invalidation.afterRequestMutation(queryClient);
      setActionMsg({
        type: 'success',
        text:
          request.status === 'PENDING_APPROVAL'
            ? 'Request cancelled. Held stock has been released.'
            : 'Draft cancelled.',
      });
    } catch {
      setActionMsg({ type: 'error', text: 'Failed to cancel the request.' });
    }
  };

  const handleSubmitDraft = async () => {
    if (!request) return;
    setIsSubmitting(true);
    setActionMsg(null);
    try {
      const submitted = await requestsService.submitRequest(request.id);
      queryClient.setQueryData(queryKeys.requests.detail(requestId), submitted);
      await invalidation.afterRequestMutation(queryClient);
      setActionMsg({
        type: 'success',
        text: 'Request sent for Super Admin approval.',
      });
    } catch (error) {
      setActionMsg({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to send request.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!request) return;
    setIsDeciding(true);
    try {
      const approved = await requestsService.approveRequest(request.id, approvalNotes.trim() || undefined);
      queryClient.setQueryData(queryKeys.requests.detail(requestId), approved);
      await invalidation.afterInventoryApproval(queryClient);
      setShowApproveModal(false);
      setActionMsg({
        type: 'success',
        text: 'Request approved. Stock balances updated.',
      });
    } catch (error) {
      setActionMsg({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to approve request.',
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleReject = async () => {
    if (!request || !rejectionReason.trim()) return;
    setIsDeciding(true);
    try {
      await requestsService.rejectRequest(request.id, rejectionReason.trim());
      await refreshRequest();
      await invalidation.afterRequestMutation(queryClient);
      setShowRejectModal(false);
      setActionMsg({
        type: 'success',
        text: 'Request rejected. Held stock has been released.',
      });
    } catch (error) {
      setActionMsg({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to reject request.',
      });
    } finally {
      setIsDeciding(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading request..." />;
  }

  if (!request) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock Request Details" />
        <EmptyState
          title="Stock request not found"
          description="This stock request could not be found. It may have been archived or removed."
          action={
            <Link href="/requests">
              <Button variant="secondary">Back to Requests</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isRequester = user?.id === request.requesterId;
  const isPending = request.status === 'PENDING_APPROVAL';
  const isDraft = request.status === 'DRAFT';
  const isApproved = request.status === 'APPROVED';
  const isRejected = request.status === 'REJECTED';

  const reqNumber = request.requestNumber || 'Stock request';

  const isProjectAdmin = user?.role === 'PROJECT_ADMIN';

  const typeLabel =
    isProjectAdmin
      ? 'Inbound Restock'
      : request.requestType === 'STOCK_IN'
      ? 'Stock Arrival'
      : request.requestType === 'DISPATCH' || request.requestType === 'STOCK_OUT'
      ? 'Project Dispatch'
      : request.requestType === 'TRANSFER'
      ? 'Transfer'
      : request.requestType || 'Movement';

  const originName =
    isProjectAdmin
      ? 'Central Supply'
      : request.sourceLocation?.warehouse?.name ||
        request.sourceLocation?.project?.name ||
        request.sourceType ||
        (request.requestType === 'STOCK_IN' ? 'Supplier' : 'Warehouse');

  const destinationName =
    request.destinationLocation?.project?.name ||
    request.destinationLocation?.warehouse?.name ||
    request.project?.name ||
    (request.requestType === 'STOCK_IN' ? 'Warehouse Stock' : 'Project Store');

  const totalUnits = request.lines.reduce((sum, l) => sum + Number(l.quantity || 0), 0);

  return (
    <div className="space-y-4 max-w-5xl">
      {/* 1. Header with Title, Status Badge & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Stock Request {reqNumber}
            </h1>
            <Badge
              variant={
                isApproved
                  ? 'success'
                  : isPending
                  ? 'warning'
                  : isRejected
                  ? 'danger'
                  : 'neutral'
              }
              size="sm"
              withDot
            >
              {request.status.replaceAll('_', ' ')}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            {typeLabel} · <strong className="text-slate-700">{originName}</strong> → <strong className="text-slate-700">{destinationName}</strong>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowChallanModal(true)}
            className="flex items-center gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50 font-medium"
            title="View, print, download, or share Delivery Challan / Dispatch Receipt"
          >
            <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Delivery Challan</span>
          </Button>

          <Link href="/requests">
            <Button variant="secondary" size="sm">
              ← Requests
            </Button>
          </Link>

          {isDraft && (
            <>
              <Link href={`/requests/new?edit=${request.id}`}>
                <Button variant="secondary" size="sm">
                  Edit
                </Button>
              </Link>
              <Button variant="primary" size="sm" isLoading={isSubmitting} onClick={handleSubmitDraft}>
                Send for Approval
              </Button>
              <Button variant="quiet" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          )}

          {isPending && (
            <>
              {isSuperAdmin && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setApprovalNotes('');
                      setShowApproveModal(true);
                    }}
                  >
                    ✓ Approve
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setRejectionReason('');
                      setShowRejectModal(true);
                    }}
                    className="text-rose-700 border-rose-200 hover:bg-rose-50"
                  >
                    ✕ Reject
                  </Button>
                </div>
              )}

              {(isRequester || isSuperAdmin) && !isSuperAdmin && (
                <Button variant="quiet" size="sm" onClick={handleCancel}>
                  Cancel Request
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action Notification Message */}
      {actionMsg && (
        <div
          className={`py-2 px-3 rounded-lg border text-xs flex items-center justify-between ${
            actionMsg.type === 'success'
              ? 'bg-blue-50 border-blue-200 text-blue-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-slate-600 ml-2">✕</button>
        </div>
      )}

      {/* 2. Compact Metadata Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-lg border border-slate-200/90 text-xs shadow-2xs">
        <div>
          <span className="text-slate-400 block text-[11px]">Movement</span>
          <span className="font-semibold text-slate-800">{typeLabel}</span>
        </div>
        <div>
          <span className="text-slate-400 block text-[11px]">Route</span>
          <span className="font-medium text-slate-700 truncate block" title={`${originName} → ${destinationName}`}>
            {originName} → {destinationName}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[11px]">Requested By</span>
          <span className="text-slate-700">
            {request.requester?.username || request.requesterUsername || 'Store Staff'} · {new Date(request.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[11px]">Total Volume</span>
          <span className="font-semibold text-slate-900">
            {request.lines.length} items · {totalUnits.toLocaleString()} units
          </span>
        </div>
      </div>

      {/* Status Notice if Pending or Rejected */}
      {isPending && (
        <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-center justify-between">
          <span>
            ⏳ <strong>Pending Approval:</strong>{' '}
            {isProjectAdmin
              ? 'Your restock order has been received and is reserved for fulfillment.'
              : 'Stock is reserved at the origin facility while this request is reviewed.'}
          </span>
          <span className="text-slate-400 font-mono text-[10px]">Priority: {request.priority || 'NORMAL'}</span>
        </div>
      )}

      {isRejected && (
        <div className="py-2 px-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <span>⚠️</span>
          <span><strong>Rejected:</strong> {request.rejectionReason || 'No reason specified'}</span>
        </div>
      )}

      {/* 3. Items Table */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-800">Requested Items</span>
          <span className="text-slate-500 font-medium">
            {request.lines.length} line item{request.lines.length === 1 ? '' : 's'}
          </span>
        </div>

        <Table>
          <TableHeader>
            <tr>
              <TableHead className="w-10 text-center text-[11px]">#</TableHead>
              <TableHead className="text-[11px]">Item &amp; Details</TableHead>
              <TableHead className="text-[11px]">Condition</TableHead>
              <TableHead align="right" className="text-[11px]">Quantity</TableHead>
              <TableHead className="text-center text-[11px] w-24">Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {request.lines.map((line: StockRequestLine, idx: number) => {
              const pName = line.productName || line.product?.name || `Item ${idx + 1}`;
              const brand = line.product?.brand;
              const category = line.product?.category?.name;
              const unit = line.unit || line.unitNameSnapshot || 'units';
              const qty = Number(line.quantity || 0);

              return (
                <TableRow key={line.id || idx} className="hover:bg-slate-50/60">
                  <TableCell className="text-center text-[11px] text-slate-400 py-2">
                    {idx + 1}
                  </TableCell>

                  <TableCell className="py-2">
                    <span className="font-semibold text-slate-900 text-xs block">{pName}</span>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      {brand && role !== 'PROJECT_ADMIN' && <span>Brand: {brand}</span>}
                      {category && <span>· {category}</span>}
                    </div>
                  </TableCell>

                  <TableCell className="py-2">
                    <span className="text-xs text-slate-600">{line.condition || 'USABLE'}</span>
                  </TableCell>

                  <TableCell align="right" numeric className="py-2 font-semibold text-slate-900 text-xs">
                    {qty.toLocaleString()} <span className="font-normal text-slate-400">{unit}</span>
                  </TableCell>

                  <TableCell className="text-center py-2">
                    {isPending ? (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Reserved
                      </span>
                    ) : isApproved ? (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Posted
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-600 font-medium">
          <span>Total items: {request.lines.length}</span>
          <span>Sum Quantity: <strong className="text-slate-900">{totalUnits.toLocaleString()} units</strong></span>
        </div>
      </div>

      {/* Note line if exists */}
      {request.reason && (
        <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
          <strong className="text-slate-700 font-medium">Note:</strong> {request.reason}
        </div>
      )}

      {/* Approval history if decided */}
      {request.approvals && request.approvals.length > 0 && (
        <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5">
          <span className="font-semibold text-slate-700 block text-[11px] uppercase tracking-wider font-mono">
            Audit Decision
          </span>
          {request.approvals.map((app) => (
            <div key={app.id} className="flex items-center justify-between text-slate-600">
              <span>
                <strong>{app.decision}</strong> by {app.approver?.username || 'Super Admin'}
                {app.reason ? ` · "${app.reason}"` : ''}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {new Date(app.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Super Admin Approve Modal */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        title={`Approve Request ${reqNumber}`}
        description="Approving this request will immediately post stock deduction and finalize inventory."
      >
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="font-medium text-slate-700">Approval Note (Optional):</label>
            <input
              type="text"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="e.g. Approved for dispatch"
              className="w-full p-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" size="sm" onClick={() => setShowApproveModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" isLoading={isDeciding} onClick={handleApprove}>
              Confirm Approval
            </Button>
          </div>
        </div>
      </Modal>

      {/* Super Admin Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title={`Reject Request ${reqNumber}`}
        description="Provide a reason. The held stock will be released."
      >
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="font-medium text-slate-700">
              Rejection Reason <span className="text-rose-600">*</span>:
            </label>
            <textarea
              rows={2}
              required
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full p-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-rose-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" size="sm" onClick={() => setShowRejectModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isDeciding}
              disabled={!rejectionReason.trim()}
              onClick={handleReject}
              className="bg-rose-600 hover:bg-rose-700 border-rose-600"
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>
      {/* Delivery Challan Document Modal */}
      {request && (
        <DeliveryChallanModal
          isOpen={showChallanModal}
          onClose={() => setShowChallanModal(false)}
          request={request}
        />
      )}
    </div>
  );
}

export default RequestDetailView;
