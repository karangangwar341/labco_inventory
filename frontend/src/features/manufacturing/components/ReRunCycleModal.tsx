"use client";

import React, { useState, useMemo } from "react";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Badge } from "../../../components/ui/Badge";
import { ProductionCycle, ReRunCyclePayload } from "../manufacturing.types";

interface ReRunCycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycle: ProductionCycle | null;
  onSubmit: (payload: ReRunCyclePayload, autoSubmit?: boolean) => Promise<void>;
  isSubmitting?: boolean;
  stockByProductId?: Map<string, { availableQty: number; usableQty: number; unit?: string }>;
}

export function ReRunCycleModal(props: ReRunCycleModalProps) {
  if (!props.isOpen || !props.cycle) return null;
  return <ReRunCycleModalContent {...props} cycle={props.cycle} />;
}

function ReRunCycleModalContent({
  isOpen,
  onClose,
  cycle,
  onSubmit,
  isSubmitting = false,
  stockByProductId,
}: ReRunCycleModalProps & { cycle: ProductionCycle }) {
  const defaultPlanned = cycle.plannedOutput || 25;
  const [plannedQty, setPlannedQty] = useState<number>(defaultPlanned);
  const [batchNumber, setBatchNumber] = useState<string>(() => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BATCH-${today}-${rand}`;
  });
  const [expiryDate, setExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState<string>(
    `Re-run production cycle for ${cycle.outputProductName} (${cycle.cycleReference})`,
  );
  const [autoSubmitApproval, setAutoSubmitApproval] = useState<boolean>(false);

  // Read existing finished stock from cached balances if available
  const existingFinishedStock =
    cycle.outputProductId && stockByProductId?.has(cycle.outputProductId)
      ? (stockByProductId.get(cycle.outputProductId)?.availableQty ?? 0)
      : cycle.currentStock;

  const isOutOfStock = existingFinishedStock <= 0;
  const isLowStock = cycle.minQuantity > 0 && existingFinishedStock <= cycle.minQuantity;

  // Scale raw materials based on planned quantity ratio
  const ratio = defaultPlanned > 0 ? plannedQty / defaultPlanned : 1;

  const scaledIngredients = useMemo(() => {
    return (cycle.recipeInputs || []).map((inp) => {
      const scaledRequired = Math.round(inp.quantity * ratio * 100) / 100;
      // Prefer cached inventory balance
      const currentAvailableStock =
        stockByProductId?.has(inp.productId)
          ? (stockByProductId.get(inp.productId)?.availableQty ?? 0)
          : inp.currentAvailableStock;

      const isSufficient = currentAvailableStock >= scaledRequired;
      return {
        ...inp,
        currentAvailableStock,
        scaledRequired,
        isSufficient,
      };
    });
  }, [cycle.recipeInputs, ratio, stockByProductId]);

  const allMaterialsAvailable = scaledIngredients.every((i) => i.isSufficient);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(
      {
        plannedOutput: Number(plannedQty),
        batchNumber: batchNumber.trim() || undefined,
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined,
        notes: notes.trim() || undefined,
      },
      autoSubmitApproval,
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Re-Run Production Cycle: ${cycle.cycleReference}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Cycle header summary card */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                Formula Recipe
              </span>
              <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                {cycle.outputProductName}
              </h4>
            </div>
            <div className="text-right">
              <Badge
                variant={
                  isOutOfStock
                    ? "danger"
                    : isLowStock
                      ? "warning"
                      : "success"
                }
              >
                {isOutOfStock
                  ? "Out of Stock (0 remaining)"
                  : isLowStock
                    ? `Low Stock (${existingFinishedStock} / min ${cycle.minQuantity})`
                    : `Stock Healthy (${existingFinishedStock} ${cycle.unitName})`}
              </Badge>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                Existing Stock: {existingFinishedStock} {cycle.unitName}
              </p>
            </div>
          </div>
        </div>

        {/* Quantities & Batch Info */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label={`Planned Output Quantity (${cycle.unitName})`}
            type="number"
            value={plannedQty}
            onChange={(e) => setPlannedQty(Math.max(1, Number(e.target.value)))}
            required
            min={1}
            step="any"
          />
          <Input
            label="Generated Batch Number"
            type="text"
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Batch Expiry Date"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
          <Input
            label="Batch / Execution Notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Scaled BOM Ingredients Requirements with Existing Cached Stock */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block font-semibold text-slate-800">
              Raw Materials Required for {plannedQty} {cycle.unitName}
            </label>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                allMaterialsAvailable
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              {allMaterialsAvailable
                ? "✓ All Raw Materials In Stock"
                : "⚠ Some Ingredients Low or Missing"}
            </span>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white">
            {scaledIngredients.length === 0 ? (
              <div className="p-3 text-center text-slate-400">
                No input ingredients registered in this cycle recipe.
              </div>
            ) : (
              scaledIngredients.map((ing, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <span className="font-medium text-slate-900 block">
                      {ing.productName}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Existing Stock:{" "}
                      <strong className={ing.isSufficient ? "text-slate-900" : "text-rose-700"}>
                        {ing.currentAvailableStock}
                      </strong>{" "}
                      {ing.unitName}
                    </span>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="font-semibold text-slate-800 font-mono">
                      Required: {ing.scaledRequired} {ing.unitName}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        ing.isSufficient
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {ing.isSufficient
                        ? "Sufficient"
                        : `Short by ${Math.round((ing.scaledRequired - ing.currentAvailableStock) * 100) / 100}`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Note on draft & invariants */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-600 space-y-1">
          <p className="font-medium text-slate-800">Non-negotiable Invariant:</p>
          <p>
            Re-running a cycle creates a new production run instance. No raw
            materials are deducted and no finished goods are added until final Super
            Admin approval.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
          >
            ⚡ Create Production Run Instance
          </Button>
        </div>
      </form>
    </Modal>
  );
}
