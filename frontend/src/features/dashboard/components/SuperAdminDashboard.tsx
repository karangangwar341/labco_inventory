'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth.store';
import { queryKeys } from '@/lib/query/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { AlertNotice } from './shared/AlertNotice';
import { approvalsService } from '@/features/approvals/approvals.service';
import { backupsService } from '@/features/backups/backups.service';
import { administrationService } from '@/features/administration/administration.service';
import { inventoryService } from '@/features/inventory/inventory.service';
import { ApprovalTab, QueueItem } from '@/features/approvals/approvals.types';

const EMPTY_APPROVAL_QUEUE: Record<ApprovalTab, QueueItem[]> = {
  REQUESTS: [],
  SHIPMENTS: [],
  MANUFACTURING: [],
  DEPARTMENTS: [],
  CORRECTIONS: [],
};

function toApprovalList(queueData: unknown): QueueItem[] {
  if (Array.isArray(queueData)) return queueData as QueueItem[];
  if (!queueData || typeof queueData !== 'object') return [];

  return Object.values(queueData).flatMap((items) =>
    Array.isArray(items) ? (items as QueueItem[]) : [],
  );
}

export function SuperAdminDashboard() {
  const { user } = useAuth();
  const {
    data: queueData = EMPTY_APPROVAL_QUEUE,
    isLoading: isQueueLoading,
    error: queueError,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: queryKeys.approvals.queue(),
    queryFn: () => approvalsService.getQueue(),
    staleTime: 30 * 1000,
  });

  const queue = toApprovalList(queueData);
  const urgentCount = queue.filter((item) => item.priority === 'URGENT').length;

  const {
    data: backupSummary = null,
    refetch: refetchBackups,
  } = useQuery({
    queryKey: queryKeys.backups.summary(),
    queryFn: () => backupsService.getBackupStatusSummary().catch(() => null),
    staleTime: 2 * 60 * 1000,
  });

  const { data: clients = [], isLoading: isClientsLoading, error: clientsError } = useQuery({
    queryKey: queryKeys.administration.clients(),
    queryFn: administrationService.getClients,
    staleTime: 10 * 60 * 1000,
  });

  const { data: rawBalances = [] } = useQuery({
    queryKey: queryKeys.inventory.balances(user?.id || user?.role),
    queryFn: () => inventoryService.getBalances(),
    staleTime: 2 * 60 * 1000,
  });

  const lowStockBalances = (Array.isArray(rawBalances) ? rawBalances : []).filter(
    (b) => Number(b.minThreshold ?? 0) > 0 && Number(b.availableQty ?? 0) <= Number(b.minThreshold ?? 0)
  );

  const isLoading = isQueueLoading && queue.length === 0;
  const error = queueError ? (queueError as Error).message : null;

  const fetchDashboard = () => {
    void refetchQueue();
    void refetchBackups();
  };

  if (isLoading) return <LoadingState message="Loading governance overview…" />;
  if (error) return <ErrorState title="Approvals could not be loaded" message={error} onRetry={fetchDashboard} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Operations Overview"
        description="Dual-control governance center. Review inbound requests, inventory state transitions, and tenant operations."
        actions={
          <Link href="/approvals">
            <Button variant="primary">
              <span className="flex items-center gap-2">
                <span>Review Approvals Queue</span>
                {queue.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white">
                    {queue.length}
                  </span>
                )}
              </span>
            </Button>
          </Link>
        }
      />

      {backupSummary?.persistentAlertActive && (
        <AlertNotice
          variant="danger"
          title="Backup System Requires Attention"
          message={`${backupSummary.consecutiveFailures} backup attempts have failed. Verify serverless database connectivity.`}
          actionHref="/backups"
          actionLabel="Open Backups Center"
        />
      )}

      {lowStockBalances.length > 0 && (
        <AlertNotice
          variant="warning"
          title={`Low Stock Threshold Alert (${lowStockBalances.length} item${lowStockBalances.length > 1 ? 's' : ''})`}
          message={`${lowStockBalances.length} warehouse inventory items have dropped to or below their critical reorder threshold. Review balances and generate purchase/receipt plans.`}
          actionHref="/inventory?filter=LOW_STOCK"
          actionLabel="Review Low Stock in Inventory"
        />
      )}

      {/* Metric Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Approvals Card */}
        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Pending Approvals</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{queue.length}</span>
            <span className="text-xs text-slate-500">items in queue</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {queue.length === 0 ? 'All transactions up to date' : 'Awaiting Super Admin decision'}
          </p>
        </div>

        {/* Urgent Items Card */}
        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Urgent Attention</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              urgentCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'
            }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{urgentCount}</span>
            {urgentCount > 0 && <Badge variant="danger" withDot size="sm">Action Required</Badge>}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {urgentCount > 0 ? 'Priority transactions awaiting review' : 'No urgent bottlenecks'}
          </p>
        </div>

        {/* Active Client Tenants Card */}
        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Client Tenants</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{clients.length}</span>
            <span className="text-xs text-slate-500">organizations</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Active tenant workspaces</p>
        </div>

        {/* System Health Card */}
        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>System Resiliency</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${backupSummary?.persistentAlertActive ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
              <span className="text-sm font-bold text-slate-900">
                {backupSummary?.persistentAlertActive ? 'Alert' : 'Healthy'}
              </span>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Continuous WAL &amp; PITR Active</p>
        </div>
      </div>

      {/* Main Grid: Needs Review & Client Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Your Review Card */}
        <section aria-labelledby="needs-review-heading" className="saas-card overflow-hidden flex flex-col">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <h2 id="needs-review-heading" className="text-sm font-semibold text-slate-900">
                Pending Decisions
              </h2>
              {queue.length > 0 && (
                <Badge variant="neutral" size="sm">
                  {queue.length}
                </Badge>
              )}
            </div>
            {queue.length > 5 && (
              <Link href="/approvals" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                View all ({queue.length})
              </Link>
            )}
          </div>

          <div className="flex-1 bg-white">
            {queue.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-800">You’re all caught up</p>
                <p className="text-[11px] text-slate-500 mt-0.5">New stock requests and transaction drafts will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {queue.slice(0, 5).map((item) => (
                  <li
                    key={`${item.type}-${item.id}`}
                    className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 tracking-wider uppercase font-mono">
                          {item.type.replaceAll('_', ' ')}
                        </span>
                        {item.priority === 'URGENT' && (
                          <Badge variant="danger" size="sm" withDot>Urgent</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-600 truncate font-medium">
                        {item.details || `Requested by ${item.requester}`}
                      </p>
                    </div>
                    <Link href="/approvals" className="shrink-0">
                      <Button variant="secondary" size="sm">
                        Review
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Client Operations Card */}
        <section aria-labelledby="client-operations-heading" className="saas-card overflow-hidden flex flex-col">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white">
            <div>
              <h2 id="client-operations-heading" className="text-sm font-semibold text-slate-900">
                Client Tenants
              </h2>
            </div>
            <Link href="/admin/organizations" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
              Manage all
            </Link>
          </div>

          <div className="flex-1 bg-white">
            {isClientsLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading client organizations…</div>
            ) : clientsError ? (
              <div className="p-8 text-center text-xs text-red-600">Client overviews could not be loaded.</div>
            ) : clients.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No clients have been onboarded yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {clients.slice(0, 5).map((client) => (
                  <li
                    key={client.id}
                    className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{client.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span>
                          {client.warehouseAssignments?.map((a) => a.warehouse.name).join(', ') || 'No warehouse assigned'}
                        </span>
                      </p>
                    </div>
                    <Link href={`/admin/organizations/${client.id}`} className="shrink-0">
                      <Button variant="ghost" size="sm">
                        Activity →
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default SuperAdminDashboard;
