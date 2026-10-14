'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/layout/PageHeader';
import { requestsService } from '../requests.service';

export function CreateRequestForm() {
  const router = useRouter();

  const [requestType, setRequestType] = useState<'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'PHYSICAL_COUNT'>('STOCK_OUT');
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [sourceLocation, setSourceLocation] = useState('Central Warehouse (Main Hub)');
  const [destinationClient, setDestinationClient] = useState('Metro Diagnostics Lab');
  const [justification, setJustification] = useState('');

  const [lines, setLines] = useState<Array<{
    productId: string;
    productName: string;
    unit: string;
    quantity: number;
    condition: 'USABLE' | 'DAMAGED' | 'EXPIRED';
    batchNumber: string;
  }>>([
    {
      productId: 'prod-1',
      productName: 'Reagent Cartridge Alpha-9',
      unit: 'CARTON',
      quantity: 5,
      condition: 'USABLE',
      batchNumber: 'LOT-2026-A1',
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const addLine = () => {
    setLines([
      ...lines,
      {
        productId: 'prod-2',
        productName: 'Sterile Micro-Pipette Tips (200uL)',
        unit: 'PACK',
        quantity: 10,
        condition: 'USABLE',
        batchNumber: '',
      },
    ]);
  };

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    for (const line of lines) {
      if (line.quantity <= 0) {
        setFormError('All line quantities must be strictly greater than zero.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      await requestsService.createRequest({
        type: requestType,
        locationId: 'loc-wh-1',
        priority,
        notes: justification,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          condition: l.condition,
          batchNumber: l.batchNumber || undefined,
        })),
      });
      router.push('/requests');
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit stock request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        title="Create Stock Request"
        description="Draft and submit inventory movements. Reservations allocate automatically upon submission."
        actions={
          <Link href="/requests">
            <Button variant="secondary" size="sm">← Back to Requests</Button>
          </Link>
        }
      />

      {formError && (
        <div className="p-3 bg-[#fef3f2] border border-[#fee4e2] rounded-lg text-[#b42318] text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>{formError}</span>
        </div>
      )}

      <div className="p-3.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg text-xs space-y-1">
        <span className="font-semibold text-[#2563eb] flex items-center gap-1.5">
          <span>🔒</span> Atomic Reservation Notice:
        </span>
        <p className="text-[#172033] leading-relaxed">
          Submitting this request will automatically reserve stock from usable inventory (<code className="font-semibold">Available = Usable - Reserved ≥ 0</code>). Stock ledger updates will post only upon Super Admin approval.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-[#dbe3ee] rounded-xl p-5 shadow-xs space-y-5 text-xs">
        {/* Movement Type */}
        <div className="space-y-1.5">
          <label className="text-[#172033] font-semibold block">Movement Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { type: 'STOCK_OUT', label: 'Dispatch (Out)', desc: 'Ship to client' },
              { type: 'STOCK_IN', label: 'Intake (In)', desc: 'Receive supplier' },
              { type: 'TRANSFER', label: 'Transfer', desc: 'Move between hubs' },
              { type: 'PHYSICAL_COUNT', label: 'Count Adjustment', desc: 'Reconcile variance' },
            ].map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => setRequestType(t.type as any)}
                className={`p-2.5 rounded-lg border text-left transition ${
                  requestType === t.type
                    ? 'bg-[#eff6ff] border-[#2563eb] text-[#2563eb] font-semibold'
                    : 'bg-white border-[#dbe3ee] text-[#5b6678] hover:border-slate-400'
                }`}
              >
                <div className="font-semibold text-xs">{t.label}</div>
                <div className="text-[10px] text-[#5b6678] mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Origin & Destination */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <label className="text-[#172033] font-semibold block">Origin Location</label>
            <select
              value={sourceLocation}
              onChange={(e) => setSourceLocation(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
            >
              <option value="Central Warehouse (Main Hub)">Central Warehouse (Main Hub)</option>
              <option value="Metro Diagnostics Lab (Client Loc)">Metro Diagnostics Lab (Client Loc)</option>
            </select>
          </div>

          {requestType === 'STOCK_OUT' && (
            <div className="space-y-1">
              <label className="text-[#172033] font-semibold block">Destination Client</label>
              <select
                value={destinationClient}
                onChange={(e) => setDestinationClient(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
              >
                <option value="Metro Diagnostics Lab">Metro Diagnostics Lab (Assigned)</option>
                <option value="City Clinical Laboratories">City Clinical Laboratories (Assigned)</option>
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[#172033] font-semibold block">Priority Level</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="w-full px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
            >
              <option value="NORMAL">Normal Priority</option>
              <option value="URGENT">Urgent (Expedited Queue)</option>
            </select>
          </div>
        </div>

        {/* Dynamic Lines */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#172033]">Requested Items & Quantities</span>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              + Add Item Line
            </Button>
          </div>

          <div className="space-y-2.5">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="p-3 bg-[#f8fafc] border border-[#dbe3ee] rounded-lg grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
              >
                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[10px] text-[#5b6678] font-semibold block">Product</label>
                  <select
                    value={line.productId}
                    onChange={(e) => {
                      const name = e.target.value === 'prod-1' ? 'Reagent Cartridge Alpha-9' : 'Sterile Micro-Pipette Tips (200uL)';
                      setLines(lines.map((l, i) => i === idx ? { ...l, productId: e.target.value, productName: name } : l));
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
                  >
                    <option value="prod-1">Reagent Cartridge Alpha-9</option>
                    <option value="prod-2">Sterile Micro-Pipette Tips (200uL)</option>
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] text-[#5b6678] font-semibold block">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setLines(lines.map((l, i) => i === idx ? { ...l, quantity: val } : l));
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] text-[#5b6678] font-semibold block">Unit</label>
                  <select
                    value={line.unit}
                    onChange={(e) => setLines(lines.map((l, i) => i === idx ? { ...l, unit: e.target.value } : l))}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
                  >
                    <option value="CARTON">CARTON</option>
                    <option value="PACK">PACK</option>
                    <option value="PIECE">PIECE</option>
                  </select>
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[10px] text-[#5b6678] font-semibold block">Batch / Lot #</label>
                  <input
                    type="text"
                    value={line.batchNumber}
                    placeholder="e.g. LOT-2026-A1"
                    onChange={(e) => setLines(lines.map((l, i) => i === idx ? { ...l, batchNumber: e.target.value } : l))}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
                  />
                </div>

                <div className="sm:col-span-1 flex justify-end items-end pt-2">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    className="p-1.5 text-[#5b6678] hover:text-[#b42318] disabled:opacity-30"
                    title="Remove item"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Justification */}
        <div className="space-y-1">
          <label className="text-[#172033] font-semibold block">Operational Notes / Justification</label>
          <textarea
            rows={2}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Operational purpose of this stock movement..."
            className="w-full px-3 py-2 bg-white border border-[#dbe3ee] rounded-md text-[#172033] placeholder-[#5b6678]/60 focus:outline-none focus:border-[#2563eb]"
          />
        </div>

        {/* Submit Controls */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#dbe3ee]">
          <Link href="/requests">
            <Button type="button" variant="quiet">Cancel</Button>
          </Link>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Submit Request for Approval
          </Button>
        </div>
      </form>
    </div>
  );
}

export default CreateRequestForm;
