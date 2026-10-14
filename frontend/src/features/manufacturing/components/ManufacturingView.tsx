'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { manufacturingService } from '../manufacturing.service';
import { ProductionRun } from '../manufacturing.types';

export function ManufacturingView() {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ProductionRun | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New Run Form State
  const [newRunLocation, setNewRunLocation] = useState('loc-client-1');
  const [yieldProductId, setYieldProductId] = useState('prod-3');
  const [yieldQty, setYieldQty] = useState(25);
  const [inputRawQty, setInputRawQty] = useState(10);

  const fetchRuns = useCallback(() => {
    setIsLoading(true);
    setErrorMsg(null);
    manufacturingService
      .getProductionRuns()
      .then((data) => {
        setRuns(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load manufacturing runs');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await manufacturingService.createProductionRun({
        locationId: newRunLocation,
        yieldProductId: yieldProductId,
        plannedQuantity: Number(yieldQty),
        inputLines: [{ productId: 'prod-1', quantity: Number(inputRawQty) }],
      });
      setIsModalOpen(false);
      setActionSuccess('Production run created successfully as draft.');
      fetchRuns();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create production run');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Client Manufacturing & Production Runs"
        description="Convert bulk raw ingredients into finished assay kits and controls under strict BOM formulation ratios."
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            + New Production Run
          </Button>
        }
      />

      {actionSuccess && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-[#18794e] text-xs flex items-center justify-between">
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-[#18794e]">✕</button>
        </div>
      )}

      {errorMsg && (
        <ErrorState message={errorMsg} onRetry={fetchRuns} />
      )}

      {isLoading ? (
        <LoadingState message="Loading client production runs..." />
      ) : runs.length === 0 ? (
        <EmptyState
          title="No manufacturing runs found"
          description="Create a new production run to initiate BOM consumption and finished goods formulation."
          action={
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              + Start First Production Run
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            {runs.map((r) => {
              const isSelected = selectedRun?.id === r.id;
              const isApproved = r.status === 'APPROVED';
              const isPending = r.status === 'PENDING_APPROVAL';

              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRun(r)}
                  className={`p-4 rounded-xl border bg-white cursor-pointer transition-all shadow-sm ${
                    isSelected
                      ? 'border-[#2563eb] ring-1 ring-[#2563eb]'
                      : 'border-[#dbe3ee] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#172033] text-sm">
                          {r.runNumber}
                        </span>
                        <Badge
                          variant={
                            isApproved
                              ? 'success'
                              : isPending
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {r.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#5b6678] mt-0.5">
                        {r.clientName || 'Client Facility'}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-[#18794e]">
                        Yield: {r.plannedQuantity} {r.yieldProductName || 'units'}
                      </span>
                      <p className="text-[11px] text-[#5b6678] mt-0.5">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#f1f5f9] flex items-center justify-between text-xs text-[#5b6678]">
                    <span>
                      BOM Inputs: {r.inputLines?.length || 0} line items
                    </span>
                    <span className="text-[#2563eb] font-semibold">Inspect BOM Details →</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            {selectedRun ? (
              <div className="bg-white border border-[#dbe3ee] rounded-xl p-4 shadow-sm space-y-4">
                <div className="border-b border-[#dbe3ee] pb-3">
                  <span className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">
                    Manufacturing Run Details
                  </span>
                  <h3 className="text-sm font-bold text-[#172033] mt-0.5">
                    {selectedRun.runNumber}
                  </h3>
                  <p className="text-xs text-[#5b6678]">{selectedRun.clientName || 'Client'}</p>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#f1f5f9]">
                    <span className="text-[#5b6678]">Yield Target</span>
                    <span className="font-semibold text-[#18794e]">
                      {selectedRun.plannedQuantity} {selectedRun.yieldProductName || 'Units'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#f1f5f9]">
                    <span className="text-[#5b6678]">Status</span>
                    <Badge variant={selectedRun.status === 'APPROVED' ? 'success' : 'warning'}>
                      {selectedRun.status}
                    </Badge>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[#172033] mb-2">
                    Bill of Materials (BOM Deductions)
                  </h4>
                  <div className="space-y-1.5">
                    {selectedRun.inputLines && selectedRun.inputLines.length > 0 ? (
                      selectedRun.inputLines.map((inp: { productName?: string; productId: string; quantity: number; unit?: string }, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#f8fafc] border border-[#dbe3ee] text-xs"
                        >
                          <span className="text-[#172033] font-medium">
                            {inp.productName || inp.productId}
                          </span>
                          <span className="font-mono text-[#b42318] font-bold">
                            - {inp.quantity} {inp.unit || 'units'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[#5b6678]">Standard formulation BOM.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-[#dbe3ee] rounded-xl p-8 text-center text-xs text-[#5b6678]">
                Select a production run from the list to view its bill of materials and yield specifications.
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Run Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Initiate Client Production Run"
      >
        <form onSubmit={handleCreateRun} className="space-y-3.5 text-xs">
          <Input
            label="Location ID"
            value={newRunLocation}
            onChange={(e) => setNewRunLocation(e.target.value)}
            required
          />
          <Input
            label="Yield Product ID"
            value={yieldProductId}
            onChange={(e) => setYieldProductId(e.target.value)}
            required
          />
          <Input
            label="Planned Output Quantity"
            type="number"
            value={yieldQty}
            onChange={(e) => setYieldQty(Number(e.target.value))}
            required
            min={1}
          />
          <Input
            label="Input Raw Quantity (BOM Requirement)"
            type="number"
            value={inputRawQty}
            onChange={(e) => setInputRawQty(Number(e.target.value))}
            required
            min={1}
          />
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Submit Production Run
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default ManufacturingView;
