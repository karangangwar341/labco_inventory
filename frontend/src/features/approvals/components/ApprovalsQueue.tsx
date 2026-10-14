'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { QueueItem, ApprovalTab } from '../approvals.types';
import { approvalsService } from '../approvals.service';
import { useAuth } from '../../auth/auth.store';
import { canApproveWorkflows } from '../../../lib/auth/permissions';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';

const EMPTY_QUEUE: Record<ApprovalTab, QueueItem[]> = {
  REQUESTS: [],
  SHIPMENTS: [],
  MANUFACTURING: [],
  DEPARTMENTS: [],
  CORRECTIONS: [],
};

export function ApprovalsQueue() {
  const { user } = useAuth();
  const isAuthorized = canApproveWorkflows(user?.role);

  const [activeTab, setActiveTab] = useState<ApprovalTab>('REQUESTS');
  const [items, setItems] = useState<Record<ApprovalTab, QueueItem[]>>(EMPTY_QUEUE);
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'URGENT' | 'NORMAL'>('ALL');
  const [requesterSearch, setRequesterSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [rejectingItem, setRejectingItem] = useState<QueueItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedDetailItem, setSelectedDetailItem] = useState<QueueItem | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchQueue = useCallback(() => {
    setIsLoading(true);
    setErrorMsg(null);
    approvalsService
      .getQueue()
      .then((data) => {
        setItems(data || EMPTY_QUEUE);
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load approvals queue');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleApprove = async (item: QueueItem) => {
    try {
      await approvalsService.approveItem(activeTab, item.id);
      setActionSuccess(`Successfully approved transaction [${item.id}]. Inventory ledger posted atomically.`);
      setSelectedDetailItem(null);
      fetchQueue();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingItem || !rejectionReason.trim()) return;

    try {
      await approvalsService.rejectItem(activeTab, rejectingItem.id, rejectionReason.trim());
      setActionSuccess(`Rejected [${rejectingItem.id}]. Reason logged: "${rejectionReason.trim()}". Reservations released.`);
      setRejectingItem(null);
      setSelectedDetailItem(null);
      setRejectionReason('');
      fetchQueue();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Rejection failed');
    }
  };

  const currentTabItems = useMemo(() => {
    const list = items[activeTab] || [];
    return list.filter((i) => {
      const matchesPriority =
        priorityFilter === 'ALL' || i.priority === priorityFilter;
      const matchesRequester =
        !requesterSearch ||
        i.requester.toLowerCase().includes(requesterSearch.toLowerCase()) ||
        i.id.toLowerCase().includes(requesterSearch.toLowerCase());
      return matchesPriority && matchesRequester;
    });
  }, [items, activeTab, priorityFilter, requesterSearch]);

  const tabs: { key: ApprovalTab; label: string; count: number }[] = [
    { key: 'REQUESTS', label: 'Stock Requests', count: items.REQUESTS?.length || 0 },
    { key: 'SHIPMENTS', label: 'Shipments & Receipts', count: items.SHIPMENTS?.length || 0 },
    { key: 'MANUFACTURING', label: 'Client Manufacturing', count: items.MANUFACTURING?.length || 0 },
    { key: 'DEPARTMENTS', label: 'Department Issues', count: items.DEPARTMENTS?.length || 0 },
    { key: 'CORRECTIONS', label: 'Ledger Corrections', count: items.CORRECTIONS?.length || 0 },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals & Governance Queue"
        description="Pessimistic-locked dual-control ledger approvals. All inventory-affecting transactions require Super Admin decision."
      />

      {/* Authorized Notice */}
      {!isAuthorized && (
        <div className="p-3 bg-[#fef3f2] border border-[#fee4e2] rounded-lg text-xs text-[#b42318] flex items-center gap-2">
          <span>🔒</span>
          <span>
            <strong>Read-Only Inspection Mode:</strong> You can view pending workflow approvals in your scope, but only a Super Admin can approve or reject ledger transactions.
          </span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-xs text-[#18794e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span className="font-semibold">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-[#18794e]">✕</button>
        </div>
      )}

      {errorMsg && (
        <ErrorState message={errorMsg} onRetry={fetchQueue} />
      )}

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-[#dbe3ee] text-xs">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === t.key
                ? 'border-[#2563eb] text-[#2563eb]'
                : 'border-transparent text-[#5b6678] hover:text-[#172033]'
            }`}
          >
            <span>{t.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === t.key
                  ? 'bg-[#eff6ff] text-[#2563eb] font-bold'
                  : 'bg-[#f1f5f9] text-[#5b6678]'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters: Priority & Requester */}
      <div className="p-3 bg-white border border-[#dbe3ee] rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-[#5b6678]">Priority:</span>
          {(['ALL', 'URGENT', 'NORMAL'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-2.5 py-1 rounded-md transition-all ${
                priorityFilter === p
                  ? 'bg-[#2563eb] text-white font-semibold'
                  : 'bg-white border border-[#dbe3ee] text-[#5b6678] hover:bg-[#f8fafc]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search requester or ID..."
            value={requesterSearch}
            onChange={(e) => setRequesterSearch(e.target.value)}
            className="w-full sm:w-60 px-3 py-1 bg-white border border-[#dbe3ee] rounded-md text-[#172033] placeholder-[#5b6678]/60 focus:outline-none focus:border-[#2563eb]"
          />
        </div>
      </div>

      {/* Table Content */}
      {isLoading ? (
        <LoadingState message="Loading pending approval items from backend..." />
      ) : currentTabItems.length === 0 ? (
        <EmptyState
          title={`No pending ${tabs.find((t) => t.key === activeTab)?.label.toLowerCase()} in queue`}
          description="All workflow requests in this queue have been approved or rejected. Nothing pending your review."
        />
      ) : (
        <Table>
          <TableHeader sticky>
            <tr>
              <TableHead>Workflow Item</TableHead>
              <TableHead>Requester</TableHead>
              <TableHead>Location Scope</TableHead>
              <TableHead>Impact &amp; Details</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Decision Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {currentTabItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-bold text-[#172033]">{item.type}</div>
                  <div className="font-mono text-[11px] text-[#5b6678]">{item.id}</div>
                </TableCell>
                <TableCell className="font-semibold text-[#172033]">{item.requester}</TableCell>
                <TableCell className="text-[#5b6678] text-xs">{item.location}</TableCell>
                <TableCell>
                  <div className="text-xs text-[#172033] max-w-sm">{item.details}</div>
                  <div className="text-[11px] font-mono text-[#2563eb] font-semibold mt-0.5">
                    {item.quantitySummary}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={item.priority === 'URGENT' ? 'danger' : 'neutral'}>
                    {item.priority}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-[#5b6678] whitespace-nowrap">
                  {item.createdAt}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedDetailItem(item)}
                    >
                      Inspect
                    </Button>

                    {isAuthorized && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApprove(item)}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setRejectingItem(item)}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Inspect Item Modal */}
      <Modal
        isOpen={!!selectedDetailItem}
        onClose={() => setSelectedDetailItem(null)}
        title="Transaction Audit & Inspection"
      >
        {selectedDetailItem && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg">
              <span className="font-mono text-[10px] uppercase font-bold text-[#2563eb]">
                Workflow Identifier: {selectedDetailItem.id}
              </span>
              <h3 className="text-sm font-bold text-[#172033] mt-1">
                {selectedDetailItem.type}
              </h3>
            </div>

            <div className="space-y-2 border-t border-b border-[#dbe3ee] py-3">
              <div className="flex justify-between">
                <span className="text-[#5b6678]">Requester:</span>
                <span className="font-semibold text-[#172033]">{selectedDetailItem.requester}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5b6678]">Origin / Target:</span>
                <span className="font-semibold text-[#172033]">{selectedDetailItem.location}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5b6678]">Priority Level:</span>
                <Badge variant={selectedDetailItem.priority === 'URGENT' ? 'danger' : 'neutral'}>
                  {selectedDetailItem.priority}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5b6678]">Quantity Summary:</span>
                <span className="font-mono font-bold text-[#2563eb]">
                  {selectedDetailItem.quantitySummary}
                </span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-[#172033] mb-1">Details &amp; Reason</h4>
              <p className="p-2.5 bg-[#f8fafc] border border-[#dbe3ee] rounded-lg text-[#5b6678] leading-relaxed">
                {selectedDetailItem.details}
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelectedDetailItem(null)}>
                Close
              </Button>
              {isAuthorized && (
                <>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setRejectingItem(selectedDetailItem);
                      setSelectedDetailItem(null);
                    }}
                  >
                    Reject Item
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleApprove(selectedDetailItem)}
                  >
                    Approve &amp; Commit
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Mandatory Rejection Dialog */}
      <Modal
        isOpen={!!rejectingItem}
        onClose={() => {
          setRejectingItem(null);
          setRejectionReason('');
        }}
        title="Reject Workflow Request"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-[#fef3f2] border border-[#fee4e2] rounded-lg text-[#b42318] flex items-start gap-2">
            <span>⚠️</span>
            <div>
              <p className="font-semibold">Mandatory Audit Justification</p>
              <p className="text-[11px] mt-0.5">
                Per governance requirements, rejecting a workflow requires an explicit reason. Any reserved inventory will be automatically unreserved and released back to available balance.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#172033] mb-1.5">
              Rejection Reason &amp; Corrective Guidance
            </label>
            <textarea
              required
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why this request is rejected (e.g. incorrect lot specified, invalid requisition quota)..."
              className="w-full px-3 py-2 bg-white border border-[#dbe3ee] rounded-lg text-xs text-[#172033] placeholder-[#5b6678]/60 focus:outline-none focus:border-[#b42318] focus:ring-1 focus:ring-[#b42318]"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setRejectingItem(null);
                setRejectionReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!rejectionReason.trim()}
              onClick={handleConfirmReject}
            >
              Confirm Rejection &amp; Release Stock
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ApprovalsQueue;
