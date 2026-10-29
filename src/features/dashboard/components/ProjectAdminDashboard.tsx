'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { useAuth } from '@/features/auth/auth.store';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { requestsService } from '@/features/requests/requests.service';
import { shipmentsService } from '@/features/shipments/shipments.service';
import { inventoryService } from '@/features/inventory/inventory.service';

export function ProjectAdminDashboard() {
  const { user } = useAuth();

  const {
    data: rawRequests = [],
    isLoading: isReqLoading,
    error: reqError,
    refetch: refetchReq,
  } = useQuery({
    queryKey: queryKeys.requests.list(user?.projectId || user?.id, { limit: 5 }),
    queryFn: () => requestsService.getRequests({ limit: 5 }),
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: rawShipments = [],
    isLoading: isShipLoading,
    error: shipError,
    refetch: refetchShip,
  } = useQuery({
    queryKey: queryKeys.shipments.list(user?.projectId || user?.id, { limit: 5 }),
    queryFn: () => shipmentsService.getShipments({ limit: 5 }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: rawBalances = [] } = useQuery({
    queryKey: queryKeys.inventory.balances(user?.id || user?.role),
    queryFn: () => inventoryService.getBalances(),
    staleTime: 2 * 60 * 1000,
  });

  const requests = Array.isArray(rawRequests) ? rawRequests : [];
  const inboundShipments = (Array.isArray(rawShipments) ? rawShipments : []).filter(
    (shipment) => shipment.status === 'IN_TRANSIT' || shipment.status === 'PENDING',
  );

  const lowStockBalances = (Array.isArray(rawBalances) ? rawBalances : []).filter(
    (b) => Number(b.minThreshold ?? 0) > 0 && Number(b.availableQty ?? 0) <= Number(b.minThreshold ?? 0)
  );

  const pendingRequestsCount = requests.filter((r) => r.status === 'PENDING_APPROVAL').length;

  const isLoading = (isReqLoading || isShipLoading) && (requests.length === 0 && inboundShipments.length === 0);
  const error = reqError ? (reqError as Error).message : shipError ? (shipError as Error).message : null;

  const fetchDashboard = () => {
    void refetchReq();
    void refetchShip();
  };

  if (isLoading) return <LoadingState message="Loading project workspace…" />;
  if (error) return <ErrorState title="Stock activity could not be loaded" message={error} onRetry={fetchDashboard} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project stock"
        description="Record incoming stock, send items to departments, or check deliveries."
        actions={
          <div className="flex flex-wrap gap-2.5">
            <Link href="/requests/new?type=STOCK_IN">
              <Button variant="secondary">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  <span>Stock in</span>
                </span>
              </Button>
            </Link>
            <Link href="/departments?tab=ISSUES">
              <Button variant="primary">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  <span>Daily Department Issue</span>
                </span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Quick Daily Action Bar for Lab Managers */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white border border-blue-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs font-bold text-base">
            🧪
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">
              Daily Department Reagent Dispensing
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Issue diagnostic kits, media, and reagents to internal hospital testing departments (Biochemistry, Pathology, Hematology).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/departments?tab=ISSUES">
            <Button variant="primary" size="sm" className="whitespace-nowrap">
              <span>+ Issue Reagents to Department</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Low-Stock Threshold Alert Notice */}
      {lowStockBalances.length > 0 && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-100 text-rose-700 font-bold text-base shrink-0">
              ⚠️
            </div>
            <div>
              <h4 className="text-sm font-semibold text-rose-900">
                Low Stock Threshold Alert: {lowStockBalances.length} item{lowStockBalances.length > 1 ? 's' : ''} below safety minimum
              </h4>
              <p className="text-xs text-rose-700 mt-0.5">
                Supplies or manufactured finished goods are running low at your project location.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/inventory?filter=LOW_STOCK">
              <Button variant="secondary" size="sm">
                View Low Stock
              </Button>
            </Link>
            <Link href="/requests/new?type=STOCK_IN">
              <Button variant="primary" size="sm">
                Request Restock
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/shipments?status=ACTIVE" className="saas-card-interactive block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Incoming Deliveries</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{inboundShipments.length}</span>
            <span className="text-xs text-slate-500">active shipments</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {inboundShipments.length > 0 ? 'Awaiting receiving confirmation' : 'No in-transit shipments'}
          </p>
        </Link>

        <Link href="/requests?status=PENDING_APPROVAL" className="saas-card-interactive block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Pending Review</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{pendingRequestsCount}</span>
            <span className="text-xs text-slate-500">requests submitted</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Under Super Admin governance</p>
        </Link>

        <Link href="/catalog" className="saas-card-interactive block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Product Catalog</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-blue-600">Inspect Product Catalog →</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Real-time usable stock ledger</p>
        </Link>

        <Link href="/staff" className="saas-card-interactive block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Staff &amp; Workforce</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
              👥
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-blue-600">Staff Portal &amp; Logs →</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Manage team &amp; record daily work</p>
        </Link>
      </div>

      {/* Main Content: Shipments & Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Incoming Deliveries */}
        <section aria-labelledby="incoming-heading" className="saas-card overflow-hidden flex flex-col">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <h2 id="incoming-heading" className="text-sm font-semibold text-slate-900">
                Incoming Deliveries
              </h2>
              {inboundShipments.length > 0 && (
                <Badge variant="warning" size="sm" withDot>
                  {inboundShipments.length}
                </Badge>
              )}
            </div>
            <Link href="/shipments" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
              View all
            </Link>
          </div>

          <div className="flex-1 bg-white">
            {inboundShipments.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-800">No shipments in transit</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Dispatched deliveries will appear here for receiving.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {inboundShipments.map((shipment) => (
                  <li
                    key={shipment.id}
                    className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {shipment.shipmentNumber || 'Shipment'}
                        </span>
                        <Badge variant="warning" size="sm">In Transit</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {shipment.lines?.length ?? 0} items · Waiting for receiving dock
                      </p>
                    </div>
                    <Link href={`/shipments/${shipment.id}`} className="shrink-0">
                      <Button variant="secondary" size="sm">
                        Review Delivery
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Recent Requests */}
        <section aria-labelledby="request-status-heading" className="saas-card overflow-hidden flex flex-col">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white">
            <h2 id="request-status-heading" className="text-sm font-semibold text-slate-900">
              Recent Stock Requests
            </h2>
            <Link href="/requests" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
              View all
            </Link>
          </div>

          <div className="flex-1 bg-white">
            {requests.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-800">No requests submitted yet</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Use the action buttons above to submit a new stock request.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {requests.map((request) => (
                  <li
                    key={request.id}
                    className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {request.requestNumber || 'Stock request'}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase font-mono">
                          {(request.type || 'STOCK_REQUEST').replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 truncate">
                        {request.lines?.map((line) => `${line.quantity} ${line.unit || line.unitNameSnapshot || 'units'} ${line.productName || line.product?.name || 'item'}`).join(', ') || 'No line details'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <Badge
                        variant={request.status === 'APPROVED' ? 'success' : request.status === 'REJECTED' ? 'danger' : 'warning'}
                        size="sm"
                      >
                        {request.status.replaceAll('_', ' ').toLowerCase()}
                      </Badge>
                      <Link href={`/requests/${request.id}`}>
                        <Button variant="ghost" size="sm">
                          Details →
                        </Button>
                      </Link>
                    </div>
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

export default ProjectAdminDashboard;
