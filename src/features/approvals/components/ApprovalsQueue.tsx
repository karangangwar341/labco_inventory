'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueueItem, ApprovalTab } from '../approvals.types';
import { approvalsService } from '../approvals.service';
import { useAuth } from '../../auth/auth.store';
import { canApproveWorkflows } from '../../../lib/auth/permissions';
import { queryKeys } from '../../../lib/query/query-keys';
import { invalidation } from '../../../lib/query/invalidation';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader } from '../../../components/layout/PageHeader';
import { DataTable, ColumnDef } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { administrationService } from '../../administration/administration.service';
import {
  DateQuickFilterBar,
  DateQuickFilter,
  isDateInRange,
} from '../../../components/data-display/DateQuickFilterBar';

const EMPTY_QUEUE: Record<ApprovalTab, QueueItem[]> = {
  REQUESTS: [],
  SHIPMENTS: [],
  MANUFACTURING: [],
  DEPARTMENTS: [],
  CORRECTIONS: [],
};

const VALID_TABS: ApprovalTab[] = ['REQUESTS', 'SHIPMENTS', 'MANUFACTURING', 'DEPARTMENTS', 'CORRECTIONS'];

const QUICK_REJECTION_REASONS = [
  'Insufficient available stock at facility',
  'Quantity or product discrepancy',
  'Duplicate requisition submission',
  'Incomplete department allocation details',
];

function sanitizeError(msg: string): string {
  return msg.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '').replace(/\s{2,}/g, ' ').trim();
}

