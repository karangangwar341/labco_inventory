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
import { shipmentsService } from '@/features/shipments/shipments.service';
import { requestsService } from '@/features/requests/requests.service';
import { StatusLabel } from '@/components/data-display/StatusLabel';

export function StoreAdminDashboard() {
  const { user } = useAuth();

  // Outbound shipments dispatched from this warehouse
  const {
    data: rawShipments = [],
    isLoading: isShipLoading,
    error: shipError,
    refetch: refetchShip,
  } = useQuery({
    queryKey: queryKeys.shipments.list(user?.id, { limit: 20 }),
    queryFn: () => shipmentsService.getShipments({ limit: 20 }),
    staleTime: 2 * 60 * 1000,
  });

  // Recent stock requests created by this warehouse store admin
  const {
    data: rawRequests = [],
    isLoading: isReqLoading,
    error: reqError,
    refetch: refetchReq,
  } = useQuery({
    queryKey: queryKeys.requests.list(user?.id, { limit: 10 }),
    queryFn: () => requestsService.getRequests({ limit: 10 }),
    staleTime: 2 * 60 * 1000,
  });

  const shipments = Array.isArray(rawShipments) ? rawShipments : [];
  const requests = Array.isArray(rawRequests) ? rawRequests : [];

  const activeDispatches = shipments.filter(
    (s) => s.status === 'IN_TRANSIT' || s.status === 'PENDING'
  );

  const pendingRequests = requests.filter(
    (r) => r.status === 'PENDING_APPROVAL' || r.status === 'DRAFT'
  );

  const recentShipments = shipments.slice(0, 5);
  const recentRequests = requests.slice(0, 5);

  const isLoading = (isShipLoading || isReqLoading) && shipments.length === 0 && requests.length === 0;
  const error = shipError ? (shipError as Error).message : reqError ? (reqError as Error).message : null;

  const fetchDashboard = () => {
    void refetchShip();
    void refetchReq();
  };

  if (isLoading) return <LoadingState message="Loading warehouse dashboard…" />;
  if (error) return <ErrorState title="Warehouse tasks could not be loaded" message={error} onRetry={fetchDashboard} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse stock"
        description="Record incoming stock or send stock to an assigned client."
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
            <Link href="/requests/new?type=STOCK_OUT">
              <Button variant="primary">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  <span>Stock out</span>
                </span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. Warehouse Stock on Shelves */}
        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Warehouse Stock</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <Link href="/inventory" className="text-sm font-semibold text-blue-600 hover:underline">
              Check All Items on Shelves →
            </Link>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">View good, reserved, and damaged units</p>
        </div>

        {/* 2. Outbound Dispatches to Clients */}
        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Dispatches to Clients</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{activeDispatches.length}</span>
            <span className="text-xs text-slate-500">in transit to clients</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            <Link href="/shipments" className="text-blue-600 hover:underline font-medium">
              Track Dispatched Orders →
            </Link>
          </p>
        </div>

        {/* 3. My Stock Requests Awaiting Approval */}
        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Requests Awaiting Approval</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{pendingRequests.length}</span>
            <span className="text-xs text-slate-500">waiting for Super Admin</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            <Link href="/requests" className="text-amber-700 hover:underline font-medium">
              View All Requests →
            </Link>
          </p>
        </div>
      </div>

      {/* Section 1: Recent Dispatches to Clients */}
      <section aria-labelledby="dispatches-heading" className="saas-card overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <h2 id="dispatches-heading" className="text-sm font-semibold text-slate-900">
              Recent Dispatches to Clients
            </h2>
            {activeDispatches.length > 0 && (
              <Badge variant="primary" size="sm" withDot>
                {activeDispatches.length} active
              </Badge>
            )}
          </div>
          <Link href="/shipments" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
            View all dispatches →
          </Link>
        </div>

        <div className="bg-white">
          {recentShipments.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-slate-800">No client dispatches yet</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                When you dispatch approved goods to a client clinic or hospital, tracking will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentShipments.map((shipment) => {
                const destination = shipment.destinationName || shipment.destinationLocation?.client?.name || 'Client Facility';
                const itemsCount = shipment.lines?.length ?? 0;
                const isTransit = shipment.status === 'IN_TRANSIT';

                return (
                  <li
                    key={shipment.id}
                    className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {shipment.shipmentNumber || 'Shipment'}
                        </span>
                        <StatusLabel status={shipment.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Destination: <strong className="font-medium text-slate-800">{destination}</strong> · {itemsCount} line item{itemsCount === 1 ? '' : 's'}
                      </p>
                      {shipment.dispatchedAt && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Dispatched: {new Date(shipment.dispatchedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Link href={`/shipments/${shipment.id}`} className="shrink-0">
                      <Button variant="secondary" size="sm">
                        Track Dispatch
                      </Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Section 2: My Recent Stock Requests */}
      <section aria-labelledby="requests-heading" className="saas-card overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <h2 id="requests-heading" className="text-sm font-semibold text-slate-900">
              My Recent Stock Requests
            </h2>
            {pendingRequests.length > 0 && (
              <Badge variant="warning" size="sm" withDot>
                {pendingRequests.length} awaiting approval
              </Badge>
            )}
          </div>
          <Link href="/requests" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
            View all requests →
          </Link>
        </div>

        <div className="bg-white">
          {recentRequests.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-slate-800">No stock requests submitted yet</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Use the buttons at the top to record incoming supplier stock or prepare a client dispatch.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentRequests.map((request) => {
                const reqType = request.requestType || request.type || 'STOCK_IN';
                const typeLabel =
                  reqType === 'STOCK_IN'
                    ? '📥 Stock Arrival (Supplier)'
                    : reqType === 'STOCK_OUT' || reqType === 'DISPATCH'
                    ? '📤 Client Dispatch'
                    : reqType;

                const itemsCount = request.lines?.length ?? 0;

                return (
                  <li
                    key={request.id}
                    className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {request.requestNumber || 'Stock request'}
                        </span>
                        <Badge
                          variant={
                            reqType === 'STOCK_IN'
                              ? 'neutral'
                              : 'primary'
                          }
                          size="sm"
                        >
                          {typeLabel}
                        </Badge>
                        <StatusLabel status={request.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {itemsCount} item{itemsCount === 1 ? '' : 's'}
                        {request.reason ? ` · ${request.reason}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Created: {new Date(request.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Link href={`/requests/${request.id}`} className="shrink-0">
                      <Button variant="secondary" size="sm">
                        View Request
                      </Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default StoreAdminDashboard;
