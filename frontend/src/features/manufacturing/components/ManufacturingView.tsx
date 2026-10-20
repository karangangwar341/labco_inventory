"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { Input } from "../../../components/ui/Input";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { LoadingState } from "../../../components/feedback/LoadingState";
import { ErrorState } from "../../../components/feedback/ErrorState";
import { manufacturingService } from "../manufacturing.service";
import {
  CreateProductionRunPayload,
  ProductionRun,
  ProductionCycle,
  ReRunCyclePayload,
} from "../manufacturing.types";
import { catalogService } from "../../catalog/catalog.service";
import { administrationService } from "../../administration/administration.service";
import { inventoryService } from "../../inventory/inventory.service";
import { queryKeys } from "../../../lib/query/query-keys";
import { useAuth } from "../../auth/auth.store";
import { CyclesGridView } from "./CyclesGridView";
import { ReRunCycleModal } from "./ReRunCycleModal";
import { ManufacturingAnalyticsView } from "./ManufacturingAnalyticsView";

export interface ManufacturingViewProps {
  clientId?: string;
  hideHeader?: boolean;
}

export function ManufacturingView({ clientId: propClientId, hideHeader }: ManufacturingViewProps = {}) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") as "CYCLES" | "RUNS" | "ANALYTICS" | null;
  const urlStatus = searchParams.get("status");
  const urlRunId = searchParams.get("runId");

  const { role, user } = useAuth();
  const canCreateRuns = role === "CLIENT_ADMIN";
  const isClientAdmin = role === "CLIENT_ADMIN";
  const isSuperAdmin = role === "SUPER_ADMIN";

  // Active top-level tab
  const [activeTab, setActiveTab] = useState<"CYCLES" | "RUNS" | "ANALYTICS">(() => {
    if (urlTab && ["CYCLES", "RUNS", "ANALYTICS"].includes(urlTab)) {
      return urlTab;
    }
    if (urlRunId || urlStatus) {
      return "RUNS";
    }
    return "CYCLES";
  });

  // Selected state
  const [selectedRun, setSelectedRun] = useState<ProductionRun | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRun, setEditingRun] = useState<ProductionRun | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Super Admin client filter for runs & analytics
  const [runsClientId, setRunsClientId] = useState<string>(propClientId || "");

  // Synchronize when propClientId changes
  useEffect(() => {
    if (propClientId) {
      setRunsClientId(propClientId);
      setAnalyticsClientId(propClientId);
    }
  }, [propClientId]);

  // Re-run modal state
  const [reRunModalCycle, setReRunModalCycle] = useState<ProductionCycle | null>(null);

  // Super Admin Rejection modal state
  const [rejectingRunId, setRejectingRunId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");

  // Super Admin client filter for analytics
  const [analyticsClientId, setAnalyticsClientId] = useState<string>("");

  // New Run Form State
  const [yieldProductId, setYieldProductId] = useState("");
  const [yieldUnitId, setYieldUnitId] = useState("");
  const [yieldQty, setYieldQty] = useState(25);
  const [inputLines, setInputLines] = useState([
    { productId: "", unitId: "", quantity: 10 },
  ]);
  const [actualQty, setActualQty] = useState("");
  const [wastage, setWastage] = useState("");
  const [productionReference, setProductionReference] = useState("");
  const [notes, setNotes] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Day-End Continuous Batch Submission State
  const [submittingAfterSave, setSubmittingAfterSave] = useState(false);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [isDayEndModalOpen, setIsDayEndModalOpen] = useState(false);
  const [dayEndBatchNotes, setDayEndBatchNotes] = useState("");

  // Query: Catalog manufacturing options (raw materials, yield products)
  const {
    data: manufacturingOptions,
    error: optionsError,
    refetch: refetchOptions,
  } = useQuery({
    queryKey: queryKeys.catalog.manufacturingOptions(
      user?.clientId ?? undefined,
    ),
    queryFn: () => catalogService.getManufacturingOptions(),
    enabled: canCreateRuns,
    staleTime: 2 * 60 * 1000,
  });

  // Query: Production runs
  const {
    data: runs = [],
    isLoading: isLoadingRuns,
    error: runsError,
    refetch: fetchRuns,
  } = useQuery({
    queryKey: queryKeys.manufacturing.list(runsClientId || 'all', { clientId: runsClientId || undefined }),
    queryFn: async () => {
      const data = await manufacturingService.getProductionRuns({
        clientId: runsClientId || undefined,
      });
      return Array.isArray(data) ? data : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  // Synchronize top-level tab from URL parameters
  useEffect(() => {
    if (urlTab && ["CYCLES", "RUNS", "ANALYTICS"].includes(urlTab)) {
      setActiveTab(urlTab);
    } else if (urlRunId) {
      setActiveTab("RUNS");
    }
  }, [urlTab, urlRunId]);

  // Synchronize status filter from URL parameters
  useEffect(() => {
    if (urlStatus) {
      setStatusFilter(urlStatus);
    }
  }, [urlStatus]);

  // Automatically select and inspect run when runId is in URL
  useEffect(() => {
    if (urlRunId && runs.length > 0) {
      const match = runs.find((r) => r.id === urlRunId);
      if (match) {
        setSelectedRun(match);
      }
    }
  }, [urlRunId, runs]);

  // Query: Production cycles
  const {
    data: cycles = [],
    isLoading: isLoadingCycles,
    refetch: fetchCycles,
  } = useQuery({
    queryKey: queryKeys.manufacturing.cycles(user?.clientId ?? undefined),
    queryFn: async () => {
      const data = await manufacturingService.getProductionCycles();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  // Cached inventory balances to display existing stock without redundant server requests
  const { data: rawBalances = [] } = useQuery({
    queryKey: queryKeys.inventory.balances(user?.id || user?.role),
    queryFn: () => inventoryService.getBalances(),
    staleTime: 5 * 60 * 1000,
  });

  const stockByProductId = useMemo(() => {
    const map = new Map<string, { availableQty: number; usableQty: number; unit?: string }>();
    if (Array.isArray(rawBalances)) {
      for (const b of rawBalances) {
        const existing = map.get(b.productId) || { availableQty: 0, usableQty: 0, unit: b.unit };
        existing.availableQty += Number(b.availableQty || 0);
        existing.usableQty += Number(b.usableQty || 0);
        if (!existing.unit && b.unit) existing.unit = b.unit;
        map.set(b.productId, existing);
      }
    }
    return map;
  }, [rawBalances]);

  // Query: Analytics
  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    refetch: fetchAnalytics,
  } = useQuery({
    queryKey: queryKeys.manufacturing.analytics({
      clientId: analyticsClientId || undefined,
    }),
    queryFn: async () => {
      return manufacturingService.getAnalytics({
        clientId: analyticsClientId || undefined,
      });
    },
    staleTime: 2 * 60 * 1000,
  });

  // Query: Clients for Super Admin filter
  const { data: clients = [] } = useQuery({
    queryKey: ["administration", "clients"],
    queryFn: () => administrationService.getClients(),
    enabled: isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const rawMaterials = manufacturingOptions?.rawMaterials || [];
  const manufacturedProducts = manufacturingOptions?.manufacturedProducts || [];
  const effectiveYieldProductId =
    yieldProductId || manufacturedProducts[0]?.id || "";
  const selectedYieldProduct = manufacturedProducts.find(
    (product) => product.id === effectiveYieldProductId,
  );
  const activeUnits = (product: typeof selectedYieldProduct) =>
    product?.units?.filter((unit) => unit.status !== "SUPERSEDED") || [];
  const yieldUnits = activeUnits(selectedYieldProduct);
  const effectiveYieldUnitId =
    yieldUnitId ||
    yieldUnits.find((unit) => unit.isBaseUnit)?.id ||
    yieldUnits[0]?.id ||
    "";
  const effectiveInputLines = inputLines.map((line, index) => {
    const usedByOtherLines = new Set(
      inputLines
        .filter((_, otherIndex) => otherIndex !== index)
        .map((otherLine) => otherLine.productId)
        .filter(Boolean),
    );
    const productId =
      line.productId ||
      rawMaterials.find((product) => !usedByOtherLines.has(product.id))?.id ||
      "";
    const product = rawMaterials.find((item) => item.id === productId);
    const units = activeUnits(product);
    const unitId =
      line.unitId ||
      units.find((unit) => unit.isBaseUnit)?.id ||
      units[0]?.id ||
      "";
    return { ...line, productId, product, units, unitId };
  });

  // Invalidate all manufacturing queries
  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.manufacturing.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
    ]);
  };

  // Mutation: Create or update production run
  const createMutation = useMutation({
    mutationFn: (payload: CreateProductionRunPayload) =>
      editingRun
        ? manufacturingService.updateProductionRun(editingRun.id, payload)
        : manufacturingService.createProductionRun(payload),
    onSuccess: async (savedRun) => {
      setIsModalOpen(false);
      setEditingRun(null);
      setActionSuccess(
        editingRun
          ? "Draft updated. No inventory was changed."
          : "Draft saved. No inventory was changed until approved.",
      );
      await invalidateAll();
      const refreshed = await fetchRuns();
      setSelectedRun(
        refreshed.data?.find((run) => run.id === savedRun.id) || null,
      );
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to save production draft",
      );
    },
  });

  // Mutation: Submit for approval
  const submitMutation = useMutation({
    mutationFn: (id: string) => manufacturingService.submitProductionRun(id),
    onSuccess: async (updated) => {
      setSelectedRun((current) =>
        current ? { ...current, status: updated.status } : current,
      );
      setActionSuccess(
        "Production run submitted for Super Admin review. Inventory changes only after approval.",
      );
      await invalidateAll();
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: unknown) =>
      setErrorMsg(
        err instanceof Error ? err.message : "Could not submit production run",
      ),
  });

  // Mutation: Delete draft
  const deleteMutation = useMutation({
    mutationFn: (id: string) => manufacturingService.deleteProductionRun(id),
    onSuccess: async () => {
      setSelectedRun(null);
      setActionSuccess("Production draft deleted. Inventory was not changed.");
      await invalidateAll();
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) =>
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Could not delete production draft",
      ),
  });

  // Mutation: Re-run cycle
  const reRunMutation = useMutation({
    mutationFn: async ({
      runId,
      payload,
    }: {
      runId: string;
      payload?: ReRunCyclePayload;
    }) => {
      return manufacturingService.reRunCycle(runId, payload);
    },
    onSuccess: async (newRun) => {
      setReRunModalCycle(null);
      setActionSuccess(
        `New production run created for cycle: RUN-${newRun.id.substring(0, 8).toUpperCase()}. Formula recipe intact.`,
      );
      await invalidateAll();
      setSelectedRun(newRun);
      setActiveTab("RUNS");
      setTimeout(() => setActionSuccess(null), 6000);
    },
    onError: (err: unknown) => {
      setErrorMsg(
        err instanceof Error ? err.message : "Could not re-run production cycle",
      );
    },
  });

  // Mutation: Super Admin Approve
  const approveMutation = useMutation({
    mutationFn: (id: string) => manufacturingService.approveProductionRun(id),
    onSuccess: async (approved) => {
      setSelectedRun((current) =>
        current ? { ...current, status: approved.status } : current,
      );
      setActionSuccess(
        "Production run approved! Raw materials consumed and finished goods added to inventory.",
      );
      await invalidateAll();
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: unknown) =>
      setErrorMsg(
        err instanceof Error ? err.message : "Could not approve production run",
      ),
  });

  // Mutation: Super Admin Reject
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      manufacturingService.rejectProductionRun(id, reason),
    onSuccess: async () => {
      setRejectingRunId(null);
      setRejectionReason("");
      setActionSuccess("Production run rejected. No inventory was changed.");
      await invalidateAll();
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: unknown) =>
      setErrorMsg(
        err instanceof Error ? err.message : "Could not reject production run",
      ),
  });

  // Mutation: Submit Day-End Batch
  const batchSubmitMutation = useMutation({
    mutationFn: ({ runIds, notes }: { runIds: string[]; notes?: string }) =>
      manufacturingService.submitProductionRunBatch(runIds, notes),
    onSuccess: async (res) => {
      setIsDayEndModalOpen(false);
      setSelectedDraftIds([]);
      setActionSuccess(
        `Successfully submitted ${res.count} continuous production run(s) for Day-End Super Admin approval!`,
      );
      await invalidateAll();
      setTimeout(() => setActionSuccess(null), 6000);
    },
    onError: (err: unknown) => {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Could not submit production runs for day-end approval",
      );
    },
  });

  // Mutation: Super Admin Batch Approve
  const batchApproveMutation = useMutation({
    mutationFn: (runIds: string[]) =>
      manufacturingService.approveProductionRunBatch(
        runIds,
        "Approved Day-End batch",
      ),
    onSuccess: async (res) => {
      setActionSuccess(
        `Approved ${res.count} continuous production runs! Raw materials consumed and finished goods updated.`,
      );
      await invalidateAll();
      setTimeout(() => setActionSuccess(null), 6000);
    },
    onError: (err: unknown) => {
      setErrorMsg(
        err instanceof Error ? err.message : "Could not approve day-end batch",
      );
    },
  });

  // Mutation: Scan low stock cycles
  const scanMutation = useMutation({
    mutationFn: () => manufacturingService.checkLowStockCycles(),
    onSuccess: (data) => {
      setActionSuccess(
        `Scanned ${data.checkedCyclesCount} cycles. ${data.alertedCyclesCount} low-stock replenishment alert notifications dispatched.`,
      );
      void invalidateAll();
      setTimeout(() => setActionSuccess(null), 6000);
    },
    onError: (err: unknown) =>
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to scan low-stock cycles",
      ),
  });

  const openNewRun = () => {
    setEditingRun(null);
    setYieldProductId("");
    setYieldUnitId("");
    setYieldQty(25);
    setInputLines([{ productId: "", unitId: "", quantity: 10 }]);
    setActualQty("");
    setWastage("");
    setProductionReference("");
    setNotes("");
    setBatchNumber("");
    setExpiryDate("");
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const openDraft = (run: ProductionRun) => {
    setEditingRun(run);
    setYieldProductId(run.outputLines?.[0]?.productId || "");
    setYieldUnitId(run.outputLines?.[0]?.unitId || "");
    setYieldQty(Number(run.plannedOutput ?? run.plannedQuantity ?? 0));
    setInputLines(
      (run.inputLines || []).map((line) => ({
        productId: line.productId,
        unitId: line.unitId || "",
        quantity: Number(line.quantity),
      })),
    );
    setActualQty(run.actualOutput == null ? "" : String(run.actualOutput));
    setWastage(run.wastage == null ? "" : String(run.wastage));
    setProductionReference(run.productionReference || "");
    setNotes(run.notes || "");
    setBatchNumber(run.outputLines?.[0]?.batchNumber || "");
    setExpiryDate(run.outputLines?.[0]?.expiryDate?.slice(0, 10) || "");
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSaveDraft = (andSubmit = false) => {
    setErrorMsg(null);
    if (
      !effectiveYieldProductId ||
      !effectiveYieldUnitId ||
      effectiveInputLines.length === 0 ||
      (actualQty !== "" && Number(actualQty) <= 0) ||
      (wastage !== "" && Number(wastage) < 0) ||
      effectiveInputLines.some(
        (line) =>
          !line.productId ||
          !line.unitId ||
          !line.quantity ||
          line.quantity <= 0,
      )
    ) {
      setErrorMsg(
        "Choose the output product and unit, and complete each raw material, quantity, and unit.",
      );
      return;
    }

    const effectiveActualOutput = actualQty
      ? Number(actualQty)
      : andSubmit
        ? Number(yieldQty)
        : undefined;

    setSubmittingAfterSave(andSubmit);
    createMutation.mutate(
      {
        mode: "LINKED",
        productionReference: productionReference.trim() || undefined,
        actualOutput: effectiveActualOutput,
        wastage: wastage ? Number(wastage) : undefined,
        notes: notes.trim() || undefined,
        plannedOutput: Number(yieldQty),
        inputs: effectiveInputLines.map((line) => ({
          productId: line.productId,
          unitId: line.unitId,
          quantity: Number(line.quantity),
        })),
        outputs: [
          {
            productId: effectiveYieldProductId,
            unitId: effectiveYieldUnitId,
            quantity: effectiveActualOutput || Number(yieldQty),
            batchNumber: batchNumber.trim() || undefined,
            expiryDate: expiryDate || undefined,
          },
        ],
      },
      {
        onSuccess: async (savedRun) => {
          if (andSubmit) {
            submitMutation.mutate(savedRun.id);
          }
        },
        onSettled: () => {
          setSubmittingAfterSave(false);
        },
      },
    );
  };

  const currentError =
    errorMsg ||
    (runsError instanceof Error ? runsError.message : null) ||
    (optionsError instanceof Error ? optionsError.message : null);

  const draftRuns = useMemo(() => {
    return runs.filter((r) => r.status === "DRAFT");
  }, [runs]);

  const pendingRuns = useMemo(() => {
    return runs.filter((r) => r.status === "PENDING_APPROVAL");
  }, [runs]);

  const visibleRuns = useMemo(() => {
    return runs.filter((run) => {
      if (statusFilter !== "ALL" && run.status !== statusFilter) return false;
      if (runsClientId && run.clientId !== runsClientId && run.client?.id !== runsClientId) return false;
      return true;
    });
  }, [runs, statusFilter, runsClientId]);

  // Trigger re-run modal for a cycle
  const handleReRunFromCycle = (cycle: ProductionCycle) => {
    setReRunModalCycle(cycle);
  };

  // Trigger re-run from run ID (from analytics ledger or run card)
  const handleReRunFromRunId = (runId: string) => {
    const targetRun = runs.find((r) => r.id === runId);
    if (!targetRun) return;

    // Find corresponding cycle or construct fallback
    const matchingCycle = cycles.find((c) => c.latestRunId === runId);
    if (matchingCycle) {
      setReRunModalCycle(matchingCycle);
    } else {
      reRunMutation.mutate({ runId });
    }
  };

  return (
    <div className="space-y-5">
      {!hideHeader ? (
        <PageHeader
          title="Manufacturing & Production Cycles"
          description="Convert bulk raw ingredients into finished assay kits and controls under strict BOM formulations. Re-run cycles instantly when stock is depleted."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => scanMutation.mutate()}
                isLoading={scanMutation.isPending}
              >
                Scan Stock & Alerts
              </Button>
              <Link href="/departments">
                <Button variant="secondary">Department Issues</Button>
              </Link>
              {canCreateRuns && (
                <Button variant="primary" onClick={openNewRun}>
                  + New Production Formula
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Client Manufacturing Runs & Cycles</h3>
            <p className="text-xs text-slate-500">Manage formulations, batch execution runs, and cycle replenishment alerts for this client.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => scanMutation.mutate()}
              isLoading={scanMutation.isPending}
            >
              Scan Stock & Alerts
            </Button>
            {canCreateRuns && (
              <Button variant="primary" size="sm" onClick={openNewRun}>
                + New Production Formula
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between shadow-xs">
          <span className="font-medium">✓ {actionSuccess}</span>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Message Banner */}
      {currentError && (
        <ErrorState
          message={currentError}
          onRetry={() => {
            setErrorMsg(null);
            void fetchRuns();
            void fetchCycles();
            if (canCreateRuns) void refetchOptions();
          }}
        />
      )}

      {/* Navigation Segmented Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-2 rounded-t-xl shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("CYCLES")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all ${
            activeTab === "CYCLES"
              ? "border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <span>Production Cycles ({cycles.length})</span>
          {cycles.some((c) => c.isLowStock || c.isOutOfStock) && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {cycles.filter((c) => c.isLowStock || c.isOutOfStock).length} alert
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("RUNS")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all ${
            activeTab === "RUNS"
              ? "border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <span>Active & Past Runs ({runs.length})</span>
          {runs.filter((r) => r.status === "PENDING_APPROVAL").length > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {runs.filter((r) => r.status === "PENDING_APPROVAL").length} review
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ANALYTICS")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all ${
            activeTab === "ANALYTICS"
              ? "border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <span>Analytics & Execution Ledger</span>
          <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-700">
            Reports
          </span>
        </button>
      </div>

      {/* TAB 1: PRODUCTION CYCLES & RE-RUN */}
      {activeTab === "CYCLES" && (
        <CyclesGridView
          cycles={cycles}
          isLoading={isLoadingCycles}
          canCreateRuns={canCreateRuns}
          onReRun={handleReRunFromCycle}
          onNewRun={openNewRun}
          onScanLowStock={() => scanMutation.mutate()}
          isScanning={scanMutation.isPending}
        />
      )}

      {/* TAB 2: ACTIVE & HISTORICAL RUNS */}
      {activeTab === "RUNS" && (
        <div className="space-y-4">
          {/* Quick status counters */}
          <section
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            aria-label="Production run summary"
          >
            {[
              [
                "Drafts",
                runs.filter((run) => run.status === "DRAFT").length,
                "DRAFT",
              ],
              [
                "Waiting approval",
                runs.filter((run) => run.status === "PENDING_APPROVAL").length,
                "PENDING_APPROVAL",
              ],
              [
                "Approved / Active",
                runs.filter((run) => run.status === "APPROVED").length,
                "APPROVED",
              ],
              [
                "Rejected",
                runs.filter((run) => run.status === "REJECTED").length,
                "REJECTED",
              ],
            ].map(([label, count, status]) => (
              <button
                key={status}
                type="button"
                onClick={() =>
                  setStatusFilter(
                    statusFilter === status ? "ALL" : String(status),
                  )
                }
                className={`rounded-xl border bg-white p-3.5 text-left shadow-xs transition-all ${
                  statusFilter === status
                    ? "border-indigo-600 ring-1 ring-indigo-600"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="block text-xs text-slate-500">{label}</span>
                <span className="mt-1 block text-2xl font-bold text-slate-900">
                  {count}
                </span>
              </button>
            ))}
          </section>

          {/* Status filter pills & Super Admin client selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {["ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"].map(
                (status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      statusFilter === status
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold shadow-2xs"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {status === "ALL"
                      ? "All Runs"
                      : status === "PENDING_APPROVAL"
                        ? "Waiting Approval"
                        : status
                            .replaceAll("_", " ")
                            .toLowerCase()
                            .replace(/^\w/, (letter) => letter.toUpperCase())}
                  </button>
                ),
              )}
            </div>

            {isSuperAdmin && !propClientId && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Filter Client:</span>
                <select
                  value={runsClientId}
                  onChange={(e) => setRunsClientId(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                >
                  <option value="">All Clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {isLoadingRuns ? (
            <LoadingState message="Loading client production runs..." />
          ) : visibleRuns.length === 0 ? (
            <EmptyState
              title={
                runs.length === 0
                  ? "No production runs yet"
                  : "No runs in this status"
              }
              description={
                runs.length === 0
                  ? "Start a production run to formulate finished products from bulk raw materials."
                  : "Choose another status to inspect more runs."
              }
              action={
                canCreateRuns ? (
                  <Button variant="primary" onClick={openNewRun}>
                    + Start First Production Run
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Day-End Continuous Production Runs Banner for Client Admin */}
              {isClientAdmin && draftRuns.length > 0 && (
                <div className="mb-4 bg-gradient-to-r from-indigo-50 via-sky-50 to-emerald-50 border border-indigo-200 rounded-xl p-4 shadow-xs">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-indigo-950 flex items-center gap-1.5">
                          🏭 Continuous Daily Production Batch ({draftRuns.length} draft cycles)
                        </span>
                        <Badge variant="warning">
                          {draftRuns.length} draft {draftRuns.length === 1 ? 'cycle' : 'cycles'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                        Continuous production happened throughout the day? Instead of submitting each run one by one, bundle all today&apos;s continuous runs for various products into a single Day-End batch for consolidated Super Admin approval.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-stretch md:self-auto shrink-0">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setSelectedDraftIds(draftRuns.map((r) => r.id));
                          setDayEndBatchNotes(
                            `Continuous daily production runs (${new Date().toLocaleDateString()})`,
                          );
                          setIsDayEndModalOpen(true);
                        }}
                      >
                        🚀 Submit All ({draftRuns.length}) for Day-End Approval
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Super Admin Day-End Batch Approval Banner */}
              {isSuperAdmin && pendingRuns.length > 1 && (
                <div className="mb-4 bg-gradient-to-r from-amber-50 via-orange-50 to-indigo-50 border border-amber-200 rounded-xl p-4 shadow-xs">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                          ⚖️ Pending Continuous Production Runs ({pendingRuns.length} runs)
                        </span>
                        <Badge variant="warning">Awaiting Approval</Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                        Multiple continuous diagnostic production cycles were submitted for review. Approve all {pendingRuns.length} runs in one atomic batch.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={batchApproveMutation.isPending}
                        onClick={() => {
                          batchApproveMutation.mutate(pendingRuns.map((r) => r.id));
                        }}
                      >
                        ✓ Approve All ({pendingRuns.length}) Runs
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Runs List */}
              <div className="lg:col-span-2 space-y-3">
                {visibleRuns.map((r) => {
                  const isSelected = selectedRun?.id === r.id;
                  const isApproved = r.status === "APPROVED";
                  const isPending = r.status === "PENDING_APPROVAL";

                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRun(r)}
                      className={`p-4 rounded-xl border bg-white cursor-pointer transition-all shadow-xs ${
                        isSelected
                          ? "border-indigo-600 ring-1 ring-indigo-600"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {r.yieldProductName || "Production run"}
                            </span>
                            <Badge
                              variant={
                                isApproved
                                  ? "success"
                                  : isPending
                                    ? "warning"
                                    : r.status === "REJECTED"
                                      ? "danger"
                                      : "neutral"
                              }
                            >
                              {r.status === "PENDING_APPROVAL"
                                ? "Waiting approval"
                                : r.status === "DRAFT"
                                  ? "Draft"
                                  : r.status === "APPROVED"
                                    ? "Approved"
                                    : r.status === "REJECTED"
                                      ? "Rejected"
                                      : r.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {r.productionReference ||
                              `Created ${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "recently"}`}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-semibold text-emerald-800">
                            Planned: {r.plannedQuantity} units
                          </span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {r.createdAt
                              ? new Date(r.createdAt).toLocaleDateString()
                              : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          BOM Ingredients: {r.inputLines?.length || 0} line items
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-indigo-600 font-semibold">
                            View details →
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Run Details Panel */}
              <div>
                {selectedRun ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
                    <div className="border-b border-slate-200 pb-3 flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                          Run Details ({selectedRun.id.substring(0, 8).toUpperCase()})
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                          {selectedRun.yieldProductName || "Production run"}
                        </h3>
                        {(selectedRun.productionReference || !canCreateRuns) && (
                          <p className="text-xs text-slate-500">
                            Ref: {selectedRun.productionReference || selectedRun.clientName}
                          </p>
                        )}
                      </div>

                      {/* Instant Re-Run Cycle CTA */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleReRunFromRunId(selectedRun.id)}
                      >
                        ⚡ Re-Run
                      </Button>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-start py-1 border-b border-slate-100">
                        <span className="text-slate-500">Target Output</span>
                        <div className="text-right">
                          <span className="font-semibold text-emerald-800 block">
                            {selectedRun.plannedQuantity}{" "}
                            {selectedRun.yieldProductName || "Units"}
                          </span>
                          {selectedRun.yieldProductId && (() => {
                            const stock = stockByProductId.get(selectedRun.yieldProductId);
                            const avail = stock?.availableQty ?? 0;
                            return (
                              <span className="text-[11px] text-slate-500">
                                Existing warehouse stock:{" "}
                                <strong className={avail > 0 ? "text-emerald-700" : "text-slate-600"}>
                                  {avail.toLocaleString()} {stock?.unit || "units"}
                                </strong>
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Status</span>
                        <Badge
                          variant={
                            selectedRun.status === "APPROVED"
                              ? "success"
                              : selectedRun.status === "REJECTED"
                                ? "danger"
                                : selectedRun.status === "DRAFT"
                                  ? "neutral"
                                  : "warning"
                          }
                        >
                          {selectedRun.status === "PENDING_APPROVAL"
                            ? "Waiting Approval"
                            : selectedRun.status.replaceAll("_", " ")}
                        </Badge>
                      </div>

                      {selectedRun.actualOutput != null && (
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Actual output</span>
                          <span className="font-semibold text-slate-900">
                            {selectedRun.actualOutput}
                          </span>
                        </div>
                      )}

                      {selectedRun.wastage != null && (
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Wastage</span>
                          <span className="font-semibold text-slate-700">
                            {selectedRun.wastage}
                          </span>
                        </div>
                      )}

                      {selectedRun.notes && (
                        <div className="py-1 border-b border-slate-100">
                          <span className="text-slate-500 block">Notes:</span>
                          <p className="text-slate-700 mt-0.5 italic">
                            {selectedRun.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* BOM Deductions */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-slate-800">
                          Bill of Materials (BOM Deductions)
                        </h4>
                        <span className="text-[10px] text-slate-500">Warehouse Stock vs Required</span>
                      </div>
                      <div className="space-y-1.5">
                        {selectedRun.inputLines && selectedRun.inputLines.length > 0 ? (
                          selectedRun.inputLines.map((inp, idx: number) => {
                            const rawStock = stockByProductId.get(inp.productId);
                            const avail = rawStock?.availableQty ?? 0;
                            const reqQty = Number(inp.quantity || 0);
                            const isSufficient = avail >= reqQty;
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                              >
                                <div>
                                  <span className="text-slate-900 font-medium block">
                                    {inp.productName || "Raw Material"}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    Existing stock:{" "}
                                    <strong className={avail > 0 ? "text-slate-800" : "text-rose-600"}>
                                      {avail.toLocaleString()} {inp.unit || rawStock?.unit || "units"}
                                    </strong>
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="font-semibold text-rose-700 block">
                                    -{inp.quantity} {inp.unit || "units"}
                                  </span>
                                  <span
                                    className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                      isSufficient
                                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                        : "bg-rose-100 text-rose-800 border border-rose-200"
                                    }`}
                                  >
                                    {isSufficient ? "Stock OK" : "Low Stock"}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-slate-500">
                            Standard formulation BOM.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions: Client Admin Draft Controls */}
                    {canCreateRuns && selectedRun.status === "DRAFT" && (
                      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
                        <Button
                          variant="danger"
                          size="sm"
                          isLoading={deleteMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this production draft? It has not changed inventory and cannot be restored.",
                              )
                            ) {
                              setErrorMsg(null);
                              deleteMutation.mutate(selectedRun.id);
                            }
                          }}
                        >
                          Delete draft
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openDraft(selectedRun)}
                        >
                          Edit draft
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          isLoading={submitMutation.isPending}
                          onClick={() => {
                            setErrorMsg(null);
                            submitMutation.mutate(selectedRun.id);
                          }}
                        >
                          Submit for approval
                        </Button>
                      </div>
                    )}

                    {/* Actions: Super Admin Approval Controls */}
                    {isSuperAdmin && selectedRun.status === "PENDING_APPROVAL" && (
                      <div className="border-t border-slate-200 pt-3 space-y-2">
                        <span className="text-[11px] font-bold text-amber-800 block">
                          Super Admin Approval Required:
                        </span>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setRejectingRunId(selectedRun.id);
                              setRejectionReason("");
                            }}
                          >
                            Reject Run
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            isLoading={approveMutation.isPending}
                            onClick={() => {
                              approveMutation.mutate(selectedRun.id);
                            }}
                          >
                            ✓ Approve & Post Inventory
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                    Select a production run from the list to view its bill of
                    materials and yield specifications.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        </div>
      )}

      {/* TAB 3: ANALYTICS & EXECUTION LEDGER */}
      {activeTab === "ANALYTICS" && (
        <ManufacturingAnalyticsView
          analytics={analytics}
          isLoading={isLoadingAnalytics}
          role={role}
          clients={clients}
          selectedClientId={analyticsClientId}
          onClientChange={(id) => setAnalyticsClientId(id)}
          onReRunCycleId={handleReRunFromRunId}
          onRefresh={() => {
            void fetchAnalytics();
            void fetchCycles();
          }}
        />
      )}

      {/* RE-RUN CYCLE MODAL */}
      <ReRunCycleModal
        isOpen={Boolean(reRunModalCycle)}
        onClose={() => setReRunModalCycle(null)}
        cycle={reRunModalCycle}
        isSubmitting={reRunMutation.isPending}
        stockByProductId={stockByProductId}
        onSubmit={async (payload) => {
          if (!reRunModalCycle) return;
          await reRunMutation.mutateAsync({
            runId: reRunModalCycle.latestRunId,
            payload,
          });
        }}
      />

      {/* SUPER ADMIN REJECTION REASON MODAL */}
      <Modal
        isOpen={Boolean(rejectingRunId)}
        onClose={() => setRejectingRunId(null)}
        title="Reject Production Run"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            Please enter a reason for rejecting this production run. The client will be notified and no inventory will be modified.
          </p>
          <Input
            label="Rejection Reason"
            type="text"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="e.g. Formula revision pending, batch purity check failed"
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setRejectingRunId(null)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!rejectionReason.trim()}
              isLoading={rejectMutation.isPending}
              onClick={() => {
                if (rejectingRunId && rejectionReason.trim()) {
                  rejectMutation.mutate({
                    id: rejectingRunId,
                    reason: rejectionReason.trim(),
                  });
                }
              }}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* NEW / EDIT PRODUCTION RUN MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRun ? "Edit production draft" : "Start a production run"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveDraft(false);
          }}
          className="space-y-3.5 text-xs"
        >
          <p className="rounded-md bg-slate-100 p-2 text-slate-600">
            Saving keeps this as a draft. No stock changes until Super Admin
            approval.
          </p>

          <div>
            <label className="block font-medium text-slate-900 mb-1">
              Manufactured product
            </label>
            <select
              value={effectiveYieldProductId}
              onChange={(e) => {
                setYieldProductId(e.target.value);
                setYieldUnitId("");
                setBatchNumber("");
                setExpiryDate("");
              }}
              required
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            >
              {!manufacturedProducts.length && (
                <option value="">
                  No approved manufactured products in your catalog
                </option>
              )}
              {manufacturedProducts.map((prod) => (
                <option key={prod.id} value={prod.id}>
                  {prod.name}
                </option>
              ))}
            </select>
            {effectiveYieldProductId && (() => {
              const stock = stockByProductId.get(effectiveYieldProductId);
              const avail = stock?.availableQty ?? 0;
              const unitName =
                yieldUnits.find((u) => u.id === effectiveYieldUnitId)?.unitName ||
                selectedYieldProduct?.baseUnit ||
                stock?.unit ||
                "units";
              return (
                <div className="mt-1.5 flex items-center justify-between text-[11px] bg-slate-50 border border-slate-200 rounded px-2.5 py-1">
                  <span className="text-slate-600">Existing finished stock in warehouse:</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                      avail > 0
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : "bg-amber-100 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {avail.toLocaleString()} {unitName} currently available
                  </span>
                </div>
              );
            })()}
          </div>

          {yieldUnits.length > 0 && (
            <div>
              <label className="block font-medium text-slate-900 mb-1">
                Output unit
              </label>
              <select
                value={effectiveYieldUnitId}
                onChange={(event) => setYieldUnitId(event.target.value)}
                required
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {yieldUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.unitName}
                    {unit.isBaseUnit ? " (base unit)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Input
            label="Planned output quantity"
            type="number"
            value={yieldQty}
            onChange={(e) => setYieldQty(Number(e.target.value))}
            required
            min={1}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Actual output quantity (required before submit)"
              type="number"
              value={actualQty}
              onChange={(event) => setActualQty(event.target.value)}
              min={0.01}
              step="any"
            />
            <Input
              label="Wastage (optional)"
              type="number"
              value={wastage}
              onChange={(event) => setWastage(event.target.value)}
              min={0}
              step="any"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Production reference / Cycle code"
              value={productionReference}
              onChange={(event) => setProductionReference(event.target.value)}
              placeholder="e.g. CYCLE-ASSAY-01"
            />
            <Input
              label="Batch number"
              value={batchNumber}
              onChange={(event) => setBatchNumber(event.target.value)}
              placeholder="e.g. BATCH-20261017-001"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Expiry date"
              type="date"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
            />
            <Input
              label="Notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Formulation details or run instructions"
            />
          </div>

          {/* Input lines */}
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-900">
                Raw materials (BOM)
              </label>
              {effectiveInputLines.length < rawMaterials.length && (
                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-700 hover:underline"
                  onClick={() =>
                    setInputLines((current) => [
                      ...current,
                      { productId: "", unitId: "", quantity: 5 },
                    ])
                  }
                >
                  + Add another raw material
                </button>
              )}
            </div>

            {effectiveInputLines.map((line, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-2"
              >
                <div>
                  <label className="mb-1 block font-medium text-slate-900">
                    Raw material {index + 1}
                  </label>
                  <select
                    value={line.productId}
                    onChange={(event) => {
                      const productId = event.target.value;
                      setInputLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, productId, unitId: "" }
                            : item,
                        ),
                      );
                    }}
                    required
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Choose a raw material</option>
                    {rawMaterials.map((product) => (
                      <option
                        key={product.id}
                        value={product.id}
                        disabled={effectiveInputLines.some(
                          (other, otherIndex) =>
                            otherIndex !== index &&
                            other.productId === product.id,
                        )}
                      >
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Quantity"
                    type="number"
                    value={line.quantity}
                    onChange={(event) =>
                      setInputLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, quantity: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    required
                    min={line.product?.quantityPrecision === 0 ? 1 : 0.01}
                    step={line.product?.quantityPrecision === 0 ? 1 : "any"}
                  />
                  <div>
                    <label className="mb-1 block font-medium text-slate-900">
                      Unit
                    </label>
                    <select
                      value={line.unitId}
                      onChange={(event) =>
                        setInputLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, unitId: event.target.value }
                              : item,
                          ),
                        )
                      }
                      required
                      disabled={!line.units.length}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
                    >
                      {!line.units.length && (
                        <option value="">Choose a material first</option>
                      )}
                      {line.units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.unitName}
                          {unit.isBaseUnit ? " (base)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {line.productId && (() => {
                  const rawStock = stockByProductId.get(line.productId);
                  const avail = rawStock?.availableQty ?? 0;
                  const reqQty = Number(line.quantity || 0);
                  const isSufficient = avail >= reqQty;
                  const unitName =
                    line.units.find((u) => u.id === line.unitId)?.unitName ||
                    line.product?.baseUnit ||
                    rawStock?.unit ||
                    "units";
                  return (
                    <div className="sm:col-span-2 flex items-center justify-between text-[11px] bg-white border border-slate-200 rounded px-2.5 py-1.5 mt-0.5">
                      <span className="text-slate-600">Existing raw material stock:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800">
                          {avail.toLocaleString()} {unitName}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isSufficient
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : "bg-rose-100 text-rose-800 border border-rose-200"
                          }`}
                        >
                          {isSufficient
                            ? "Sufficient"
                            : `Short by ${(reqQty - avail).toFixed(1)}`}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {effectiveInputLines.length > 1 && (
                  <div className="sm:col-span-2 sm:text-right">
                    <button
                      type="button"
                      className="text-[11px] font-medium text-rose-700 hover:underline"
                      onClick={() =>
                        setInputLines((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Remove material
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pt-2 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              type="button"
              isLoading={createMutation.isPending && !submittingAfterSave}
              onClick={() => handleSaveDraft(false)}
            >
              Save draft
            </Button>
            <Button
              variant="primary"
              type="button"
              isLoading={
                (createMutation.isPending && submittingAfterSave) ||
                submitMutation.isPending
              }
              onClick={() => handleSaveDraft(true)}
            >
              Save &amp; Submit for Approval
            </Button>
          </div>
        </form>
      </Modal>

      {/* DAY-END BATCH SUBMISSION MODAL */}
      <Modal
        isOpen={isDayEndModalOpen}
        onClose={() => setIsDayEndModalOpen(false)}
        title="Submit Continuous Runs for Day-End Single Approval"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl">
            <p className="text-indigo-900 font-medium">
              Bundle all continuous diagnostic cycles completed today into a single batch. Super Admin can review all runs and approve them together with one single decision.
            </p>
          </div>

          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="font-bold text-slate-800">
              Select Production Cycles ({selectedDraftIds.length} of {draftRuns.length} selected)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                onClick={() => setSelectedDraftIds(draftRuns.map((r) => r.id))}
              >
                Select all
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-700"
                onClick={() => setSelectedDraftIds([])}
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {draftRuns.map((r) => {
              const isChecked = selectedDraftIds.includes(r.id);
              return (
                <label
                  key={r.id}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                    isChecked
                      ? "border-indigo-400 bg-indigo-50/40"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDraftIds((prev) => [...prev, r.id]);
                      } else {
                        setSelectedDraftIds((prev) => prev.filter((id) => id !== r.id));
                      }
                    }}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 truncate">
                        {r.yieldProductName || "Production run"}
                      </span>
                      <span className="font-bold text-emerald-800 shrink-0">
                        Planned: {r.plannedQuantity} units
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5">
                      <span>Ref: {r.productionReference || "Cycle"}</span>
                      <span>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "Today"}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div>
            <label className="block text-slate-600 font-semibold mb-1">
              Day-End Batch Reference / Notes (Optional)
            </label>
            <input
              type="text"
              value={dayEndBatchNotes}
              onChange={(e) => setDayEndBatchNotes(e.target.value)}
              placeholder="e.g., Daily continuous diagnostic runs - 20 Oct 2026"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsDayEndModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={selectedDraftIds.length === 0}
              isLoading={batchSubmitMutation.isPending}
              onClick={() => {
                batchSubmitMutation.mutate({
                  runIds: selectedDraftIds,
                  notes: dayEndBatchNotes.trim() || undefined,
                });
              }}
            >
              🚀 Submit {selectedDraftIds.length} Run{selectedDraftIds.length === 1 ? "" : "s"} for Approval
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ManufacturingView;