export function ApprovalsQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as ApprovalTab | null;
  const priorityParam = searchParams.get('priority');
  const idParam = searchParams.get('id');
  const isAuthorized = canApproveWorkflows(user?.role);

  const VALID_DATE_FILTERS: DateQuickFilter[] = ['TODAY', 'YESTERDAY', 'LAST_WEEK', 'LAST_MONTH', 'ALL'];
  const dateParam = searchParams.get('dateRange') as DateQuickFilter | null;

  const [activeTab, setActiveTab] = useState<ApprovalTab>(() => {
    if (tabParam && VALID_TABS.includes(tabParam)) {
      return tabParam;
    }
    return 'REQUESTS';
  });
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'URGENT' | 'NORMAL'>(() =>
    priorityParam === 'URGENT' || priorityParam === 'NORMAL' ? priorityParam : 'ALL',
  );
  const [requesterSearch, setRequesterSearch] = useState('');

  const [rejectingItem, setRejectingItem] = useState<QueueItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedDetailItem, setSelectedDetailItem] = useState<QueueItem | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Projectwise & Time-Series Date Filters
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [dateFilter, setDateFilter] = useState<DateQuickFilter>(() => {
    if (dateParam && VALID_DATE_FILTERS.includes(dateParam)) return dateParam;
    return 'TODAY';
  });
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Persist tab & filter state across queue switches (SA-01)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    if (dateFilter !== 'TODAY') params.set('dateRange', dateFilter);
    else params.delete('dateRange');
    if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
    else params.delete('priority');
    const newQuery = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState(null, '', `${window.location.pathname}${newQuery}`);
  }, [activeTab, dateFilter, priorityFilter]);

  // Query: Projects for project-based filtering
  const { data: projects = [] } = useQuery({
    queryKey: ['administration', 'projects'],
    queryFn: () => administrationService.getProjects(),
    enabled: isAuthorized,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: items = EMPTY_QUEUE,
    isLoading,
    error,
    refetch: fetchQueue,
  } = useQuery({
    queryKey: queryKeys.approvals.queue(),
    queryFn: () => approvalsService.getQueue(),
    staleTime: 30 * 1000,
  });

  // Synchronize tab from URL if present
  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    setPriorityFilter(priorityParam === 'URGENT' || priorityParam === 'NORMAL' ? priorityParam : 'ALL');
  }, [priorityParam]);

  // Synchronize item inspection modal from URL id if present
  useEffect(() => {
    if (idParam && items[activeTab]?.length) {
      const match = items[activeTab].find((i) => i.id === idParam);
      if (match) {
        setSelectedDetailItem(match);
      }
    }
  }, [idParam, items, activeTab]);

  const approveMutation = useMutation({
    mutationFn: ({ tab, id }: { tab: ApprovalTab; id: string }) =>
      approvalsService.approveItem(tab, id),
    onSuccess: (_, variables) => {
      setActionSuccess('Request approved. The stock update has been recorded.');
      setSelectedDetailItem(null);
      invalidation.afterInventoryApproval(queryClient);
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(sanitizeError(err instanceof Error ? err.message : 'Approval failed'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ tab, id, reason }: { tab: ApprovalTab; id: string; reason: string }) =>
      approvalsService.rejectItem(tab, id, reason),
    onSuccess: (_, variables) => {
      setActionSuccess(`Request rejected. Reason saved: "${variables.reason}".`);
      setRejectingItem(null);
      setSelectedDetailItem(null);
      setRejectionReason('');
      invalidation.afterInventoryApproval(queryClient);
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(sanitizeError(err instanceof Error ? err.message : 'Rejection failed'));
    },
  });

  const batchApproveMutation = useMutation({
    mutationFn: (runIds: string[]) =>
      approvalsService.approveManufacturingBatch(runIds, 'Approved Day-End batch'),
    onSuccess: (res) => {
      setActionSuccess(`Batch approved! ${res.count} continuous production run(s) approved and inventory updated.`);
      invalidation.afterInventoryApproval(queryClient);
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: unknown) => {
      setErrorMsg(sanitizeError(err instanceof Error ? err.message : 'Batch approval failed'));
    },
  });

  const handleApprove = (item: QueueItem) => {
    setErrorMsg(null);
    approveMutation.mutate({ tab: activeTab, id: item.id });
  };

  const handleConfirmReject = () => {
    if (!rejectingItem || !rejectionReason.trim()) return;
    setErrorMsg(null);
    rejectMutation.mutate({
      tab: activeTab,
      id: rejectingItem.id,
      reason: rejectionReason.trim(),
    });
  };

  // Multi-Select Batch Actions State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Clear selections when switching tab, project, or date
  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab, selectedProjectId, dateFilter]);

  const allCurrentTabList = items[activeTab] || [];

  // Count items from earlier days to show in the hint pill when TODAY is selected
  const olderItemsCount = useMemo(() => {
    return allCurrentTabList.filter((i) => {
      if (selectedProjectId && i.projectId !== selectedProjectId) return false;
      return !isDateInRange(i.createdAtRaw || i.createdAt, 'TODAY');
    }).length;
  }, [allCurrentTabList, selectedProjectId]);

  const currentTabItems = useMemo(() => {
    return allCurrentTabList.filter((i) => {
      const matchesPriority =
        priorityFilter === 'ALL' || i.priority === priorityFilter;
      const matchesRequester =
        !requesterSearch ||
        i.requester.toLowerCase().includes(requesterSearch.toLowerCase()) ||
        i.id.toLowerCase().includes(requesterSearch.toLowerCase()) ||
        (i.location && i.location.toLowerCase().includes(requesterSearch.toLowerCase())) ||
        (i.projectName && i.projectName.toLowerCase().includes(requesterSearch.toLowerCase()));
      const matchesProject =
        !selectedProjectId ||
        i.projectId === selectedProjectId ||
        (i.location &&
          i.location.toLowerCase().includes(
            projects.find((c: any) => c.id === selectedProjectId)?.name?.toLowerCase() || '',
          ));
      const matchesDate = isDateInRange(
        i.createdAtRaw || i.createdAt,
        dateFilter,
        customStart,
        customEnd,
      );
      return matchesPriority && matchesRequester && matchesProject && matchesDate;
    });
  }, [
    allCurrentTabList,
    priorityFilter,
    requesterSearch,
    selectedProjectId,
    dateFilter,
    customStart,
    customEnd,
    projects,
  ]);

  const tabs: { key: ApprovalTab; label: string; count: number }[] = [
    { key: 'REQUESTS', label: 'Stock Requests', count: items.REQUESTS?.length || 0 },
    { key: 'SHIPMENTS', label: 'Shipments & Receipts', count: items.SHIPMENTS?.length || 0 },
    { key: 'MANUFACTURING', label: 'Project Manufacturing', count: items.MANUFACTURING?.length || 0 },
    { key: 'DEPARTMENTS', label: 'Department Issues', count: items.DEPARTMENTS?.length || 0 },
    { key: 'CORRECTIONS', label: 'Ledger Corrections', count: items.CORRECTIONS?.length || 0 },
  ];

  const isAllSelected =
    currentTabItems.length > 0 &&
    currentTabItems.every((item) => selectedIds.includes(item.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(currentTabItems.map((item) => item.id));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleBulkApprove = async () => {
    if (!selectedIds.length) return;
    setIsBulkProcessing(true);
    setErrorMsg(null);

    try {
      if (activeTab === 'MANUFACTURING') {
        const res = await approvalsService.approveManufacturingBatch(selectedIds, 'Approved batch runs');
        setActionSuccess(`Batch approved! ${res.count} production run(s) approved and inventory updated.`);
      } else {
        let successCount = 0;
        const failures: string[] = [];
        for (const id of selectedIds) {
          try {
            await approvalsService.approveItem(activeTab, id);
            successCount++;
          } catch (err) {
            failures.push(err instanceof Error ? err.message : 'Item failed');
          }
        }
        if (failures.length) {
          setErrorMsg(
            `Approved ${successCount} item(s), but ${failures.length} item(s) failed: ${failures[0]}`,
          );
        } else {
          setActionSuccess(`Successfully approved and posted all ${successCount} transactions.`);
        }
      }
      setSelectedIds([]);
      invalidation.afterInventoryApproval(queryClient);
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err) {
      setErrorMsg(sanitizeError(err instanceof Error ? err.message : 'Bulk approval failed'));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const columns: ColumnDef<QueueItem>[] = useMemo(
    () => [
      ...(isAuthorized
        ? [
            {
              id: 'select',
              header: () => (
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  title={isAllSelected ? 'Deselect all' : 'Select all'}
                />
              ),
              width: '4%',
              minWidth: '38px',
              valign: 'top' as const,
              cell: (item: QueueItem) => (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggleSelectItem(item.id)}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer mt-0.5"
                />
              ),
            },
          ]
        : []),
      {
        id: 'item',
        header: 'Workflow Item',
        width: '12%',
        minWidth: '110px',
        valign: 'top',
        cell: (item) => (
          <div className="space-y-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
              {item.type.replaceAll('_', ' ')}
            </span>
          </div>
        ),
      },
      {
        id: 'requester',
        header: 'Requester',
        width: '12%',
        minWidth: '110px',
        valign: 'top',
        cell: (item) => (
          <div className="flex items-center gap-1.5 text-slate-800 font-medium text-xs">
            <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">
              {item.requester.slice(0, 2).toUpperCase()}
            </div>
            <span className="truncate" title={item.requester}>
              {item.requester}
            </span>
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Location Scope',
        width: '14%',
        minWidth: '130px',
        valign: 'top',
        cell: (item) => (
          <div className="text-xs text-slate-600 flex items-start gap-1">
            <svg
              className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="leading-snug">{item.location}</span>
          </div>
        ),
      },
      {
        id: 'details',
        header: 'Impact & Details',
        width: '24%',
        minWidth: '200px',
        valign: 'top',
        cell: (item) => (
          <div className="space-y-1.5">
            <p className="text-xs text-slate-800 font-medium line-clamp-2" title={item.details}>
              {item.details}
            </p>
            {item.lineItems && item.lineItems.length > 0 && (
              <div className="flex flex-col gap-1 items-start">
                <div className="flex flex-wrap gap-1 items-center">
                  {item.lineItems.slice(0, 2).map((line) => (
                    <span
                      key={line.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600"
                    >
                      <span className="font-medium text-slate-800">{line.productName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-slate-700">
                        {line.quantity}
                        {line.unitName ? ` ${line.unitName}` : ''}
                      </span>
                    </span>
                  ))}
                  {item.lineItems.length > 2 && (
                    <span className="text-[10px] text-slate-400 font-medium px-1">
                      +{item.lineItems.length - 2} more
                    </span>
                  )}
                </div>
                {item.lineItems.some((l) => l.stockWarning) && (
                  <div className="mt-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded text-[11px] leading-tight">
                    ⚠️ {item.lineItems.find((l) => l.stockWarning)?.stockWarning}
                  </div>
                )}
              </div>
            )}
            <div className="text-[11px] font-mono text-blue-600 font-semibold">
              {item.quantitySummary}
            </div>
          </div>
        ),
      },
      {
        id: 'priority',
        header: 'Priority',
        width: '8%',
        minWidth: '70px',
        valign: 'top',
        cell: (item) => (
          <Badge
            variant={item.priority === 'URGENT' ? 'danger' : 'neutral'}
            withDot={item.priority === 'URGENT'}
          >
            {item.priority}
          </Badge>
        ),
      },
      {
        id: 'submitted',
        header: 'Submitted',
        width: '10%',
        minWidth: '95px',
        valign: 'top',
        cell: (item) => {
          const dateObj = new Date(item.createdAt);
          const isValid = !isNaN(dateObj.getTime());
          if (isValid) {
            return (
              <div className="font-mono text-[11px] text-slate-500 leading-tight">
                <div>{dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            );
          }
          const parts = item.createdAt.split(', ');
          return (
            <div className="font-mono text-[11px] text-slate-500 leading-tight">
              <div>{parts[0]}</div>
              {parts[1] && <div className="text-[10px] text-slate-400 mt-0.5">{parts[1]}</div>}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Decision Actions',
        align: 'right',
        width: '20%',
        minWidth: '210px',
        valign: 'top',
        cell: (item) => (
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
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
                  disabled={approveMutation.isPending}
                >
                  Approve
                </Button>
                {activeTab !== 'SHIPMENTS' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setRejectingItem(item)}
                    disabled={rejectMutation.isPending}
                  >
                    Reject
                  </Button>
                )}
              </>
            )}
          </div>
        ),
      },
    ],
    [isAuthorized, activeTab, approveMutation.isPending, rejectMutation.isPending, selectedIds, isAllSelected]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals & Governance Queue"
        description="Dual-control transaction decisions. Commits update available, reserved, and usable balances atomically."
      />

      {/* Authorized Notice */}
      {!isAuthorized && (
        <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-center gap-2.5 shadow-xs">
          <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>
            <strong>Read-Only Inspection Mode:</strong> You can view pending workflow approvals in your scope, but only a Super Admin can execute ledger decisions.
          </span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-semibold">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900 p-1">
            ✕
          </button>
        </div>
      )}

      {(errorMsg || (error instanceof Error ? error.message : null)) && (
        <ErrorState
          title={errorMsg ? "Approval Decision Failed" : "Failed to load content"}
          message={errorMsg || (error instanceof Error ? sanitizeError(error.message) : 'Error loading approvals')}
          onRetry={() => { setErrorMsg(null); fetchQueue(); }}
        />
      )}

      {/* Segmented Tab Bar */}
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-none border-b border-slate-200 text-xs pb-0.5" role="tablist" aria-label="Approval categories">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`shrink-0 pb-2.5 px-3 font-semibold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <span>{t.label}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                activeTab === t.key
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-3 text-xs shadow-xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
            {/* Priority Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium shrink-0">Priority:</span>
              <div className="flex items-center gap-1">
                {(['ALL', 'URGENT', 'NORMAL'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      priorityFilter === p
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Project Filter (Super Admin / Authorized) */}
            {isAuthorized && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <span className="text-slate-500 font-medium shrink-0">Project:</span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full sm:w-auto px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-600 focus:bg-white text-xs"
                >
                  <option value="">All Projects</option>
                  {projects.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="w-full md:w-auto relative">
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search requester or reference..."
              value={requesterSearch}
              onChange={(e) => setRequesterSearch(e.target.value)}
              className="w-full md:w-64 pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600 transition-all text-xs"
            />
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="pt-2 border-t border-slate-100">
          <DateQuickFilterBar
            value={dateFilter}
            onChange={setDateFilter}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            totalOlderCount={olderItemsCount}
            onViewOlder={() => setDateFilter('ALL')}
          />
        </div>
      </div>

      {/* Day-End Manufacturing Batch Approval Banner */}
      {activeTab === 'MANUFACTURING' && currentTabItems.length > 0 && (
        <div className="p-3.5 bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">
                🏭 Continuous Production Day-End Batch ({currentTabItems.length} runs pending)
              </span>
              <Badge variant="warning">Day-End Queue</Badge>
            </div>
            <p className="text-slate-600 mt-0.5">
              Continuous diagnostic production cycles submitted today. Approve individual runs below, or execute a single consolidated approval for all {currentTabItems.length} runs.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            isLoading={batchApproveMutation.isPending}
            onClick={() => {
              batchApproveMutation.mutate(currentTabItems.map((item) => item.id));
            }}
          >
            ✓ Approve All ({currentTabItems.length}) Runs
          </Button>
        </div>
      )}

      {/* Floating Multi-Row Batch Action Bar */}
      {selectedIds.length > 0 && (
        <div className="p-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-xl shadow-md border border-blue-500/80 flex flex-wrap items-center justify-between gap-3 text-xs animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-xs">
              {selectedIds.length}
            </span>
            <span className="font-semibold text-white">
              {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected in {tabs.find((t) => t.key === activeTab)?.label}
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-blue-200 hover:text-white underline text-xs font-medium ml-2"
            >
              Clear selection
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isBulkProcessing}
              onClick={handleBulkApprove}
              className="bg-white text-blue-900 hover:bg-blue-50 font-bold px-4 py-1.5 shadow-xs border-0 text-xs"
            >
              {isBulkProcessing ? 'Posting Decisions...' : `⚡ Approve Selected (${selectedIds.length})`}
            </Button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={currentTabItems}
        columns={columns}
        keyExtractor={(item) => item.id}
        isLoading={isLoading}
        minWidth="min-w-[920px]"
        emptyState={{
          title: `No pending ${tabs.find((t) => t.key === activeTab)?.label.toLowerCase()} in queue`,
          description: 'All workflow requests in this queue have been approved or rejected. Nothing pending your review.',
        }}
      />

      {/* Inspect Item Modal */}
      <Modal
        isOpen={!!selectedDetailItem}
        onClose={() => setSelectedDetailItem(null)}
        title="Transaction Audit & Inspection"
      >
        {selectedDetailItem && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl">
              <h3 className="text-sm font-bold text-slate-900 mt-1">
                {selectedDetailItem.type.replaceAll('_', ' ')}
              </h3>
            </div>

            <div className="space-y-2.5 border-t border-b border-slate-200/80 py-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Requester:</span>
                <span className="font-semibold text-slate-900">{selectedDetailItem.requester}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Origin / Target:</span>
                <span className="font-semibold text-slate-900">{selectedDetailItem.location}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Priority Level:</span>
                <Badge variant={selectedDetailItem.priority === 'URGENT' ? 'danger' : 'neutral'} withDot={selectedDetailItem.priority === 'URGENT'}>
                  {selectedDetailItem.priority}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Quantity Summary:</span>
                <span className="font-mono font-bold text-blue-600">
                  {selectedDetailItem.quantitySummary}
                </span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-1.5">Details &amp; Justification</h4>
              <p className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-slate-600 leading-relaxed">
                {selectedDetailItem.details}
              </p>
            </div>

            {selectedDetailItem.lineItems && selectedDetailItem.lineItems.length > 0 && (
              <div>
                <h4 className="font-bold text-slate-900 mb-2">Products and quantities</h4>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white overflow-hidden">
                  {selectedDetailItem.lineItems.map((line) => (
                    <div key={line.id} className="p-3.5 space-y-1.5">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div>
                          {line.label && <span className="mr-1 text-slate-400 font-medium">{line.label}:</span>}
                          <span className="font-semibold text-slate-900">{line.productName}</span>
                        </div>
                        <span className="font-semibold text-slate-900">{line.quantity}{line.unitName ? ` ${line.unitName}` : ''}</span>
                      </div>
                      {line.quantityNote && <div className="text-right text-[11px] text-slate-400">{line.quantityNote}</div>}
                      {line.stockWarning && (
                        <div className="p-2 bg-amber-50/80 border border-amber-200/80 rounded-lg text-[11px] text-amber-900 leading-relaxed font-normal">
                          ⚠️ {line.stockWarning}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setSelectedDetailItem(null)}>
                Close
              </Button>
              {isAuthorized && (
                <>
                  {activeTab !== 'SHIPMENTS' && (
                    <Button
                      variant="danger"
                      onClick={() => {
                        setRejectingItem(selectedDetailItem);
                        setSelectedDetailItem(null);
                      }}
                    >
                      Reject Item
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => handleApprove(selectedDetailItem)}
                  >
                    {activeTab === 'SHIPMENTS' ? 'Approve receipt & stock in' : 'Approve & Commit'}
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
          <div className="p-3.5 bg-red-50/70 border border-red-200/80 rounded-xl text-red-900 flex items-start gap-2.5">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-semibold">Mandatory Audit Justification</p>
              <p className="text-[11px] mt-0.5 text-red-700/80 leading-relaxed">
                Per governance requirements, rejecting a workflow requires an explicit reason. Any reserved inventory will be automatically unreserved and released back to available balance.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Rejection Reason &amp; Corrective Guidance
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_REJECTION_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setRejectionReason((prev) => prev ? `${prev}; ${reason}` : reason)}
                  className="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200/80 transition-colors text-left"
                >
                  + {reason}
                </button>
              ))}
            </div>
            <textarea
              required
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why this request is rejected (e.g. incorrect quantity or invalid requisition quota)..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-600 focus:bg-white focus:ring-1 focus:ring-red-600 transition-all"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
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
