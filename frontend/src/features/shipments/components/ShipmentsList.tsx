'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shipment, ShipmentLine, ReceiveShipmentDto } from '../shipments.types';
import { shipmentsService } from '../shipments.service';
import { useAuth } from '../../auth/auth.store';
import { canViewWarehouseIdentity, canReceiveShipments } from '../../../lib/auth/permissions';
import { queryKeys } from '../../../lib/query/query-keys';
import { invalidation } from '../../../lib/query/invalidation';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader } from '../../../components/layout/PageHeader';
import { DataTable, ColumnDef } from '../../../components/ui/DataTable';
import { StatusLabel } from '../../../components/data-display/StatusLabel';
import { ErrorState } from '../../../components/feedback/ErrorState';

function formatQty(qty: unknown): number {
  if (qty === null || qty === undefined) return 0;
  if (typeof qty === 'number') return qty;
  if (typeof qty === 'string') {
    const num = parseFloat(qty);
    return isNaN(num) ? 0 : num;
  }
  if (typeof qty === 'object') {
    const obj = qty as any;
    if (typeof obj.toNumber === 'function') return obj.toNumber();
    if (Array.isArray(obj.d) && typeof obj.s === 'number' && typeof obj.e === 'number') {
      const digits = obj.d.join('');
      const val = Number(digits) * obj.s * Math.pow(10, obj.e - (obj.d.length - 1));
      return isNaN(val) ? 0 : val;
    }
  }
  return 0;
}

