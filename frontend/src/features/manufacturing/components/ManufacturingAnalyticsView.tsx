"use client";

import React, { useState, useMemo } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { LoadingState } from "../../../components/feedback/LoadingState";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ManufacturingAnalytics } from "../manufacturing.types";
import {
  DateQuickFilterBar,
  DateQuickFilter,
  isDateInRange,
} from "../../../components/data-display/DateQuickFilterBar";

interface ManufacturingAnalyticsViewProps {
  analytics: ManufacturingAnalytics | undefined;
  isLoading: boolean;
  role?: string;
  projects?: Array<{ id: string; name: string }>;
  selectedProjectId?: string;
  onProjectChange?: (projectId: string) => void;
  onReRunCycleId?: (runId: string) => void;
  onRefresh?: () => void;
}

export function ManufacturingAnalyticsView({
  analytics,
  isLoading,
  role,
  projects = [],
  selectedProjectId,
  onProjectChange,
  onReRunCycleId,
  onRefresh,
}: ManufacturingAnalyticsViewProps) {
  const isSuperAdmin = role === "SUPER_ADMIN";
  const [ledgerSearch, setLedgerSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dateFilter, setDateFilter] = useState<DateQuickFilter>("TODAY");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const summary = analytics?.summary;
  const cycleBreakdown = analytics?.cycleBreakdown || [];
  const materialConsumption = analytics?.materialConsumption || [];
  const executionHistory = analytics?.executionHistory || [];

  const olderHistoryCount = useMemo(() => {
    return executionHistory.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      return !isDateInRange(item.submittedAt || item.approvedAt, "TODAY");
    }).length;
  }, [executionHistory, statusFilter]);

  const filteredHistory = useMemo(() => {
    return executionHistory.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (!isDateInRange(item.submittedAt || item.approvedAt, dateFilter, customStart, customEnd)) {
        return false;
      }
      if (ledgerSearch.trim()) {
        const q = ledgerSearch.toLowerCase();
        const matchRun = item.runNumber?.toLowerCase().includes(q);
        const matchRef = item.cycleReference?.toLowerCase().includes(q);
        const matchProd = item.outputProductName?.toLowerCase().includes(q);
        const matchSubmitter = item.submittedBy?.toLowerCase().includes(q);
        const matchProject = item.projectName?.toLowerCase().includes(q);
        if (!matchRun && !matchRef && !matchProd && !matchSubmitter && !matchProject) {
          return false;
        }
      }
      return true;
    });
  }, [executionHistory, statusFilter, dateFilter, customStart, customEnd, ledgerSearch]);

  if (isLoading) {
    return <LoadingState message="Generating production analytics and cycle execution ledger..." />;
  }

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
          {/* Project Filter for Super Admin */}
          {isSuperAdmin && projects.length > 0 && onProjectChange && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
              <label className="text-xs font-semibold text-slate-700 shrink-0">Project Facility:</label>
              <select
                value={selectedProjectId || ""}
                onChange={(e) => onProjectChange(e.target.value)}
                className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All Projects (Enterprise View)</option>
                {projects.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
            <label className="text-xs font-semibold text-slate-700 shrink-0">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="APPROVED">Approved / Completed</option>
              <option value="PENDING_APPROVAL">Waiting Approval</option>
              <option value="DRAFT">Draft</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 sm:pt-0">
          {onRefresh && (
            <Button variant="secondary" size="sm" className="w-full sm:w-auto" onClick={onRefresh}>
              ↻ Refresh Analytics
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stat Ribbon (6 Metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 block">Defined Cycles</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">
            {summary?.totalCycles ?? 0}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Formulation templates</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 block">Total Executions</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">
            {summary?.totalRuns ?? 0}
          </span>
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500">
            <span className="text-emerald-700 font-bold">{summary?.approvedRuns ?? 0} approved</span>
            <span>•</span>
            <span className="text-amber-700 font-bold">{summary?.pendingRuns ?? 0} pending</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 block">Finished Goods Produced</span>
          <span className="text-2xl font-bold text-indigo-700 mt-1 block">
            {(summary?.totalProduced ?? 0).toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Target: {(summary?.totalPlanned ?? 0).toLocaleString()}
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 block">Avg Yield Efficiency</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span
              className={`text-2xl font-bold ${
                (summary?.avgYieldEfficiency ?? 0) >= 95
                  ? "text-emerald-700"
                  : (summary?.avgYieldEfficiency ?? 0) >= 80
                    ? "text-blue-700"
                    : "text-amber-700"
              }`}
            >
              {summary?.avgYieldEfficiency ?? 0}%
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Actual / Planned output</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 block">Wastage / Scrap Rate</span>
          <span className="text-2xl font-bold text-slate-700 mt-1 block">
            {summary?.wastageRate ?? 0}%
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            {(summary?.totalWastage ?? 0).toLocaleString()} scrap units
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 block">Replenishment Alerts</span>
          <span
            className={`text-2xl font-bold mt-1 block ${
              (summary?.lowStockCyclesCount ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            {summary?.lowStockCyclesCount ?? 0}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            {(summary?.lowStockCyclesCount ?? 0) > 0
              ? "Cycles below min threshold"
              : "All stock healthy"}
          </span>
        </div>
      </div>

      {/* Two-Column Matrix: Cycle Breakdown & Raw Material Consumption */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cycle Performance Matrix */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Cycle Performance Matrix</h3>
              <p className="text-[11px] text-slate-500">
                Performance, execution counts, and yield efficiency per formulation
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {cycleBreakdown.length} formulas
            </span>
          </div>

          {cycleBreakdown.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No cycle performance data recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[11px] font-semibold">
                    <th className="pb-2">Formula / Cycle</th>
                    <th className="pb-2">Output Product</th>
                    <th className="pb-2 text-center">Runs</th>
                    <th className="pb-2 text-right">Produced</th>
                    <th className="pb-2 text-right">Yield %</th>
                    {onReRunCycleId && <th className="pb-2 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cycleBreakdown.map((cycle, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 font-mono text-[11px] font-semibold text-indigo-700">
                        {cycle.cycleReference}
                        {isSuperAdmin && cycle.projectName && (
                          <span className="block text-[10px] text-slate-400 font-sans font-normal">
                            {cycle.projectName}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 font-medium text-slate-800">
                        {cycle.outputProductName}
                      </td>
                      <td className="py-2.5 text-center text-slate-700">
                        <span className="font-semibold">{cycle.runsCount}</span>
                        <span className="text-[10px] text-slate-400 block">
                          ({cycle.approvedCount} approved)
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">
                        {cycle.totalOutput.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right">
                        {cycle.avgYield != null ? (
                          <span
                            className={`font-bold ${
                              cycle.avgYield >= 95
                                ? "text-emerald-700"
                                : cycle.avgYield >= 80
                                  ? "text-blue-700"
                                  : "text-amber-700"
                            }`}
                          >
                            {cycle.avgYield}%
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      {onReRunCycleId && (
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => onReRunCycleId(cycle.latestRunId)}
                            className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
                          >
                            Re-Run →
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Raw Material Consumption Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Raw Material Consumption</h3>
              <p className="text-[11px] text-slate-500">
                Total bulk raw materials consumed across all approved production runs
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {materialConsumption.length} materials
            </span>
          </div>

          {materialConsumption.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No material consumption recorded yet. Material ledger tracks approved production runs.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[11px] font-semibold">
                    <th className="pb-2">Raw Material</th>
                    <th className="pb-2 text-right">Total Consumed</th>
                    <th className="pb-2 text-right">Unit of Measure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {materialConsumption.map((mat, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 font-medium text-slate-900">
                        {mat.productName}
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900 font-mono">
                        {mat.totalConsumed.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[11px] text-slate-500 uppercase">
                        {mat.unitName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Complete Chronological Execution Ledger */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Cycle Execution History & Traceability Ledger
            </h3>
            <p className="text-[11px] text-slate-500">
              Immutable chronological record of every production cycle run, yields, batch numbers, and approvals
            </p>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="Filter ledger (Run #, cycle, batch, user)..."
              value={ledgerSearch}
              onChange={(e) => setLedgerSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Date Quick Filter Bar for Ledger */}
        <div className="pt-1">
          <DateQuickFilterBar
            value={dateFilter}
            onChange={setDateFilter}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            totalOlderCount={olderHistoryCount}
            onViewOlder={() => setDateFilter("ALL")}
          />
        </div>

        {filteredHistory.length === 0 ? (
          <EmptyState
            title="No Execution Records Found"
            description={
              executionHistory.length === 0
                ? "No production cycle runs have been executed yet."
                : `No production cycle runs match the selected date range (${dateFilter}) or filters.`
            }
            action={
              dateFilter !== "ALL" || statusFilter !== "ALL" || ledgerSearch.trim() ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDateFilter("ALL");
                    setStatusFilter("ALL");
                    setLedgerSearch("");
                  }}
                >
                  Clear Filters & Show All ({executionHistory.length}) Records
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Date / Run</th>
                  <th className="py-2.5 px-3">Cycle Reference</th>
                  {isSuperAdmin && <th className="py-2.5 px-3">Project Facility</th>}
                  <th className="py-2.5 px-3">Output Product</th>
                  <th className="py-2.5 px-3 text-right">Planned</th>
                  <th className="py-2.5 px-3 text-right">Actual</th>
                  <th className="py-2.5 px-3 text-right">Yield %</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Submitted By</th>
                  <th className="py-2.5 px-3">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-900 block font-mono text-[11px]">
                        {item.runNumber}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {new Date(item.submittedAt).toLocaleDateString()} {new Date(item.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] font-semibold text-indigo-700">
                      {item.cycleReference}
                    </td>

                    {isSuperAdmin && (
                      <td className="py-3 px-3 text-slate-700 font-medium">
                        {item.projectName}
                      </td>
                    )}

                    <td className="py-3 px-3 font-medium text-slate-900">
                      {item.outputProductName}
                    </td>

                    <td className="py-3 px-3 text-right text-slate-700 font-mono">
                      {item.plannedOutput ?? "—"}
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">
                      {item.actualOutput ?? "—"}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {item.yieldEfficiency != null ? (
                        <span
                          className={`font-bold font-mono ${
                            item.yieldEfficiency >= 95
                              ? "text-emerald-700"
                              : item.yieldEfficiency >= 80
                                ? "text-blue-700"
                                : "text-amber-700"
                          }`}
                        >
                          {item.yieldEfficiency}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <Badge
                        variant={
                          item.status === "APPROVED"
                            ? "success"
                            : item.status === "PENDING_APPROVAL"
                              ? "warning"
                              : item.status === "REJECTED"
                                ? "danger"
                                : "neutral"
                        }
                      >
                        {item.status === "PENDING_APPROVAL"
                          ? "Waiting Approval"
                          : item.status}
                      </Badge>
                    </td>

                    <td className="py-3 px-3 text-slate-600">
                      {item.submittedBy}
                    </td>

                    <td className="py-3 px-3 text-slate-600">
                      {item.approvedBy ? (
                        <div>
                          <span className="font-medium text-emerald-800 block">
                            {item.approvedBy}
                          </span>
                          {item.approvedAt && (
                            <span className="text-[10px] text-slate-400 block">
                              {new Date(item.approvedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
