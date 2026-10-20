"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { LoadingState } from "../../../components/feedback/LoadingState";
import { ProductionCycle } from "../manufacturing.types";

export interface BatchReRunItem {
  cycle: ProductionCycle;
  plannedOutput: number;
  batchNumber?: string;
  expiryDate?: string;
}

interface CyclesGridViewProps {
  cycles: ProductionCycle[];
  isLoading: boolean;
  canCreateRuns: boolean;
  onReRun: (cycle: ProductionCycle) => void;
  onBatchReRun?: (
    items: BatchReRunItem[],
    submitForApproval: boolean,
  ) => Promise<void>;
  isBatchRunning?: boolean;
  onNewRun: () => void;
  onScanLowStock?: () => void;
  isScanning?: boolean;
}

interface RowConfig {
  plannedOutput: number;
  batchNumber: string;
  expiryDate: string;
}

export function CyclesGridView({
  cycles,
  isLoading,
  canCreateRuns,
  onReRun,
  onBatchReRun,
  isBatchRunning = false,
  onNewRun,
  onScanLowStock,
  isScanning = false,
}: CyclesGridViewProps) {
  const [filter, setFilter] = useState<"ALL" | "LOW_STOCK" | "HEALTHY">("ALL");
  const [search, setSearch] = useState<string>("");
  const [viewMode, setViewMode] = useState<"TABLE" | "CARDS">("TABLE");

  // Auto-detect mobile screen width on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setViewMode("CARDS");
    }
  }, []);

  // Selection & row configuration for high-speed tabular execution
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [rowConfigs, setRowConfigs] = useState<Record<string, RowConfig>>({});
  const [autoSubmitForApproval, setAutoSubmitForApproval] = useState<boolean>(true);

  const todayLotPrefix = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `LOT-${y}${m}${day}`;
  }, []);

  const defaultExpiry = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // Initialize row configs when cycles change
  useEffect(() => {
    setRowConfigs((prev) => {
      const next = { ...prev };
      cycles.forEach((c, idx) => {
        if (!next[c.cycleKey]) {
          const pad = String(idx + 1).padStart(2, "0");
          next[c.cycleKey] = {
            plannedOutput: c.plannedOutput || 25,
            batchNumber: `${todayLotPrefix}-${pad}`,
            expiryDate: defaultExpiry,
          };
        }
      });
      return next;
    });
  }, [cycles, todayLotPrefix, defaultExpiry]);

  const lowStockCycles = useMemo(
    () => cycles.filter((c) => c.isLowStock || c.isOutOfStock),
    [cycles],
  );

  const lowStockCount = lowStockCycles.length;

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

  const toggleSelectCycle = (cycleKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(cycleKey)) {
        next.delete(cycleKey);
      } else {
        next.add(cycleKey);
      }
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedKeys((prev) => {
      const allFilteredSelected = filteredCycles.every((c) => prev.has(c.cycleKey));
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredCycles.forEach((c) => next.delete(c.cycleKey));
      } else {
        filteredCycles.forEach((c) => next.add(c.cycleKey));
      }
      return next;
    });
  };

  const selectAllLowStock = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      lowStockCycles.forEach((c) => next.add(c.cycleKey));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
  };

  const updateRowConfig = (
    cycleKey: string,
    field: keyof RowConfig,
    value: string | number,
  ) => {
    setRowConfigs((prev) => ({
      ...prev,
      [cycleKey]: {
        ...(prev[cycleKey] || {
          plannedOutput: 25,
          batchNumber: `${todayLotPrefix}-01`,
          expiryDate: defaultExpiry,
        }),
        [field]: value,
      },
    }));
  };

  const handleLaunchSelected = async () => {
    if (!onBatchReRun || selectedKeys.size === 0) return;

    const itemsToRun: BatchReRunItem[] = [];
    for (const key of selectedKeys) {
      const cycle = cycles.find((c) => c.cycleKey === key);
      if (!cycle) continue;

      const conf = rowConfigs[key] || {
        plannedOutput: cycle.plannedOutput || 25,
        batchNumber: `${todayLotPrefix}-01`,
        expiryDate: defaultExpiry,
      };

      itemsToRun.push({
        cycle,
        plannedOutput: Number(conf.plannedOutput) || 25,
        batchNumber: conf.batchNumber.trim() || undefined,
        expiryDate: conf.expiryDate || undefined,
      });
    }

    if (itemsToRun.length > 0) {
      await onBatchReRun(itemsToRun, autoSubmitForApproval);
      clearSelection();
    }
  };

  const selectedCycles = useMemo(() => {
    return cycles.filter((c) => selectedKeys.has(c.cycleKey));
  }, [cycles, selectedKeys]);

  const totalSelectedUnits = useMemo(() => {
    return selectedCycles.reduce((sum, c) => {
      const conf = rowConfigs[c.cycleKey];
      return sum + (Number(conf?.plannedOutput) || c.plannedOutput || 25);
    }, 0);
  }, [selectedCycles, rowConfigs]);

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
                Manufactured inventory has dropped below minimum threshold. Select all below to replenish in one consolidated batch run.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCreateRuns && (
              <Button
                variant="primary"
                size="sm"
                onClick={selectAllLowStock}
              >
                ⚡ Select All Low Stock ({lowStockCount})
              </Button>
            )}
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
              variant="secondary"
              size="sm"
              onClick={() => setFilter("LOW_STOCK")}
            >
              Filter Low Stock ({lowStockCount})
            </Button>
          </div>
        </div>
      )}

      {/* Control Toolbar: View Toggle, Filters, and Search */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 max-w-full">
          {/* View mode toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 shrink-0 mr-1">
            <button
              type="button"
              onClick={() => setViewMode("TABLE")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === "TABLE"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>⚡ Daily Checklist</span>
              <span className="text-[10px] text-slate-400 font-normal">Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("CARDS")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === "CARDS"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>📋 Cards</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 whitespace-nowrap transition-colors ${
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
            className={`rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
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
            className={`rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 whitespace-nowrap transition-colors ${
              filter === "HEALTHY"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Healthy Stock
          </button>
        </div>

        <div className="flex items-center gap-2">
          {canCreateRuns && viewMode === "TABLE" && lowStockCount > 0 && (
            <button
              type="button"
              onClick={selectAllLowStock}
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg border border-amber-200 shrink-0 transition-colors"
            >
              + Select {lowStockCount} Low Stock
            </button>
          )}

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search formula, product, or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

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
      ) : viewMode === "TABLE" ? (
        /* ===================================================================
           TABULAR BULK PRODUCTION CHECKLIST (HIGH-SPEED GRID)
           =================================================================== */
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          {/* Mobile Swipe Guide Banner */}
          <div className="md:hidden px-3 py-1.5 bg-blue-50/90 border-b border-blue-100 flex items-center justify-between text-[11px] text-blue-700">
            <span>👉 Swipe table sideways to see batch output & lot dates</span>
            <button
              type="button"
              onClick={() => setViewMode("CARDS")}
              className="font-bold underline text-blue-800"
            >
              Switch to Cards
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  {canCreateRuns && (
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredCycles.length > 0 &&
                          filteredCycles.every((c) => selectedKeys.has(c.cycleKey))
                        }
                        onChange={toggleSelectAllFiltered}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                        title="Select All Filtered Cycles"
                      />
                    </th>
                  )}
                  <th className="py-2.5 px-3">Formula & Finished Product</th>
                  <th className="py-2.5 px-3">Finished Stock</th>
                  <th className="py-2.5 px-3">BOM Raw Materials</th>
                  <th className="py-2.5 px-3 text-right w-36">Batch Output</th>
                  <th className="py-2.5 px-3 w-40">Target Lot / Batch #</th>
                  <th className="py-2.5 px-3 w-36">Expiry Date</th>
                  <th className="py-2.5 px-3 text-right w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCycles.map((cycle) => {
                  const isSelected = selectedKeys.has(cycle.cycleKey);
                  const conf = rowConfigs[cycle.cycleKey] || {
                    plannedOutput: cycle.plannedOutput || 25,
                    batchNumber: `${todayLotPrefix}-01`,
                    expiryDate: defaultExpiry,
                  };

                  return (
                    <tr
                      key={cycle.cycleKey}
                      className={`transition-colors ${
                        isSelected
                          ? "bg-indigo-50/60 hover:bg-indigo-50"
                          : cycle.isOutOfStock
                            ? "bg-rose-50/20 hover:bg-rose-50/40"
                            : cycle.isLowStock
                              ? "bg-amber-50/20 hover:bg-amber-50/40"
                              : "hover:bg-slate-50/70"
                      }`}
                    >
                      {/* Checkbox */}
                      {canCreateRuns && (
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectCycle(cycle.cycleKey)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                          />
                        </td>
                      )}

                      {/* Formula & Finished Product */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-xs">
                            {cycle.outputProductName}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                            <span className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 text-[10px]">
                              {cycle.cycleReference}
                            </span>
                            {cycle.outputProductSku && (
                              <span>SKU: {cycle.outputProductSku}</span>
                            )}
                            {cycle.clientName && (
                              <span className="text-slate-400">· {cycle.clientName}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Finished Stock Pill */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              cycle.isOutOfStock
                                ? "bg-rose-100 text-rose-800 border border-rose-200"
                                : cycle.isLowStock
                                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}
                          >
                            <span>
                              {cycle.isOutOfStock ? "🔴" : cycle.isLowStock ? "🟡" : "🟢"}
                            </span>
                            <span>
                              {cycle.currentStock} / min {cycle.minQuantity} {cycle.unitName}
                            </span>
                          </span>
                        </div>
                      </td>

                      {/* BOM Raw Materials */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {cycle.hasSufficientRawMaterials ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <span>✓</span>
                              <span>Raw Materials Ready</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              <span>⚠</span>
                              <span>Ingredient Shortage</span>
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            ({cycle.recipeInputs?.length || 0} inputs)
                          </span>
                        </div>
                      </td>

                      {/* Planned Output Qty Input */}
                      <td className="py-2.5 px-3 text-right">
                        {canCreateRuns ? (
                          <div className="inline-flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={conf.plannedOutput}
                              onChange={(e) =>
                                updateRowConfig(
                                  cycle.cycleKey,
                                  "plannedOutput",
                                  Math.max(1, Number(e.target.value) || 1),
                                )
                              }
                              className="w-20 text-right font-mono font-bold text-xs py-1 px-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                            <span className="text-[11px] text-slate-500 w-10 text-left truncate">
                              {cycle.unitName}
                            </span>
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-700">
                            {conf.plannedOutput} {cycle.unitName}
                          </span>
                        )}
                      </td>

                      {/* Target Lot Number */}
                      <td className="py-2.5 px-3">
                        {canCreateRuns ? (
                          <input
                            type="text"
                            value={conf.batchNumber}
                            onChange={(e) =>
                              updateRowConfig(cycle.cycleKey, "batchNumber", e.target.value)
                            }
                            placeholder="LOT / Batch #"
                            className="w-full font-mono text-xs py-1 px-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <span className="font-mono text-slate-500 text-xs">
                            {conf.batchNumber}
                          </span>
                        )}
                      </td>

                      {/* Expiry Date */}
                      <td className="py-2.5 px-3">
                        {canCreateRuns ? (
                          <input
                            type="date"
                            value={conf.expiryDate}
                            onChange={(e) =>
                              updateRowConfig(cycle.cycleKey, "expiryDate", e.target.value)
                            }
                            className="w-full text-xs py-1 px-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <span className="text-slate-500 text-xs">
                            {conf.expiryDate || "—"}
                          </span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <Button
                          variant={cycle.isLowStock || cycle.isOutOfStock ? "primary" : "secondary"}
                          size="sm"
                          onClick={() => onReRun(cycle)}
                        >
                          ⚡ Run
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ===================================================================
           ORIGINAL CARD GRID VIEW
           =================================================================== */
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

      {/* Floating Bulk Execution Action Bar when items are selected */}
      {selectedKeys.size > 0 && canCreateRuns && (
        <div className="sticky bottom-4 z-40 bg-slate-900/95 backdrop-blur-md text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-indigo-500 font-bold text-xs text-white">
              {selectedKeys.size}
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-100">
                {selectedKeys.size} Production Formula{selectedKeys.size > 1 ? "s" : ""} Selected
              </p>
              <p className="text-[11px] text-slate-300">
                Total Planned Output: <strong className="text-emerald-400">{totalSelectedUnits.toLocaleString()} units</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
            <label className="flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer select-none bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700">
              <input
                type="checkbox"
                checked={autoSubmitForApproval}
                onChange={(e) => setAutoSubmitForApproval(e.target.checked)}
                className="rounded border-slate-600 text-indigo-500 focus:ring-indigo-400 h-3.5 w-3.5 cursor-pointer"
              />
              <span>🚀 Submit for Day-End Approval immediately</span>
            </label>

            <button
              type="button"
              onClick={clearSelection}
              disabled={isBatchRunning}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Clear
            </button>

            <Button
              variant="primary"
              size="sm"
              isLoading={isBatchRunning}
              onClick={handleLaunchSelected}
            >
              🚀 Launch Selected Runs ({selectedKeys.size})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
