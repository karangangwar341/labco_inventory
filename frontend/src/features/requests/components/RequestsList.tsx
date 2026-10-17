'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { StockRequest } from '../requests.types';
import { requestsService } from '../requests.service';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StatusLabel } from '../../../components/data-display/StatusLabel';
import { Card, CardContent } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/layout/PageHeader';
import { DataTable, ColumnDef } from '../../../components/ui/DataTable';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { queryKeys } from '../../../lib/query/query-keys';
import { useAuth } from '../../auth/auth.store';

type RequestFilter = 'ALL' | 'OPEN' | 'FINISHED';
type OperationFilter = 'ALL' | 'DISPATCH' | 'STOCK_IN';

function requestMeta(request: StockRequest): { label: string; sublabel: string; variant: 'primary' | 'success' | 'purple' | 'neutral' } {
  const type = (request.requestType || request.type || '').toUpperCase();
  if (type.includes('STOCK_IN')) return { label: 'Stock In', sublabel: 'Inbound Receipt', variant: 'success' };
  if (type.includes('DISPATCH') || type.includes('STOCK_OUT')) return { label: 'Dispatch', sublabel: 'Consignment Out', variant: 'primary' };
  if (type.includes('TRANSFER')) return { label: 'Transfer', sublabel: 'Internal Move', variant: 'purple' };
  if (type.includes('ADJUSTMENT')) return { label: 'Adjustment', sublabel: 'Stock Reconciliation', variant: 'neutral' };
  return { label: 'Stock Movement', sublabel: 'General Request', variant: 'neutral' };
}

function isOpenRequest(status: StockRequest['status']) {
  return status === 'DRAFT' || status === 'PENDING_APPROVAL';
}

