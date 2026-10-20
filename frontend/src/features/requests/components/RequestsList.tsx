'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { StockRequest } from '../requests.types';
import { requestsService } from '../requests.service';
import { administrationService } from '../../administration/administration.service';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StatusLabel } from '../../../components/data-display/StatusLabel';
import { Card, CardContent } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/layout/PageHeader';
import { DataTable, ColumnDef } from '../../../components/ui/DataTable';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { queryKeys } from '../../../lib/query/query-keys';
import { useAuth } from '../../auth/auth.store';
import { groupItemsByDay } from '../../../lib/utils/date-grouping';

type StatusFilter = 'ALL' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'DRAFT';
type RequestTypeFilter = 'ALL' | 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'ADJUSTMENT';

function requestMeta(request: StockRequest, isClientAdmin?: boolean): {
  label: string;
  sublabel: string;
  variant: 'primary' | 'success' | 'purple' | 'warning' | 'neutral';
} {
  const type = (request.requestType || request.type || '').toUpperCase();
  if (isClientAdmin) {
    return { label: 'Inbound Restock', sublabel: 'Central Supply Order', variant: 'success' };
  }
  if (type.includes('STOCK_IN')) {
    return { label: 'Stock In', sublabel: 'Inbound Receipt', variant: 'success' };
  }
  if (type.includes('DISPATCH') || type.includes('STOCK_OUT')) {
    return { label: 'Client Dispatch', sublabel: 'Consignment Out', variant: 'primary' };
  }
  if (type.includes('TRANSFER')) {
    return { label: 'Transfer', sublabel: 'Internal Move', variant: 'purple' };
  }
  if (type.includes('ADJUSTMENT')) {
    return { label: 'Adjustment', sublabel: 'Reconciliation', variant: 'warning' };
  }
  return { label: type || 'Movement', sublabel: 'General Request', variant: 'neutral' };
}

