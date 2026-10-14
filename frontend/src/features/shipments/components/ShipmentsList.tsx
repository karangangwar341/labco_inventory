'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shipment, ShipmentLine } from '../shipments.types';
import { shipmentsService } from '../shipments.service';
import { useAuth } from '../../auth/auth.store';
import { canViewWarehouseIdentity } from '../../../lib/auth/permissions';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { StatusLabel } from '../../../components/data-display/StatusLabel';

export function ShipmentsList() {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [receiptInputs, setReceiptInputs] = useState<Record<string, number>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    shipmentsService.getShipments().then((data) => setShipments(data || []));
  }, []);

  const openReceiveModal = (s: Shipment) => {
    setSelectedShipment(s);
    setFormError(null);
    const initial: Record<string, number> = {};
    s.lines.forEach((l: ShipmentLine) => {
      initial[l.id] = l.dispatchedQty;
    });
    setReceiptInputs(initial);
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipment) return;

    for (const line of selectedShipment.lines) {
      const qty = receiptInputs[line.id] ?? 0;
      if (qty < 0) {
        setFormError(`Received quantity cannot be negative for ${line.productName || line.productId}.`);
        return;
      }
      if (qty > line.dispatchedQty) {
        setFormError(
          `Violation: Received quantity (${qty}) cannot exceed dispatched quantity (${line.dispatchedQty}) for ${line.productName || line.productId}. Discrepancy excess rejected.`,
        );
        return;
      }
    }

    let hasDiscrepancy = false;
    selectedShipment.lines.forEach((l: ShipmentLine) => {
      const qty = receiptInputs[l.id] ?? 0;
      if (qty < l.dispatchedQty) hasDiscrepancy = true;
    });

    try {
      await shipmentsService.confirmReceipt(selectedShipment.id, {
        lines: selectedShipment.lines.map((l: ShipmentLine) => ({
          lineId: l.id,
          receivedQty: receiptInputs[l.id] ?? l.dispatchedQty,
        })),
      });
      const refreshed = await shipmentsService.getShipments();
      setShipments(refreshed || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Receipt confirmation failed';
      setFormError(msg);
      return;
    }

    setSubmitSuccess(
      hasDiscrepancy
        ? `Shipment marked DISCREPANCY_HOLD. Received units credited; missing units flagged for Super Admin investigation.`
        : `Shipment completed! Destination stock credited atomically.`,
    );

    setSelectedShipment(null);
    setTimeout(() => setSubmitSuccess(null), 5000);
  };

  const canSeeSource = canViewWarehouseIdentity(user?.role);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shipments & Receipts"
        description="Origin to destination transit tracking. Strictly bounds receiving verification against dispatched line items."
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

      <Table>
        <TableHeader sticky>
          <tr>
            <TableHead>Tracking #</TableHead>
            <TableHead>Origin Facility</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Line Items &amp; Counts</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Dispatched</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {shipments.map((s) => {
            const displayedSource = canSeeSource
              ? s.sourceWarehouseName || s.sourceLocationId || 'Central Warehouse'
              : '[REDACTED]';

            const canReceive = s.status === 'IN_TRANSIT';

            return (
              <TableRow key={s.id}>
                <TableCell className="font-mono font-medium text-[#172033]">
                  {s.shipmentNumber}
                </TableCell>
                <TableCell>
                  {!canSeeSource ? (
                    <span className="px-2 py-0.5 rounded bg-[#f1f5f9] text-[#5b6678] text-[11px] font-mono border border-[#dbe3ee]">
                      [REDACTED]
                    </span>
                  ) : (
                    <span className="text-[#5b6678]">{displayedSource}</span>
                  )}
                </TableCell>
                <TableCell className="text-[#5b6678]">{s.destinationName || s.destinationLocationId}</TableCell>
                <TableCell>
                  {s.lines.map((l: ShipmentLine) => (
                    <div key={l.id} className="text-[11px]">
                      <span className="font-medium text-[#172033]">{l.productName || l.productId}</span>: {l.dispatchedQty}
                      {s.status === 'COMPLETED' && (
                        <span className="text-[#18794e] ml-1">(Rec: {l.receivedQty})</span>
                      )}
                      {s.status === 'DISCREPANCY_HOLD' && (
                        <span className="text-[#b42318] ml-1 font-semibold">
                          (Rec: {l.receivedQty} · Missing {l.dispatchedQty - (l.receivedQty ?? 0)})
                        </span>
                      )}
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  <StatusLabel status={s.status} />
                </TableCell>
                <TableCell className="text-[#5b6678] font-mono text-[11px]">
                  {s.dispatchedAt ? new Date(s.dispatchedAt).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell className="text-right space-x-1.5 whitespace-nowrap">
                  <Link href={`/shipments/${s.id}`}>
                    <Button variant="secondary" size="sm">Inspect</Button>
                  </Link>

                  {canReceive && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openReceiveModal(s)}
                    >
                      Receive &amp; Verify
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Strict Receipt Verification Modal */}
      <Modal
        isOpen={!!selectedShipment}
        onClose={() => setSelectedShipment(null)}
        title={`Receive & Verify Shipment: ${selectedShipment?.shipmentNumber}`}
      >
        {selectedShipment && (
          <form onSubmit={handleReceiveSubmit} className="space-y-4 text-xs">
            <p className="text-[#5b6678]">
              Verify physical counts received at your facility. Discrepancies below dispatched quantities will immediately place the shipment in <strong>DISCREPANCY_HOLD</strong> for Super Admin review. Quantities exceeding dispatched counts are strictly rejected.
            </p>

            {formError && (
              <div className="p-2.5 bg-[#fef3f2] border border-[#fee4e2] rounded-md text-[#b42318] font-medium">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              {selectedShipment.lines.map((line: ShipmentLine) => (
                <div key={line.id} className="p-3 bg-[#f8fafc] border border-[#dbe3ee] rounded-lg space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-[#172033]">{line.productName || line.productId}</span>
                    <span className="text-[#5b6678]">Dispatched: <strong className="text-[#172033]">{line.dispatchedQty}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-[#5b6678]">Confirmed Received Qty:</label>
                    <input
                      type="number"
                      min="0"
                      max={line.dispatchedQty}
                      value={receiptInputs[line.id] ?? line.dispatchedQty}
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
              ))}
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
