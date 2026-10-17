'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const isHold = shipment.status === 'DISCREPANCY_HOLD';

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
          <span className="font-semibold text-[#172033]">{shipment.destinationName || shipment.destinationLocation?.client?.name || shipment.destinationLocation?.warehouse?.name || 'Destination Facility'}</span>
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
            Received quantity differs from the dispatched manifest. Received units have been credited to destination usable balance; missing units are held in quarantine for Super Admin audit.
          </p>
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
                  <TableCell className="font-bold text-[#172033]">{dispatched}</TableCell>
                  <TableCell className="font-mono text-[#5b6678]">
                    {received !== undefined ? received : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-[#b42318]">
                    {hasDiff ? `-${dispatched - (received ?? 0)}` : '0'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={hasDiff ? 'danger' : 'success'}>
                      {hasDiff ? 'DISCREPANCY QUARANTINE' : 'VERIFIED IN FULL'}
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
