"use client";

import React, { useState, useMemo } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { LoadingState } from "../../../components/feedback/LoadingState";
import { ProductionCycle } from "../manufacturing.types";

interface CyclesGridViewProps {
  cycles: ProductionCycle[];
  isLoading: boolean;
  canCreateRuns: boolean;
  onReRun: (cycle: ProductionCycle) => void;
  onNewRun: () => void;
  onScanLowStock?: () => void;
  isScanning?: boolean;
}

export function CyclesGridView({
  cycles,
  isLoading,
  canCreateRuns,
  onReRun,
  onNewRun,
  onScanLowStock,
  isScanning = false,
}: CyclesGridViewProps) {
  const [filter, setFilter] = useState<"ALL" | "LOW_STOCK" | "HEALTHY">("ALL");
  const [search, setSearch] = useState<string>("");

  const lowStockCount = useMemo(
    () => cycles.filter((c) => c.isLowStock || c.isOutOfStock).length,
    [cycles],
  );

  const filteredCycles = useMemo(() => {
    return cycles.filter((c) => {
      // Status filter
      if (filter === "LOW_STOCK" && !c.isLowStock && !c.isOutOfStock) return false;
      if (filter === "HEALTHY" && (c.isLowStock || c.isOutOfStock)) return false;

      // Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = c.outputProductName?.toLowerCase().includes(q);
        const matchSku = c.outputProductSku?.toLowerCase().includes(q);
        const matchRef = c.cycleReference?.toLowerCase().includes(q);
        const matchClient = c.clientName?.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchRef && !matchClient) return false;
      }

      return true;
    });
  }, [cycles, filter, search]);

  if (isLoading) {
    return <LoadingState message="Loading production cycles and stock levels..." />;
  }

  return (
    <div className="space-y-4">
      {/* Low stock replenishment alert banner */}
      {lowStockCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">⚡</span>
            <div>
              <h4 className="font-bold text-amber-900 text-sm">
                Replenishment Alert: {lowStockCount} Finished Product{lowStockCount > 1 ? "s" : ""} Below Threshold
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Manufactured stock has dropped below minimum inventory requirements. Re-run cycles with 1-click to launch production batches.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onScanLowStock && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onScanLowStock}
                isLoading={isScanning}
              >
                Scan & Notify
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setFilter("LOW_STOCK")}
            >
              View Low Stock Cycles ({lowStockCount})
            </Button>
          </div>
        </div>
      )}

      {/* Filter and search bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === "ALL"
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            All Formulas ({cycles.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("LOW_STOCK")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
              filter === "LOW_STOCK"
                ? "bg-amber-100 text-amber-900 border border-amber-300"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span>Needs Re-Run</span>
            {lowStockCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {lowStockCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter("HEALTHY")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === "HEALTHY"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Healthy Stock
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search cycle or product name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Grid of Cycle Cards */}
      {filteredCycles.length === 0 ? (
        <EmptyState
          title={
            cycles.length === 0
              ? "No Production Cycles Defined Yet"
              : "No Cycles Match Filter"
          }
          description={
            cycles.length === 0
              ? "Create your first production run to establish a reusable cycle formula. Once created, you can re-run it anytime stock is depleted."
              : "Try switching filters or clearing your search term."
          }
          action={
            canCreateRuns && cycles.length === 0 ? (
              <Button variant="primary" onClick={onNewRun}>
                + Create First Production Run
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCycles.map((cycle) => {
            const stockPct =
              cycle.minQuantity > 0
                ? Math.min(100, Math.round((cycle.currentStock / cycle.minQuantity) * 100))
                : 100;

            return (
              <div
                key={cycle.cycleKey}
                className={`rounded-xl border bg-white p-4 shadow-xs transition-all hover:shadow-md flex flex-col justify-between ${
                  cycle.isOutOfStock
                    ? "border-rose-200 ring-1 ring-rose-200/50"
                    : cycle.isLowStock
                      ? "border-amber-200 ring-1 ring-amber-200/50"
                      : "border-slate-200"
                }`}
              >
                <div>
                  {/* Top Bar: Cycle Ref & Total Executions */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-[11px] font-semibold uppercase text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                      {cycle.cycleReference}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {cycle.totalExecutions} execution{cycle.totalExecutions > 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Product Title */}
                  <h3 className="font-bold text-slate-900 text-sm leading-snug">
                    {cycle.outputProductName}
                  </h3>

                  {/* Client name if super admin */}
                  {cycle.clientName && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Facility: <span className="font-medium text-slate-700">{cycle.clientName}</span>
                    </p>
                  )}

                  {/* Stock Health Widget */}
                  <div className="mt-3.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">Finished Goods Stock:</span>
                      <span
                        className={`font-bold ${
                          cycle.isOutOfStock
                            ? "text-rose-700"
                            : cycle.isLowStock
                              ? "text-amber-700"
                              : "text-emerald-700"
                        }`}
                      >
                        {cycle.currentStock} / min {cycle.minQuantity} {cycle.unitName}
                      </span>
                    </div>

                    {/* Progress visual bar */}
                    <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          cycle.isOutOfStock
                            ? "w-0"
                            : cycle.isLowStock
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.max(4, stockPct)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                      <span>Status</span>
                      <span className="font-medium">
                        {cycle.isOutOfStock
                          ? "🔴 Depleted (0 Available)"
                          : cycle.isLowStock
                            ? "🟡 Low Stock Triggered"
                            : "🟢 Stock Healthy"}
                      </span>
                    </div>
                  </div>

                  {/* Raw Material BOM preview */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700">Formula Recipe:</span>
                      <span
                        className={`text-[10px] font-bold ${
                          cycle.hasSufficientRawMaterials
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }`}
                      >
                        {cycle.hasSufficientRawMaterials
                          ? "✓ Ingredients In Stock"
                          : "⚠ Ingredient Shortage"}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {(cycle.recipeInputs || []).slice(0, 3).map((inp, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] py-0.5 px-2 rounded bg-slate-50 border border-slate-100 text-slate-600"
                        >
                          <span className="truncate max-w-[160px]">{inp.productName}</span>
                          <span className="font-medium text-slate-800">
                            {inp.quantity} {inp.unitName}
                          </span>
                        </div>
                      ))}
                      {(cycle.recipeInputs?.length || 0) > 3 && (
                        <p className="text-[10px] text-slate-400 italic text-right">
                          + {cycle.recipeInputs.length - 3} more ingredients
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400">
                    Last: {new Date(cycle.lastExecutedAt).toLocaleDateString()}
                  </div>

                  <Button
                    variant={cycle.isLowStock || cycle.isOutOfStock ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => onReRun(cycle)}
                  >
                    ⚡ Re-Run Cycle
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