export function RequestsList() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isStoreAdmin = user?.role === 'STORE_ADMIN';

  // Filter States
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const value = searchParams.get('status');
    return value && ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DRAFT'].includes(value)
      ? (value as StatusFilter)
      : 'ALL';
  });
  const [typeFilter, setTypeFilter] = useState<RequestTypeFilter>(() => {
    const value = searchParams.get('type');
    return value && ['STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'ADJUSTMENT'].includes(value)
      ? (value as RequestTypeFilter)
      : 'ALL';
  });
  const [selectedClientId, setSelectedClientId] = useState(() => searchParams.get('clientId') || '');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(() => searchParams.get('warehouseId') || '');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');

  // Query: Clients for dropdown filter
  const { data: clients = [] } = useQuery({
    queryKey: ['administration', 'clients'],
    queryFn: () => administrationService.getClients(),
    enabled: isSuperAdmin || isStoreAdmin,
    staleTime: 5 * 60 * 1000,
  });

  // Query: Warehouses for dropdown filter
  const { data: warehouses = [] } = useQuery({
    queryKey: ['administration', 'warehouses'],
    queryFn: () => administrationService.getWarehouses(),
    staleTime: 5 * 60 * 1000,
  });

  // Query: Stock Requests
  const {
    data: rawRequests = [],
    isLoading,
    error,
    refetch: fetchRequests,
  } = useQuery({
    queryKey: queryKeys.requests.list(user?.id, {
      clientId: selectedClientId || undefined,
      warehouseId: selectedWarehouseId || undefined,
      requestType: typeFilter === 'ALL' ? undefined : typeFilter,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
    }),
    queryFn: () =>
      requestsService.getRequests({
        clientId: selectedClientId || undefined,
        warehouseId: selectedWarehouseId || undefined,
        requestType: typeFilter === 'ALL' ? undefined : typeFilter,
        status: statusFilter === 'ALL' ? undefined : (statusFilter as any),
      }),
    staleTime: 2 * 60 * 1000,
  });

  const requests = Array.isArray(rawRequests) ? (rawRequests as StockRequest[]) : [];

  // Summary Metrics
  const counts = useMemo(() => {
    const all = requests.length;
    const pending = requests.filter((r) => r.status === 'PENDING_APPROVAL').length;
    const approved = requests.filter((r) => r.status === 'APPROVED').length;
    const rejected = requests.filter((r) => r.status === 'REJECTED').length;
    const drafts = requests.filter((r) => r.status === 'DRAFT').length;

    const stockIn = requests.filter((r) =>
      (r.requestType || r.type || '').toUpperCase().includes('STOCK_IN'),
    ).length;
    const stockOut = requests.filter((r) => {
      const t = (r.requestType || r.type || '').toUpperCase();
      return t.includes('STOCK_OUT') || t.includes('DISPATCH');
    }).length;
    const transfers = requests.filter((r) =>
      (r.requestType || r.type || '').toUpperCase().includes('TRANSFER'),
    ).length;

    const totalUnits = requests.reduce((sum, r) => {
      return (
        sum +
        (r.lines || []).reduce((lineSum, l) => lineSum + Number(l.quantity || 0), 0)
      );
    }, 0);

    return { all, pending, approved, rejected, drafts, stockIn, stockOut, transfers, totalUnits };
  }, [requests]);

  // Client-side filtering
  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      // Status Filter
      if (statusFilter !== 'ALL' && request.status !== statusFilter) {
        return false;
      }

      // Request Type Filter
      if (typeFilter !== 'ALL') {
        const t = (request.requestType || request.type || '').toUpperCase();
        if (typeFilter === 'STOCK_IN' && !t.includes('STOCK_IN')) return false;
        if (typeFilter === 'STOCK_OUT' && !t.includes('STOCK_OUT') && !t.includes('DISPATCH')) return false;
        if (typeFilter === 'TRANSFER' && !t.includes('TRANSFER')) return false;
        if (typeFilter === 'ADJUSTMENT' && !t.includes('ADJUSTMENT')) return false;
      }

      // Client Filter
      if (selectedClientId) {
        const matchesClient =
          request.clientId === selectedClientId ||
          request.client?.id === selectedClientId ||
          request.sourceLocation?.client?.id === selectedClientId ||
          request.destinationLocation?.client?.id === selectedClientId;
        if (!matchesClient) return false;
      }

      // Warehouse Filter
      if (selectedWarehouseId) {
        const matchesWarehouse =
          request.sourceLocation?.warehouse?.id === selectedWarehouseId ||
          request.destinationLocation?.warehouse?.id === selectedWarehouseId;
        if (!matchesWarehouse) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const ref = (request.requestNumber || request.id).toLowerCase();
        const type = (request.requestType || request.type || '').toLowerCase();
        const clientName = (request.client?.name || request.destinationLocation?.client?.name || '').toLowerCase();
        const originName = (request.sourceLocation?.warehouse?.name || '').toLowerCase();
        const destName = (request.destinationLocation?.warehouse?.name || request.destinationName || '').toLowerCase();
        const requester = (request.requesterUsername || '').toLowerCase();
        const itemMatch = request.lines?.some((l) =>
          (l.productName || l.product?.name || '').toLowerCase().includes(query),
        );

        if (
          !ref.includes(query) &&
          !type.includes(query) &&
          !clientName.includes(query) &&
          !originName.includes(query) &&
          !destName.includes(query) &&
          !requester.includes(query) &&
          !itemMatch
        ) {
          return false;
        }
      }

      return true;
    });
  }, [requests, statusFilter, typeFilter, selectedClientId, selectedWarehouseId, searchQuery]);

  const dayGroups = useMemo(() => {
    return groupItemsByDay(
      filteredRequests,
      (r) => r.createdAt,
      (r) => (r.lines || []).reduce((sum, l) => sum + Number(l.quantity || 0), 0),
    );
  }, [filteredRequests]);

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    typeFilter !== 'ALL' ||
    Boolean(selectedClientId) ||
    Boolean(selectedWarehouseId) ||
    Boolean(searchQuery.trim());

  const resetFilters = () => {
    setStatusFilter('ALL');
    setTypeFilter('ALL');
    setSelectedClientId('');
    setSelectedWarehouseId('');
    setSearchQuery('');
  };

  const columns: ColumnDef<StockRequest>[] = useMemo(
    () => [
      {
        id: 'reference',
        header: 'Reference & Scope',
        width: '24%',
        minWidth: '200px',
        valign: 'top',
        cell: (request) => {
          const refNumber = request.requestNumber || '—';
          const clientName =
            request.client?.name ||
            request.destinationLocation?.client?.name ||
            request.sourceLocation?.client?.name;
          const locationDisplay =
            request.destinationName ||
            request.destinationLocation?.warehouse?.name ||
            request.destinationLocation?.client?.name ||
            request.locationName ||
            'Destination';
          const originDisplay =
            user?.role === 'CLIENT_ADMIN'
              ? 'Central Supply'
              : request.sourceLocation?.warehouse?.name ||
                request.sourceLocation?.client?.name ||
                'Central Warehouse';
          const isUrgent = request.priority === 'URGENT' || request.priority === 'HIGH';

          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-xs font-bold text-slate-900 tracking-tight">
                  #{refNumber}
                </span>
                {isUrgent && (
                  <Badge variant="danger" size="sm" withDot>
                    Urgent
                  </Badge>
                )}
                {clientName && (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                    🏢 {clientName}
                  </span>
                )}
              </div>
              <div
                className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate max-w-[220px]"
                title={`${originDisplay} → ${locationDisplay}`}
              >
                <span className="truncate font-medium text-slate-600">{originDisplay}</span>
                <span className="text-slate-400">→</span>
                <span className="font-semibold text-slate-800 truncate">{locationDisplay}</span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'operation',
        header: 'Request Type',
        width: '14%',
        minWidth: '130px',
        valign: 'top',
        cell: (request) => {
          const meta = requestMeta(request, user?.role === 'CLIENT_ADMIN');
          return (
            <div className="space-y-0.5">
              <Badge variant={meta.variant} size="sm">
                {meta.label}
              </Badge>
              <div className="text-[10px] text-slate-400 font-medium">
                {meta.sublabel}
              </div>
            </div>
          );
        },
      },
      {
        id: 'items',
        header: 'Requested Items',
        width: '26%',
        minWidth: '220px',
        valign: 'top',
        cell: (request) => {
          const totalQty = (request.lines || []).reduce(
            (sum, l) => sum + Number(l.quantity || 0),
            0,
          );
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
                  {totalQty.toLocaleString()} units
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  ({request.lines?.length || 0} item{(request.lines?.length || 0) !== 1 ? 's' : ''})
                </span>
              </div>
              <div className="space-y-0.5">
                {request.lines && request.lines.length > 0 ? (
                  request.lines.slice(0, 2).map((line, idx) => (
                    <div
                      key={idx}
                      className="text-xs text-slate-700 flex items-baseline gap-1.5 truncate max-w-sm"
                    >
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
        width: '12%',
        minWidth: '110px',
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
            ? new Date(request.createdAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : '—';
          return (
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-slate-900 font-mono">{dateStr}</div>
              <div
                className="text-[10px] text-slate-400 truncate max-w-[100px]"
                title={request.requesterUsername || 'staff'}
              >
                by {request.requesterUsername || 'staff'}
              </div>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        width: '12%',
        minWidth: '130px',
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
        title={isSuperAdmin ? 'Stock Requests & Movement Register' : 'My Stock Requests'}
        description={
          isSuperAdmin
            ? 'Monitor, audit, and filter warehouse dispatches, inbound receipts, and stock transfer vouchers across all clients and warehouses.'
            : 'Monitor, approve, and track warehouse dispatches, inbound receipts, and stock transfer vouchers.'
        }
        actions={
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Link href="/approvals">
                <Button variant="secondary" className="shadow-xs gap-1.5 font-medium text-xs">
                  <span>Approvals Queue</span>
                  {counts.pending > 0 && (
                    <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                      {counts.pending}
                    </span>
                  )}
                </Button>
              </Link>
            )}
            <Link href="/requests/new">
              <Button variant="primary" className="shadow-xs gap-1.5 font-medium text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>New Stock Movement</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Operational Executive Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Requests
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {counts.all}
            </span>
            <span className="text-xs text-slate-500">all movements</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200/90 shadow-2xs hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
              Pending Approval
            </span>
            {counts.pending > 0 && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-900 font-mono">
              {counts.pending}
            </span>
            <span className="text-xs text-amber-700 font-medium">requires action</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Approved &amp; Completed
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {counts.approved}
            </span>
            <span className="text-xs text-emerald-600 font-medium">finalized</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Units Tracked
            </span>
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

      {/* Primary Status Navigation Tabs */}
      <Card>
        <CardContent className="p-3.5 space-y-3">
          {/* Top Status Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter requests by status">
              {(
                [
                  ['ALL', 'All Requests', counts.all],
                  ['PENDING_APPROVAL', 'Waiting Approval', counts.pending],
                  ['APPROVED', 'Approved & Completed', counts.approved],
                  ['DRAFT', 'Drafts', counts.drafts],
                  ['REJECTED', 'Rejected', counts.rejected],
                ] as const
              ).map(([value, label, count]) => {
                const isSelected = statusFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setStatusFilter(value)}
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

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1"
              >
                <span>Reset Filters</span>
                <span>✕</span>
              </button>
            )}
          </div>

          {/* Granular Filters: Request Type, Client, Warehouse, and Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Request Type Pills */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs flex-wrap">
              {(
                [
                  ['ALL', 'All Types'],
                  ['STOCK_IN', 'Stock In'],
                  ['STOCK_OUT', 'Stock Out'],
                  ['TRANSFER', 'Transfer'],
                  ['ADJUSTMENT', 'Adjustment'],
                ] as const
              ).map(([value, label]) => {
                const isSelected = typeFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTypeFilter(value)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      isSelected
                        ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Dropdown Filters and Search Bar */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Client Filter (for Super Admin & Store Admin) */}
              {(isSuperAdmin || isStoreAdmin) && clients.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500">Client:</span>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  >
                    <option value="">All Clients</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Warehouse Filter */}
              {warehouses.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500">Warehouse:</span>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  >
                    <option value="">All Warehouses</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Text Search */}
              <div className="w-full sm:w-60 relative">
                <input
                  type="text"
                  placeholder="Search ref, item, client..."
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
          </div>
        </CardContent>
      </Card>

      {/* Main Request Data Table */}
      {error ? (
        <ErrorState
          title="Requests could not be loaded"
          message={error instanceof Error ? error.message : 'Could not load your requests.'}
          onRetry={() => void fetchRequests()}
        />
      ) : filteredRequests.length === 0 ? (
        <DataTable
          data={[]}
          columns={columns}
          keyExtractor={(request) => request.id}
          isLoading={isLoading}
          loadingMessage="Loading stock requests…"
          minWidth="min-w-[960px]"
          emptyState={{
            title:
              requests.length === 0
                ? 'No requests recorded yet'
                : 'No requests match your current filters',
            description:
              requests.length === 0
                ? 'Initiate a new stock movement request to begin tracking inventory.'
                : 'Try clearing your filters or selecting a different status/type tab above.',
            action:
              hasActiveFilters ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Clear All Filters
                </Button>
              ) : (
                <Link href="/requests/new">
                  <Button variant="primary" size="sm">
                    {user?.role === 'CLIENT_ADMIN' ? 'Create Restock Request' : 'Create First Request'}
                  </Button>
                </Link>
              ),
          }}
        />
      ) : (
        <div className="space-y-6">
          {dayGroups.map((group) => (
            <div key={group.dateKey} className="space-y-2.5">
              {/* Day Group Header Banner */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-xs" />
                  <span className="text-xs font-bold text-slate-900 tracking-tight">{group.dayLabel}</span>
                  {group.isToday && (
                    <Badge variant="primary" size="sm">Today</Badge>
                  )}
                  {group.isYesterday && (
                    <Badge variant="neutral" size="sm">Yesterday</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                  <span>
                    <strong className="text-slate-800 font-semibold">{group.items.length}</strong> {group.items.length === 1 ? 'request' : 'requests'}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    <strong className="text-slate-800 font-mono font-semibold">{group.totalUnits.toLocaleString()}</strong> units total
                  </span>
                </div>
              </div>

              {/* Day Table */}
              <DataTable
                data={group.items}
                columns={columns}
                keyExtractor={(request) => request.id}
                minWidth="min-w-[960px]"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RequestsList;
