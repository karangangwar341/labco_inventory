'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ShipmentLine } from '../shipments.types';
import { shipmentsService } from '../shipments.service';
import { useAuth } from '../../auth/auth.store';
import { canViewWarehouseIdentity } from '../../../lib/auth/permissions';
import { Badge } from '../../../components/ui/Badge';
import { StatusLabel } from '../../../components/data-display/StatusLabel';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/layout/PageHeader';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import { queryKeys } from '../../../lib/query/query-keys';

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

export function ShipmentDetailView({ shipmentId }: { shipmentId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [resolutionNote, setResolutionNote] = React.useState('');
  const resolutionMutation = useMutation({
    mutationFn: (resolution: 'MISSING' | 'CALCULATION_MISTAKE') =>
      shipmentsService.resolveDiscrepancy(shipmentId, { resolution, note: resolutionNote.trim() || undefined }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.shipments.detail(shipmentId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.shipments.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reports.all }),
      ]);
    },
  });
  const { data: shipment, isLoading: loading, error } = useQuery({
    queryKey: queryKeys.shipments.detail(shipmentId),
    queryFn: () => shipmentsService.getShipmentById(shipmentId),
    enabled: Boolean(shipmentId),
    staleTime: 2 * 60 * 1000,
  });

  if (loading) return <LoadingState message="Loading shipment details..." />;

  if (!shipment) {
    return (
      <div className="space-y-4">
        <PageHeader title="Shipment Details" />
        <EmptyState
          title="Shipment Not Found"
          description={error instanceof Error ? error.message : 'This shipment could not be found. It may have been archived or removed.'}
          action={
            <Link href="/shipments">
              <Button variant="secondary">Back to Shipments</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const canSeeSource = canViewWarehouseIdentity(user?.role);
  const isHold = shipment.status === 'DISCREPANCY_HOLD' && !shipment.discrepancyResolution;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Shipment${shipment.shipmentNumber ? ` ${shipment.shipmentNumber}` : ''}`}
        description="Origin dispatch tracking and receiving audit verification."
        actions={
          <Link href="/shipments">
            <Button variant="secondary" size="sm">← Back to Shipments</Button>
          </Link>
        }
      />

      {/* Meta Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 border border-[#dbe3ee] rounded-xl shadow-xs text-xs">
        <div>
          <span className="text-[#5b6678] block">Status</span>
          <StatusLabel status={shipment.status} />
        </div>
        <div>
          <span className="text-[#5b6678] block">Source Facility</span>
          {canSeeSource ? (
            <span className="font-semibold text-[#172033]">{shipment.sourceWarehouseName || shipment.sourceLocation?.warehouse?.name || 'Central Warehouse'}</span>
          ) : (
            <span className="font-mono text-xs text-[#5b6678] bg-[#f1f5f9] px-2 py-0.5 rounded border border-[#dbe3ee] inline-block">
              [REDACTED]
            </span>
          )}
        </div>
        <div>
          <span className="text-[#5b6678] block">Destination</span>
          <span className="font-semibold text-[#172033]">{shipment.destinationName || shipment.destinationLocation?.project?.name || shipment.destinationLocation?.warehouse?.name || 'Destination Facility'}</span>
        </div>
        <div>
          <span className="text-[#5b6678] block">Dispatched Date</span>
          <span className="font-mono text-[#5b6678]">
            {shipment.dispatchedAt ? new Date(shipment.dispatchedAt).toLocaleDateString() : '—'}
          </span>
        </div>
      </div>

      {/* Discrepancy Alert */}
      {isHold && (
        <div className="p-4 bg-[#fef3f2] border border-[#fee4e2] rounded-xl text-xs text-[#b42318] space-y-1">
          <div className="flex items-center gap-2 font-bold">
            <span>⚠️</span>
            <span>Discrepancy Hold Enforced</span>
          </div>
          <p>
            The confirmed received quantities are credited to the destination. The remaining quantities are awaiting one of two Super Admin decisions.
          </p>
          {isSuperAdmin && (
            <div className="pt-3 mt-3 border-t border-[#fecdca] space-y-3 text-[#344054]">
              <p className="font-semibold">Choose how to resolve every discrepancy on this shipment:</p>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Audit note (optional)</span>
                <textarea
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  maxLength={500}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900"
                  placeholder="Add context for the audit record"
                />
              </label>
              {resolutionMutation.error && (
                <p role="alert" className="text-rose-700">{resolutionMutation.error instanceof Error ? resolutionMutation.error.message : 'Could not resolve this discrepancy.'}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={resolutionMutation.isPending}
                  onClick={() => resolutionMutation.mutate('MISSING')}
                >
                  {resolutionMutation.isPending && resolutionMutation.variables === 'MISSING' ? 'Saving…' : 'Mark as missing'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={resolutionMutation.isPending}
                  onClick={() => resolutionMutation.mutate('CALCULATION_MISTAKE')}
                >
                  {resolutionMutation.isPending && resolutionMutation.variables === 'CALCULATION_MISTAKE' ? 'Saving…' : 'Calculation mistake — return to warehouse'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {shipment.discrepancyResolution && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 space-y-1">
          <p className="font-semibold">Discrepancy resolved: {shipment.discrepancyResolution === 'MISSING' ? 'Marked as missing' : 'Calculation mistake; quantity returned to source warehouse'}</p>
          {shipment.discrepancyResolvedAt && <p>Resolved {new Date(shipment.discrepancyResolvedAt).toLocaleString()}</p>}
          {shipment.discrepancyResolutionNote && <p>Note: {shipment.discrepancyResolutionNote}</p>}
        </div>
      )}

      {/* Line Items Table */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#172033]">Manifest Line Items</h3>
        <Table>
          <TableHeader sticky>
            <tr>
              <TableHead>Product Name</TableHead>
              <TableHead>Dispatched Qty</TableHead>
              <TableHead>Received Qty</TableHead>
              <TableHead>Discrepancy</TableHead>
              <TableHead>Line Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {shipment.lines.map((line: ShipmentLine) => {
              const dispatched = formatQty(line.dispatchedQty);
              const received = line.receivedQty !== undefined ? formatQty(line.receivedQty) : undefined;
              const hasDiff = received !== undefined && received < dispatched;
              return (
                <TableRow key={line.id}>
                  <TableCell className="font-medium text-[#172033]">
                    {line.productName || line.product?.name || 'Product'}
                  </TableCell>
                  <TableCell className="font-bold text-[#172033]">{dispatched} {line.unitName || ''}</TableCell>
                  <TableCell className="font-mono text-[#5b6678]">
                    {received !== undefined ? `${received} ${line.unitName || ''}` : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-[#b42318]">
                    {hasDiff ? `-${dispatched - (received ?? 0)} ${line.unitName || ''}` : `0 ${line.unitName || ''}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={hasDiff ? 'danger' : 'success'}>
                      {hasDiff ? (shipment.discrepancyResolution === 'MISSING' ? 'MARKED MISSING' : shipment.discrepancyResolution === 'CALCULATION_MISTAKE' ? 'RETURNED TO WAREHOUSE' : 'DISCREPANCY HOLD') : 'VERIFIED IN FULL'}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default ShipmentDetailView;