export function RequestsList() {
  const { user } = useAuth();
  const {
    data: rawRequests = [],
    isLoading,
    error,
    refetch: fetchRequests,
  } = useQuery({
    queryKey: queryKeys.requests.list(user?.id, { all: true }),
    queryFn: () => requestsService.getRequests(),
    staleTime: 2 * 60 * 1000,
  });
  const requests = Array.isArray(rawRequests) ? rawRequests as StockRequest[] : [];
  const [filter, setFilter] = useState<RequestFilter>('ALL');
  const [opFilter, setOpFilter] = useState<OperationFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const counts = useMemo(() => {
    const open = requests.filter((r) => isOpenRequest(r.status)).length;
    const finished = requests.length - open;
    const dispatches = requests.filter((r) => {
      const t = (r.requestType || r.type || '').toUpperCase();
      return t.includes('DISPATCH') || t.includes('STOCK_OUT');
    }).length;
    const totalUnits = requests.reduce((sum, r) => {
      return sum + (r.lines || []).reduce((lineSum, l) => lineSum + Number(l.quantity || 0), 0);
    }, 0);
    return { all: requests.length, open, finished, dispatches, totalUnits };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      // Status filter
      if (filter === 'OPEN' && !isOpenRequest(request.status)) return false;
      if (filter === 'FINISHED' && isOpenRequest(request.status)) return false;

      // Operation filter
      if (opFilter === 'DISPATCH') {
        const t = (request.requestType || request.type || '').toUpperCase();
        if (!t.includes('DISPATCH') && !t.includes('STOCK_OUT')) return false;
      } else if (opFilter === 'STOCK_IN') {
        const t = (request.requestType || request.type || '').toUpperCase();
        if (!t.includes('STOCK_IN')) return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const ref = (request.requestNumber || request.id).toLowerCase();
        const type = (request.requestType || request.type || '').toLowerCase();
        const loc = (request.locationName || request.destinationName || '').toLowerCase();
        const requester = (request.requesterUsername || '').toLowerCase();
        const itemMatch = request.lines?.some((l) =>
          (l.productName || l.product?.name || '').toLowerCase().includes(query)
        );

        if (!ref.includes(query) && !type.includes(query) && !loc.includes(query) && !requester.includes(query) && !itemMatch) {
          return false;
        }
      }

      return true;
    });
  }, [requests, filter, opFilter, searchQuery]);

  const columns: ColumnDef<StockRequest>[] = useMemo(
    () => [
      {
        id: 'reference',
        header: 'Reference & Route',
        width: '20%',
        minWidth: '180px',
        valign: 'top',
        cell: (request) => {
          const refNumber = request.requestNumber || 'Stock request';
          const locationDisplay = request.destinationName || request.locationName || (request.destinationLocationId ? 'Client Location' : 'Central Warehouse');
          const originDisplay = request.sourceLocation?.warehouse?.name || 'Central Warehouse';
          const isUrgent = request.priority === 'URGENT' || request.priority === 'HIGH';

          return (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-slate-900 tracking-tight">
                  #{refNumber}
                </span>
                {isUrgent && (
                  <Badge variant="danger" size="sm" withDot>
                    Urgent
                  </Badge>
                )}
              </div>
              <div
                className="text-[10px] text-slate-500 flex items-center gap-1 truncate max-w-[170px]"
                title={`${originDisplay} → ${locationDisplay}`}
              >
                <span className="truncate">{originDisplay}</span>
                <span className="text-slate-400">→</span>
                <span className="font-medium text-slate-700 truncate">{locationDisplay}</span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'operation',
        header: 'Operation',
        width: '12%',
        minWidth: '110px',
        valign: 'top',
        cell: (request) => {
          const meta = requestMeta(request);
          return (
            <Badge variant={meta.variant} size="sm">
              {meta.label}
            </Badge>
          );
        },
      },
      {
        id: 'items',
        header: 'Requested Items',
        width: '27%',
        minWidth: '220px',
        valign: 'top',
        cell: (request) => {
          const totalQty = (request.lines || []).reduce((sum, l) => sum + Number(l.quantity || 0), 0);
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
                  {totalQty.toLocaleString()} units
                </span>
                <span className="text-[10px] text-slate-400">
                  ({request.lines?.length || 0} item{(request.lines?.length || 0) !== 1 ? 's' : ''})
                </span>
              </div>
              <div className="space-y-0.5">
                {request.lines && request.lines.length > 0 ? (
                  request.lines.slice(0, 2).map((line, idx) => (
                    <div key={idx} className="text-xs text-slate-700 flex items-baseline gap-1.5 truncate max-w-sm">
                      <span className="font-medium text-slate-900 truncate">
                        {line.productName || line.product?.name || 'Item'}
                      </span>
                      <span className="text-slate-400 text-[10px]">·</span>
                      <span className="font-mono text-[11px] text-slate-600 font-semibold shrink-0">
                        {line.quantity} {line.unit || line.unitNameSnapshot || 'units'}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-slate-400 italic text-xs">No items listed</span>
                )}
                {request.lines && request.lines.length > 2 && (
                  <span className="text-[10px] text-slate-400">
                    +{request.lines.length - 2} more items
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        width: '14%',
        minWidth: '120px',
        valign: 'top',
        cell: (request) => <StatusLabel status={request.status} />,
      },
      {
        id: 'submitted',
        header: 'Submitted',
        width: '12%',
        minWidth: '110px',
        valign: 'top',
        cell: (request) => {
          const dateStr = request.createdAt
            ? new Date(request.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
          return (
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-slate-900 font-mono">{dateStr}</div>
              <div className="text-[10px] text-slate-400 truncate max-w-[100px]" title={request.requesterUsername || 'staff'}>
                by {request.requesterUsername || 'staff'}
              </div>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        width: '15%',
        minWidth: '150px',
        align: 'right',
        valign: 'top',
        cell: (request) => {
          const isDispatch =
            (request.requestType || request.type || '').toUpperCase().includes('DISPATCH') ||
            (request.requestType || request.type || '').toUpperCase().includes('STOCK_OUT');

          return (
            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
              <Link href={`/requests/${request.id}`}>
                <Button variant="secondary" size="sm" className="text-xs px-2.5 py-1">
                  View
                </Button>
              </Link>
              {isDispatch && (
                <Link href={`/requests/${request.id}?challan=true`}>
                  <Button
                    variant="primary"
                    size="sm"
                    className="text-xs px-2 py-1 gap-1 shadow-2xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
                    title="Print or download Delivery Challan"
                  >
                    <span>📄</span>
                    <span>Challan</span>
                  </Button>
                </Link>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="My Stock Requests"
        description="Monitor, approve, and track warehouse dispatches, inbound receipts, and stock transfer vouchers."
        actions={
          <Link href="/requests/new">
            <Button variant="primary" className="shadow-xs gap-1.5 font-medium text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>New Stock Movement</span>
            </Button>
          </Link>
        }
      />

      {/* Operational Executive Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Requests</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 font-mono">{counts.all}</span>
            <span className="text-xs text-slate-500">all movements</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200/90 shadow-2xs hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Pending Approval</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-900 font-mono">{counts.open}</span>
            <span className="text-xs text-amber-700 font-medium">requires action</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Approved &amp; Completed</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 font-mono">{counts.finished}</span>
            <span className="text-xs text-emerald-600 font-medium">finalized</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Units Tracked</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {counts.totalUnits.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">items moved</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Navigation Bar */}
      <Card>
        <CardContent className="p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter requests">
            {(
              [
                ['ALL', 'All Requests', counts.all],
                ['OPEN', 'Waiting for Approval', counts.open],
                ['FINISHED', 'Approved & Completed', counts.finished],
              ] as const
            ).map(([value, label, count]) => {
              const isSelected = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setFilter(value)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-semibold shadow-2xs border border-blue-200/90'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-medium ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Operation Filter & Search */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setOpFilter('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  opFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Operations
              </button>
              <button
                type="button"
                onClick={() => setOpFilter('DISPATCH')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  opFilter === 'DISPATCH' ? 'bg-white text-blue-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dispatches
              </button>
              <button
                type="button"
                onClick={() => setOpFilter('STOCK_IN')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  opFilter === 'STOCK_IN' ? 'bg-white text-emerald-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Stock In
              </button>
            </div>

            <div className="w-full sm:w-64 relative">
              <input
                type="text"
                placeholder="Search ref, item, location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Request Data Table */}
      {error ? (
        <ErrorState title="Requests could not be loaded" message={error instanceof Error ? error.message : 'Could not load your requests.'} onRetry={() => void fetchRequests()} />
      ) : (
        <DataTable
          data={filteredRequests}
          columns={columns}
          keyExtractor={(request) => request.id}
          isLoading={isLoading}
          loadingMessage="Loading your stock requests…"
          minWidth="min-w-[960px]"
          emptyState={{
            title: requests.length === 0 ? 'No requests recorded yet' : 'No requests match your filter',
            description:
              requests.length === 0
                ? 'Initiate a new stock-in or stock-out request to begin tracking inventory movements.'
                : 'Try clearing your search query or selecting a different status tab above.',
            action:
              requests.length === 0 ? (
                <Link href="/requests/new">
                  <Button variant="primary" size="sm">
                    Create First Request
                  </Button>
                </Link>
              ) : undefined,
          }}
          pagination={{
            pageSize: 10,
            pageSizeOptions: [10, 25, 50],
          }}
        />
      )}
    </div>
  );
}

export default RequestsList;