export function ShipmentsList() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [receiptInputs, setReceiptInputs] = useState<Record<string, number>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Filter and pagination states
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const status = searchParams.get('status');
    return status && ['ACTIVE', 'IN_TRANSIT', 'AWAITING_RECEIPT_APPROVAL', 'COMPLETED', 'DISCREPANCY_HOLD'].includes(status)
      ? status
      : 'ALL';
  });
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [selectedOrigin, setSelectedOrigin] = useState('ALL');
  const [selectedDestination, setSelectedDestination] = useState('ALL');
  const [pageSize, setPageSize] = useState(10);

  const {
    data: shipments = [],
    isLoading,
    error,
    refetch: refetchShipments,
  } = useQuery({
    queryKey: queryKeys.shipments.list(),
    queryFn: () => shipmentsService.getShipments({ limit: 500 }),
    staleTime: 2 * 60 * 1000,
  });

  const confirmReceiptMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReceiveShipmentDto }) =>
      shipmentsService.confirmReceipt(id, payload),
    onSuccess: (_, variables) => {
      invalidation.afterShipmentMutation(queryClient);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Receipt confirmation failed';
      setFormError(msg);
    },
  });

  const openReceiveModal = (s: Shipment) => {
    setSelectedShipment(s);
    setFormError(null);
    const initial: Record<string, number> = {};
    s.lines.forEach((l: ShipmentLine) => {
      initial[l.id] = formatQty(l.dispatchedQty);
    });
    setReceiptInputs(initial);
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipment) return;

    for (const line of selectedShipment.lines) {
      const dispatched = formatQty(line.dispatchedQty);
      const qty = receiptInputs[line.id] ?? 0;
      if (qty < 0) {
        setFormError(`Received quantity cannot be negative for ${line.productName || line.product?.name || 'Product'}.`);
        return;
      }
      if (qty > dispatched) {
        setFormError(
          `Violation: Received quantity (${qty}) cannot exceed dispatched quantity (${dispatched}) for ${line.productName || line.product?.name || 'Product'}. Discrepancy excess rejected.`,
        );
        return;
      }
    }

    let hasDiscrepancy = false;
    selectedShipment.lines.forEach((l: ShipmentLine) => {
      const dispatched = formatQty(l.dispatchedQty);
      const qty = receiptInputs[l.id] ?? 0;
      if (qty < dispatched) hasDiscrepancy = true;
    });

    try {
      await confirmReceiptMutation.mutateAsync({
        id: selectedShipment.id,
        payload: {
          lines: selectedShipment.lines.map((l: ShipmentLine) => ({
            shipmentLineId: l.id,
            receivedQty: receiptInputs[l.id] ?? formatQty(l.dispatchedQty),
          })),
        },
      });
    } catch {
      return;
    }

    setSubmitSuccess(
      hasDiscrepancy
        ? 'Receipt submitted for Super Admin approval. Received stock will be posted after approval; the short quantity will be held for investigation.'
        : 'Receipt submitted for Super Admin approval. Client stock will update after approval.',
    );

    setSelectedShipment(null);
    setTimeout(() => setSubmitSuccess(null), 5000);
  };

  const canSeeSource = canViewWarehouseIdentity(user?.role);
  const isStoreAdmin = user?.role === 'STORE_ADMIN';
  const isClientAdmin = user?.role === 'CLIENT_ADMIN';

  const pageTitle = isStoreAdmin
    ? 'Client Dispatches'
    : isClientAdmin
    ? 'Incoming Deliveries'
    : 'Shipments & Deliveries';

  const pageDescription = isStoreAdmin
    ? 'Track outbound orders dispatched from this warehouse to client clinics and facilities.'
    : isClientAdmin
    ? 'Inspect and verify incoming shipments arriving at your facility dock.'
    : 'Origin to destination transit tracking and receiving audit verification.';

  const emptyTitle = isStoreAdmin
    ? 'No client dispatches found'
    : isClientAdmin
    ? 'No incoming deliveries found'
    : 'No shipments found';

  const emptyDescription = isStoreAdmin
    ? 'When you dispatch approved stock requests to clients, they will appear here.'
    : isClientAdmin
    ? 'There are currently no inbound shipments on the way to your facility dock.'
    : 'There are currently no inbound or outbound shipments recorded.';

  const counts = useMemo(() => {
    let inTransit = 0;
    let awaitingApproval = 0;
    let completed = 0;
    let discrepancyHold = 0;
    let totalItems = 0;

    for (const s of shipments) {
      if (s.status === 'IN_TRANSIT') inTransit++;
      else if (s.status === 'AWAITING_RECEIPT_APPROVAL') awaitingApproval++;
      else if (s.status === 'COMPLETED') completed++;
      else if (s.status === 'DISCREPANCY_HOLD') discrepancyHold++;

      for (const l of s.lines || []) {
        totalItems += formatQty(l.dispatchedQty);
      }
    }

    return {
      all: shipments.length,
      inTransit,
      awaitingApproval,
      completed,
      discrepancyHold,
      totalItems,
    };
  }, [shipments]);

  const { uniqueOrigins, uniqueDestinations } = useMemo(() => {
    const origins = new Set<string>();
    const destinations = new Set<string>();

    for (const s of shipments) {
      if (canSeeSource) {
        const org = s.sourceWarehouseName || 'Central Warehouse';
        if (org) origins.add(org);
      }
      const dest =
        s.destinationName ||
        s.destinationLocation?.client?.name ||
        s.destinationLocation?.warehouse?.name;
      if (dest) destinations.add(dest);
    }

    return {
      uniqueOrigins: Array.from(origins).sort(),
      uniqueDestinations: Array.from(destinations).sort(),
    };
  }, [shipments, canSeeSource]);

  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      // 1. Status Filter
      if (statusFilter === 'ACTIVE' && s.status !== 'IN_TRANSIT' && s.status !== 'PENDING') {
        return false;
      }
      if (statusFilter !== 'ALL' && statusFilter !== 'ACTIVE' && s.status !== statusFilter) {
        return false;
      }

      // 2. Origin Filter
      if (canSeeSource && selectedOrigin !== 'ALL') {
        const origin = s.sourceWarehouseName || 'Central Warehouse';
        if (origin !== selectedOrigin) return false;
      }

      // 3. Destination Filter
      if (selectedDestination !== 'ALL') {
        const dest =
          s.destinationName ||
          s.destinationLocation?.client?.name ||
          s.destinationLocation?.warehouse?.name ||
          '';
        if (dest !== selectedDestination) return false;
      }

      // 4. Text Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const tracking = (s.shipmentNumber || 'shp-' + s.id).toLowerCase();
        const origin = (s.sourceWarehouseName || s.sourceDescription || '').toLowerCase();
        const dest = (
          s.destinationName ||
          s.destinationLocation?.client?.name ||
          s.destinationLocation?.warehouse?.name ||
          ''
        ).toLowerCase();
        const matchesLines = s.lines?.some((l) => {
          const pName = (l.productName || l.product?.name || '').toLowerCase();
          const batch = (l.batchNumber || '').toLowerCase();
          return pName.includes(q) || batch.includes(q);
        });

        if (!tracking.includes(q) && !origin.includes(q) && !dest.includes(q) && !matchesLines) {
          return false;
        }
      }

      return true;
    });
  }, [shipments, statusFilter, selectedOrigin, selectedDestination, searchTerm, canSeeSource]);

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    selectedOrigin !== 'ALL' ||
    selectedDestination !== 'ALL' ||
    searchTerm.trim().length > 0;

  const clearFilters = () => {
    setStatusFilter('ALL');
    setSelectedOrigin('ALL');
    setSelectedDestination('ALL');
    setSearchTerm('');
  };

  const columns = useMemo<ColumnDef<Shipment>[]>(() => [
    {
      id: 'tracking',
      header: 'Tracking #',
      width: '18%',
      minWidth: '150px',
      cell: (s) => (
        <span className="font-mono font-medium text-[#172033]">
          {s.shipmentNumber || 'Shipment'}
        </span>
      ),
    },
    {
      id: 'origin',
      header: 'Origin Facility',
      width: '16%',
      minWidth: '140px',
      cell: (s) => {
        const displayedSource = canSeeSource
          ? s.sourceWarehouseName || 'Central Warehouse'
          : (s.sourceDescription || '[REDACTED]');
        return !canSeeSource ? (
          <span className="inline-flex px-2 py-0.5 rounded bg-[#f1f5f9] text-[#5b6678] text-[11px] font-mono border border-[#dbe3ee]">
            [REDACTED]
          </span>
        ) : (
          <span className="text-[#5b6678] text-xs font-medium">{displayedSource}</span>
        );
      },
    },
    {
      id: 'destination',
      header: 'Destination',
      width: '18%',
      minWidth: '150px',
      cell: (s) => (
        <span className="text-[#334155] text-xs font-medium">
          {s.destinationName || s.destinationLocation?.client?.name || s.destinationLocation?.warehouse?.name || 'Destination Facility'}
        </span>
      ),
    },
    {
      id: 'lines',
      header: 'Line Items & Counts',
      width: '26%',
      minWidth: '220px',
      cell: (s) => (
        <div className="space-y-1">
          {s.lines.map((l: ShipmentLine) => {
            const disp = formatQty(l.dispatchedQty);
            const rec = l.receivedQty !== undefined ? formatQty(l.receivedQty) : undefined;
            return (
              <div key={l.id} className="text-xs leading-snug">
                <span className="font-semibold text-[#172033]">{l.productName || l.product?.name || 'Product'}</span>
                <span className="text-[#64748b] ml-1">: {disp}</span>
                {s.status === 'COMPLETED' && (
                  <span className="text-[#18794e] font-semibold ml-1">(Rec: {rec})</span>
                )}
                {s.status === 'DISCREPANCY_HOLD' && (
                  <span className="text-[#b42318] ml-1 font-semibold">
                    (Rec: {rec} · Missing {disp - (rec ?? 0)})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '12%',
      minWidth: '120px',
      cell: (s) => <StatusLabel status={s.status} />,
    },
    {
      id: 'dispatched',
      header: 'Dispatched',
      width: '10%',
      minWidth: '100px',
      cell: (s) => (
        <span className="text-[#5b6678] font-mono text-[11px]">
          {s.dispatchedAt ? new Date(s.dispatchedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      width: '160px',
      minWidth: '160px',
      align: 'right',
      cell: (s) => {
        const canReceive = s.status === 'IN_TRANSIT' && canReceiveShipments(user?.role);
        return (
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            <Link href={`/shipments/${s.id}`}>
              <Button variant="secondary" size="sm">Inspect</Button>
            </Link>
            {canReceive && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => openReceiveModal(s)}
              >
                Receive
              </Button>
            )}
          </div>
        );
      },
    },
  ], [canSeeSource, user?.role]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={pageTitle}
        description={pageDescription}
      />

      {submitSuccess && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-[#18794e] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span className="font-semibold">{submitSuccess}</span>
          </div>
          <button onClick={() => setSubmitSuccess(null)} className="text-[#18794e]">✕</button>
        </div>
      )}

      {/* Warehouse Identity Privacy Banner for Client Admin */}
      {!canSeeSource && (
        <div className="p-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg text-xs text-[#2563eb] flex items-center gap-2">
          <span>🔒</span>
          <span>
            <strong>Tenant Privacy Active:</strong> Source warehouse operational identifiers are redacted in accordance with multi-client security policy.
          </span>
        </div>
      )}

      {/* 1. KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="bg-gradient-to-br from-blue-50/70 to-white border-blue-200/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-blue-900 text-xs font-semibold">
              <span>All Shipments</span>
              <span className="text-blue-600 font-mono text-[11px]">📦 Total</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight font-mono">
              {counts.all}{' '}
              <span className="text-xs font-normal text-slate-500 font-sans">recorded</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {counts.totalItems.toLocaleString()} units tracked in transit / delivered
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50/70 to-white border-amber-200/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-amber-900 text-xs font-semibold">
              <span>In Transit</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-900 tracking-tight font-mono">
              {counts.inTransit}{' '}
              <span className="text-xs font-normal text-amber-700 font-sans">active</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">En route to receiving facility docks</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50/70 to-white border-amber-200/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-amber-900 text-xs font-semibold">
              <span>Awaiting Receipt</span>
              <span className="text-amber-700 font-mono text-[11px]">Action</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-900 tracking-tight font-mono">
              {counts.awaitingApproval}{' '}
              <span className="text-xs font-normal text-amber-800 font-sans">pending</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Dock verification awaiting Super Admin</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50/70 to-white border-emerald-200/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-emerald-900 text-xs font-semibold">
              <span>Completed Deliveries</span>
              <span className="text-emerald-600 font-mono text-[11px]">✓ Settled</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-900 tracking-tight font-mono">
              {counts.completed}{' '}
              <span className="text-xs font-normal text-emerald-700 font-sans">received</span>
              {counts.discrepancyHold > 0 && (
                <span className="text-xs font-bold text-rose-600 font-sans ml-1">
                  · {counts.discrepancyHold} held
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Fully posted to destination stock ledger</p>
          </CardContent>
        </Card>
      </div>

      {/* 2. Filter and Search Controls */}
      <Card>
        <CardContent className="p-3.5 space-y-3">
          {/* Top row: Status Quick Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-medium">
              {(
                [
                  ['ALL', 'All Shipments', counts.all],
                  ['ACTIVE', 'Active Deliveries', shipments.filter((shipment) => shipment.status === 'IN_TRANSIT' || shipment.status === 'PENDING').length],
                  ['IN_TRANSIT', 'In Transit', counts.inTransit],
                  ['AWAITING_RECEIPT_APPROVAL', 'Awaiting Approval', counts.awaitingApproval],
                  ['COMPLETED', 'Completed', counts.completed],
                  ['DISCREPANCY_HOLD', 'Discrepancy Hold', counts.discrepancyHold],
                ] as const
              ).map(([val, label, count]) => {
                const isSelected = statusFilter === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStatusFilter(val)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium ${
                      isSelected
                        ? 'bg-white text-blue-700 font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
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
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Clear All Filters ✕
              </Button>
            )}
          </div>

          {/* Bottom row: Text Search and Select Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search tracking #, product, batch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Status Select */}
            <div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Delivery Statuses</option>
                <option value="ACTIVE">Active Deliveries</option>
                <option value="IN_TRANSIT">In Transit Only</option>
                <option value="AWAITING_RECEIPT_APPROVAL">Awaiting Receipt Approval</option>
                <option value="COMPLETED">Completed Only</option>
                <option value="DISCREPANCY_HOLD">Discrepancy Hold Only</option>
              </Select>
            </div>

            {/* Origin Warehouse (if authorized to see sources) */}
            {canSeeSource && (
              <div>
                <Select
                  value={selectedOrigin}
                  onChange={(e) => setSelectedOrigin(e.target.value)}
                >
                  <option value="ALL">All Origin Facilities ({uniqueOrigins.length})</option>
                  {uniqueOrigins.map((org) => (
                    <option key={org} value={org}>
                      {org}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Destination Facility */}
            <div className={!canSeeSource ? 'lg:col-span-2' : ''}>
              <Select
                value={selectedDestination}
                onChange={(e) => setSelectedDestination(e.target.value)}
              >
                <option value="ALL">All Destinations ({uniqueDestinations.length})</option>
                {uniqueDestinations.map((dest) => (
                  <option key={dest} value={dest}>
                    {dest}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Shipments Data Table with Built-In Pagination */}
      {error ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load shipments'}
          onRetry={() => refetchShipments()}
        />
      ) : (
        <DataTable
          data={filteredShipments}
          columns={columns}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          loadingMessage="Loading shipments..."
          emptyTitle={hasActiveFilters ? 'No shipments match your filters' : emptyTitle}
          emptyDescription={
            hasActiveFilters
              ? 'Try adjusting your search query, status, or facility filters.'
              : emptyDescription
          }
          emptyState={
            hasActiveFilters
              ? {
                  title: 'No shipments match your filters',
                  description: 'Try adjusting your search query, status, or facility filters.',
                  action: (
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      Clear All Filters
                    </Button>
                  ),
                }
              : undefined
          }
          minWidth="min-w-[1050px]"
          pagination={{
            pageSize,
            pageSizeOptions: [10, 20, 50, 100],
            showSummary: true,
          }}
        />
      )}

      {/* Strict Receipt Verification Modal */}
      <Modal
        isOpen={!!selectedShipment}
        onClose={() => setSelectedShipment(null)}
        title={`Receive & Verify Shipment${selectedShipment?.shipmentNumber ? ` ${selectedShipment.shipmentNumber}` : ''}`}
      >
        {selectedShipment && (
          <form onSubmit={handleReceiveSubmit} className="space-y-4 text-xs">
            <p className="text-[#5b6678]">
              Verify the quantities received. Your confirmation goes to a Super Admin for approval; client stock is updated only after approval. A short count may be held for investigation. Quantities above the dispatched amount are rejected.
            </p>

            {formError && (
              <div className="p-2.5 bg-[#fef3f2] border border-[#fee4e2] rounded-md text-[#b42318] font-medium">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              {selectedShipment.lines.map((line: ShipmentLine) => {
                const dispatched = formatQty(line.dispatchedQty);
                return (
                  <div key={line.id} className="p-3 bg-[#f8fafc] border border-[#dbe3ee] rounded-lg space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-[#172033]">{line.productName || line.product?.name || 'Product'}</span>
                      <span className="text-[#5b6678]">Dispatched: <strong className="text-[#172033]">{dispatched}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-[#5b6678]">Confirmed Received Qty:</label>
                      <input
                        type="number"
                        min="0"
                        max={dispatched}
                        value={receiptInputs[line.id] ?? dispatched}
                        onChange={(e) =>
                          setReceiptInputs({
                            ...receiptInputs,
                            [line.id]: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-24 px-2 py-1 bg-white border border-[#dbe3ee] rounded text-xs text-[#172033] focus:outline-none focus:border-[#2563eb]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setSelectedShipment(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Confirm Receipt &amp; Post to Ledger
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default ShipmentsList;
