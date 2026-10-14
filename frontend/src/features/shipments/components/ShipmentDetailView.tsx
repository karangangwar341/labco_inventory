'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shipment, ShipmentLine } from '../shipments.types';
import { shipmentsService } from '../shipments.service';
import { useAuth } from '../../auth/auth.store';
import { canViewWarehouseIdentity } from '../../../lib/auth/permissions';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/layout/PageHeader';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';

export function ShipmentDetailView({ shipmentId }: { shipmentId: string }) {
  const { user } = useAuth();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    shipmentsService
      .getShipmentById(shipmentId)
      .then((data) => setShipment(data))
      .catch(() => setShipment(null))
      .finally(() => setLoading(false));
  }, [shipmentId]);

  if (loading) return <LoadingState message="Loading shipment details..." />;

  if (!shipment) {
    return (
      <div className="space-y-4">
        <PageHeader title="Shipment Details" />
        <EmptyState
          title="Shipment Not Found"
          description={`Unable to locate shipment [${shipmentId}]. It may have been archived or removed.`}
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
        title={`Shipment ${shipment.shipmentNumber}`}
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
          <Badge variant={isHold ? 'danger' : shipment.status === 'COMPLETED' ? 'success' : 'primary'}>
            {shipment.status}
          </Badge>
        </div>
        <div>
          <span className="text-[#5b6678] block">Source Facility</span>
          {canSeeSource ? (
            <span className="font-semibold text-[#172033]">{shipment.sourceWarehouseName || shipment.sourceLocationId || 'Central Warehouse'}</span>
          ) : (
            <span className="font-mono text-xs text-[#5b6678] bg-[#f1f5f9] px-2 py-0.5 rounded border border-[#dbe3ee] inline-block">
              [REDACTED]
            </span>
          )}
        </div>
        <div>
          <span className="text-[#5b6678] block">Destination</span>
          <span className="font-semibold text-[#172033]">{shipment.destinationName || shipment.destinationLocationId}</span>
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
              <TableHead>Product Identifier</TableHead>
              <TableHead>Dispatched Qty</TableHead>
              <TableHead>Received Qty</TableHead>
              <TableHead>Discrepancy</TableHead>
              <TableHead>Line Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {shipment.lines.map((line: ShipmentLine) => {
              const hasDiff = line.receivedQty !== undefined && line.receivedQty < line.dispatchedQty;
              return (
                <TableRow key={line.id}>
                  <TableCell className="font-medium text-[#172033]">
                    {line.productName || line.productId}
                  </TableCell>
                  <TableCell className="font-bold text-[#172033]">{line.dispatchedQty}</TableCell>
                  <TableCell className="font-mono text-[#5b6678]">
                    {line.receivedQty !== undefined ? line.receivedQty : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-[#b42318]">
                    {hasDiff ? `-${line.dispatchedQty - (line.receivedQty ?? 0)}` : '0'}
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
