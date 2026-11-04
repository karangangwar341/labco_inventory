"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { administrationService } from "../administration.service";
import { reportsService } from "@/features/reports/reports.service";
import { catalogService } from "@/features/catalog/catalog.service";
import type { CatalogProduct } from "@/features/catalog/catalog.types";
import { BulkCatalogModal } from "@/features/catalog/components/BulkCatalogModal";
import { CloneCatalogModal } from "@/features/catalog/components/CloneCatalogModal";
import { ManufacturingView } from "@/features/manufacturing/components/ManufacturingView";
import { StaffManagementView } from "@/features/staff/components/StaffManagementView";
import {
  DateQuickFilterBar,
  DateQuickFilter,
  isDateInRange,
  getDateRangeFromFilter,
} from "@/components/data-display/DateQuickFilterBar";

type ReportRow = Record<string, unknown>;
type ReportResponse = { data: ReportRow[]; rowCount: number };

type IndentItem = {
  product: string;
  requestedQuantity: number;
  quantity: number;
  unit: string;
  notes?: string;
  status?: string;
};

type IndentGroupType = {
  indentKey: string;
  indentNumber: string;
  department: string;
  date: string;
  items: IndentItem[];
  totalRequested: number;
  totalProvided: number;
  fulfillmentRate: number;
  isFullyFulfilled: boolean;
};

type SubTab = "OVERVIEW" | "MANUFACTURING" | "STAFF" | "DEPARTMENTS" | "LEDGER";

const getText = (row: ReportRow, key: string, fallback = "-") => {
  const value = row[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
};
const getNumber = (row: ReportRow, key: string) => Number(row[key] ?? 0) || 0;

export function ProjectOperationsOverview({ projectId: propProjectId }: { projectId?: string }) {
  const routeParams = useParams<{ projectId?: string }>();
  const projectId = propProjectId || routeParams?.projectId || "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab")?.toUpperCase();
  const [activeTab, setActiveTab] = useState<SubTab>(
    tabParam === "MANUFACTURING" ||
      tabParam === "STAFF" ||
      tabParam === "DEPARTMENTS" ||
      tabParam === "LEDGER"
      ? tabParam
      : "OVERVIEW",
  );

  useEffect(() => {
    if (
      tabParam &&
      ["OVERVIEW", "MANUFACTURING", "STAFF", "DEPARTMENTS", "LEDGER"].includes(
        tabParam,
      )
    ) {
      setActiveTab(tabParam as SubTab);
    }
  }, [tabParam]);

  const handleTabChange = (tab: SubTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Date Filters for DEPARTMENTS and LEDGER tabs (default to TODAY)
  const [deptDateFilter, setDeptDateFilter] = useState<DateQuickFilter>("TODAY");
  const [deptCustomStart, setDeptCustomStart] = useState("");
  const [deptCustomEnd, setDeptCustomEnd] = useState("");
  const [expandedIndents, setExpandedIndents] = useState<Record<string, boolean>>({});
  const [showBulkCatalogModal, setShowBulkCatalogModal] = useState(false);
  const [showCloneCatalogModal, setShowCloneCatalogModal] = useState(false);

  const [ledgerDateFilter, setLedgerDateFilter] = useState<DateQuickFilter>("TODAY");
  const [ledgerCustomStart, setLedgerCustomStart] = useState("");
  const [ledgerCustomEnd, setLedgerCustomEnd] = useState("");

  const { startDate: ledgerStartDate, endDate: ledgerEndDate } = useMemo(
    () => getDateRangeFromFilter(ledgerDateFilter, ledgerCustomStart, ledgerCustomEnd),
    [ledgerDateFilter, ledgerCustomStart, ledgerCustomEnd],
  );
  const { startDate: deptStartDate, endDate: deptEndDate } = useMemo(
    () => getDateRangeFromFilter(deptDateFilter, deptCustomStart, deptCustomEnd),
    [deptDateFilter, deptCustomStart, deptCustomEnd],
  );

  const toArray = (res: any): ReportRow[] => {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.data)) return res.data;
    return [];
  };

  const overviewQuery = useQuery({
    queryKey: ["administration", "project-overview", projectId, { deptStartDate, deptEndDate, ledgerStartDate, ledgerEndDate }],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const [projectRes, stockRes, departmentActivityRes, productionRes, ledgerRes, catalogRes] =
        await Promise.all([
          administrationService.getProject(projectId).catch(() => ({ id: projectId, name: "Project", status: "ACTIVE" })),
          reportsService.generateReport<any>("STOCK_BALANCE", {
            projectId,
          }).catch(() => ({ data: [], rowCount: 0 })),
          reportsService.generateReport<any>("PROJECT_CONSUMPTION", {
            projectId,
            startDate: deptStartDate,
            endDate: deptEndDate,
          }).catch(() => ({ data: [], rowCount: 0 })),
          reportsService.generateReport<any>("PRODUCTION_RUNS", {
            projectId,
          }).catch(() => ({ data: [], rowCount: 0 })),
          reportsService.generateReport<any>("INVENTORY_LEDGER", {
            projectId,
            startDate: ledgerStartDate,
            endDate: ledgerEndDate,
          }).catch(() => ({ data: [], rowCount: 0 })),
          catalogService.getProducts().catch(() => []),
        ]);

      const stock = toArray(stockRes);
      const departmentActivity = toArray(departmentActivityRes);
      const production = toArray(productionRes);
      const ledger = toArray(ledgerRes);
      const catalog = Array.isArray(catalogRes)
        ? catalogRes
        : (catalogRes && Array.isArray((catalogRes as any).data) ? (catalogRes as any).data : []);

      return {
        project: projectRes || { id: projectId, name: "Project", status: "ACTIVE" },
        stock,
        departmentActivity,
        production,
        ledger,
        manufacturedProducts: catalog.filter(
          (product: any) =>
            product.kind === "MANUFACTURED_PRODUCT" &&
            product.ownerScope === "PROJECT" &&
            product.projectId === projectId,
        ),
      };
    },
    staleTime: 2 * 60_000,
  });

  const project = overviewQuery.data?.project ?? { id: projectId, name: "Project", status: "ACTIVE" };
  const stock = overviewQuery.data?.stock ?? [];
  const departmentActivity = overviewQuery.data?.departmentActivity ?? [];
  const production = overviewQuery.data?.production ?? [];
  const ledger = overviewQuery.data?.ledger ?? [];
  const manufacturedProducts = overviewQuery.data?.manufacturedProducts ?? [];

  // Aggregate stock
  const stockByProduct = new Map<string, ReportRow>();
  for (const row of stock) {
    const name = getText(row, "productName", "Product");
    const productId = getText(row, "productId", name);
    const previous = stockByProduct.get(productId) ?? {
      productId,
      productName: name,
      baseUnit: getText(row, "baseUnit", ""),
      usableQuantity: 0,
      availableQuantity: 0,
      reservedQuantity: 0,
    };
    for (const field of [
      "usableQuantity",
      "availableQuantity",
      "reservedQuantity",
    ]) {
      previous[field] = getNumber(previous, field) + getNumber(row, field);
    }
    stockByProduct.set(productId, previous);
  }

  // Department counts
  const departments = new Map<
    string,
    { issues: number; issuedQty: number }
  >();
  for (const row of departmentActivity) {
    if (row.type === "DEPARTMENT_RETURN") continue;
    const name = getText(row, "department", "General");
    const counts = departments.get(name) ?? {
      issues: 0,
      issuedQty: 0,
    };
    counts.issues += 1;
    counts.issuedQty += getNumber(row, "baseQuantity");
    departments.set(name, counts);
  }
  const maxActivity = Math.max(
    1,
    ...Array.from(departments.values()).map((counts) => counts.issuedQty),
  );
  const activeProducts = Array.from(stockByProduct.values()).filter(
    (row) => getNumber(row, "availableQuantity") > 0,
  ).length;
  const approvedRuns = production.filter(
    (row) => row.status === "APPROVED",
  ).length;
  const pendingRuns = production.filter(
    (row) => row.status === "PENDING_APPROVAL",
  ).length;
  const producedProductNames = new Set(
    production.flatMap((row) =>
      Array.isArray(row.outputs)
        ? row.outputs.map((output) =>
          String((output as ReportRow).product ?? ""),
        )
        : [],
    ),
  );
  const manufacturingMovements = ledger.filter((row) =>
    getText(row, "transactionType").startsWith("MANUFACTURING_"),
  );


  const olderDeptCount = departmentActivity.filter(
    (row) => !isDateInRange(getText(row, "date"), "TODAY"),
  ).length;

  const visibleDeptActivity = departmentActivity.filter((row) =>
    isDateInRange(
      getText(row, "date"),
      deptDateFilter,
      deptCustomStart,
      deptCustomEnd,
    ),
  );

  const indentRequisitionGroups = useMemo(() => {
    const groups = new Map<string, IndentGroupType>();

    for (const row of visibleDeptActivity) {
      if (row.type !== "DEPARTMENT_ISSUE") continue;
      const indentNumber = getText(row, "indentNumber", "N/A");
      const department = getText(row, "department", "General");
      const date = getText(row, "date", "");
      const key = `${indentNumber}__${department}__${date}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          indentKey: key,
          indentNumber,
          department,
          date,
          items: [],
          totalRequested: 0,
          totalProvided: 0,
          fulfillmentRate: 100,
          isFullyFulfilled: true,
        };
        groups.set(key, group);
      }

      const rawItems = Array.isArray(row.items) && row.items.length > 0 ? row.items : [row];
      for (const it of rawItems) {
        const itemObj = it as ReportRow;
        const product = getText(itemObj, "productName", getText(itemObj, "product", "Product"));
        const requested = getNumber(itemObj, "requestedQuantity") || getNumber(itemObj, "quantity");
        const provided = getNumber(itemObj, "quantity");
        const unit = getText(itemObj, "unit", "");
        const notes = itemObj.notes ? String(itemObj.notes) : (row.notes ? String(row.notes) : undefined);
        const status = itemObj.status ? String(itemObj.status) : (row.status ? String(row.status) : undefined);

        group.items.push({
          product,
          requestedQuantity: requested,
          quantity: provided,
          unit,
          notes,
          status,
        });
        group.totalRequested += requested;
        group.totalProvided += provided;
      }
    }

    for (const group of groups.values()) {
      group.fulfillmentRate =
        group.totalRequested > 0
          ? Math.min(100, Math.round((group.totalProvided / group.totalRequested) * 100))
          : 100;
      group.isFullyFulfilled = group.totalProvided >= group.totalRequested;
    }

    return Array.from(groups.values());
  }, [visibleDeptActivity]);

  const totalIndentsCount = indentRequisitionGroups.length;
  const totalIndentItemsCount = indentRequisitionGroups.reduce((acc: number, g: IndentGroupType) => acc + g.items.length, 0);
  const totalUnitsRequested = indentRequisitionGroups.reduce((acc: number, g: IndentGroupType) => acc + g.totalRequested, 0);
  const totalUnitsProvided = indentRequisitionGroups.reduce((acc: number, g: IndentGroupType) => acc + g.totalProvided, 0);
  const overallIndentFulfillmentRate =
    totalUnitsRequested > 0
      ? Math.min(100, Math.round((totalUnitsProvided / totalUnitsRequested) * 100))
      : 100;


  const olderLedgerCount = manufacturingMovements.filter(
    (row) => !isDateInRange(getText(row, "timestamp"), "TODAY"),
  ).length;

  const visibleLedgerMovements = manufacturingMovements.filter((row) =>
    isDateInRange(
      getText(row, "timestamp"),
      ledgerDateFilter,
      ledgerCustomStart,
      ledgerCustomEnd,
    ),
  );

  if (overviewQuery.isLoading) {
    return <LoadingState message="Loading project operations overview..." />;
  }

  if (overviewQuery.error || !overviewQuery.data) {
    return (
      <ErrorState
        title="Project overview could not be loaded"
        message={
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "Try again."
        }
        onRetry={() => overviewQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${project.name} Operations`}
        description="Consolidated overview of project inventory balances, manufacturing runs, workforce, and clinical department activity."
        actions={
          <Link href="/admin/projects">
            <Button variant="secondary">←  Back to Projects</Button>
          </Link>
        }
      />

      {/* Project Meta Banner */}


      {/* Sub-Tabs Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => handleTabChange("OVERVIEW")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === "OVERVIEW"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
            }`}
        >
          <span>Overview &amp; Balances</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("MANUFACTURING")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === "MANUFACTURING"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
            }`}
        >
          <span>⚙️  Manufacturing Runs</span>
          {production.length > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === "MANUFACTURING"
                  ? "bg-blue-500 text-white"
                  : "bg-slate-200 text-slate-700"
                }`}
            >
              {production.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("STAFF")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === "STAFF"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
            }`}
        >
          <span>Staff &amp; Workforce</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("DEPARTMENTS")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === "DEPARTMENTS"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
            }`}
        >
          <span>Clinical Departments</span>
          {departments.size > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === "DEPARTMENTS"
                  ? "bg-blue-500 text-white"
                  : "bg-slate-200 text-slate-700"
                }`}
            >
              {departments.size}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("LEDGER")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === "LEDGER"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
            }`}
        >
          <span>Inventory Ledger</span>
          {manufacturingMovements.length > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === "LEDGER"
                  ? "bg-blue-500 text-white"
                  : "bg-slate-200 text-slate-700"
                }`}
            >
              {manufacturingMovements.length}
            </span>
          )}
        </button>
      </div>

      {/* Sub-Tab 1: OVERVIEW */}
      {activeTab === "OVERVIEW" && (
        <div className="space-y-6">
          {/* KPI Stats Grid */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Products with stock
                </span>
                <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {activeProducts}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Products with positive available stock
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Departments with activity
                </span>
                <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {departments.size}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Departments with approved issues or returns
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Approved Production Runs
                </span>
                <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {approvedRuns}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {pendingRuns} awaiting approval
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Manufactured products
                </span>
                <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {manufacturedProducts.length}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {producedProductNames.size} have production output recorded
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Manufactured Products Table */}
          <Card>
            <CardHeader
              action={
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCloneCatalogModal(true)}
                    className="text-xs"
                  >
                    Transfer from Company Catalog
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowBulkCatalogModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Bulk Add Project Products
                  </Button>
                  <span className="text-xs text-slate-500">
                    {manufacturedProducts.length} products
                  </span>
                </div>
              }
            >
              <CardTitle>Manufactured products</CardTitle>
              <CardDescription>
                Products created by this project, with current available stock where present.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {manufacturedProducts.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">
                  This project has not created any manufactured products yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="border-0 rounded-none shadow-none">
                    <TableHeader>
                      <tr>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead align="right">Available</TableHead>
                        <TableHead align="right">Production</TableHead>
                      </tr>
                    </TableHeader>
                    <TableBody>
                      {manufacturedProducts.map((product: CatalogProduct) => {
                        const balance = stockByProduct.get(product.id);
                        return (
                          <TableRow key={product.id}>
                            <TableCell className="font-semibold text-slate-900">
                              {product.name}
                            </TableCell>
                            <TableCell>
                              {product.category?.name ??
                                product.categoryName ??
                                "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  product.status === "APPROVED"
                                    ? "success"
                                    : "warning"
                                }
                                size="sm"
                              >
                                {(product.status ?? "DRAFT").replaceAll("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell align="right" numeric>
                              {getNumber(
                                balance ?? {},
                                "availableQuantity",
                              ).toLocaleString()}{" "}
                              <span className="text-xs text-slate-500">
                                {product.baseUnit}
                              </span>
                            </TableCell>
                            <TableCell align="right">
                              {producedProductNames.has(product.name)
                                ? "Produced"
                                : "No runs yet"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Project Stock Balances */}
          <Card>
            <CardHeader
              action={
                <span className="text-xs font-mono text-slate-500 font-semibold">
                  {stockByProduct.size} Items
                </span>
              }
            >
              <CardTitle>Project Inventory Balances</CardTitle>
              <CardDescription>
                Authoritative posted balances currently located at this project's facility.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {stockByProduct.size === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No inventory stock has been posted to this project yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="border-0 rounded-none shadow-none">
                    <TableHeader sticky>
                      <tr>
                        <TableHead>Product</TableHead>
                        <TableHead align="right">Available</TableHead>
                        <TableHead align="right">Reserved</TableHead>
                      </tr>
                    </TableHeader>
                    <TableBody>
                      {Array.from(stockByProduct.values()).map((row) => (
                        <TableRow key={getText(row, "productId")}>
                          <TableCell>
                            <span className="font-semibold text-slate-900">
                              {getText(row, "productName")}
                            </span>
                          </TableCell>
                          <TableCell
                            align="right"
                            numeric
                            className="text-emerald-700 font-bold"
                          >
                            {getNumber(row, "availableQuantity").toLocaleString()}{" "}
                            {getText(row, "baseUnit", "")}
                          </TableCell>
                          <TableCell
                            align="right"
                            numeric
                            className="text-amber-700"
                          >
                            {getNumber(row, "reservedQuantity").toLocaleString()}{" "}
                            {getText(row, "baseUnit", "")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-Tab 2: MANUFACTURING */}
      {activeTab === "MANUFACTURING" && (
        <div className="pt-2">
          <ManufacturingView projectId={projectId} hideHeader={true} />
        </div>
      )}

      {/* Sub-Tab 3: STAFF */}
      {activeTab === "STAFF" && (
        <div className="pt-2">
          <StaffManagementView projectId={projectId} hideHeader={true} />
        </div>
      )}

      {/* Sub-Tab 4: DEPARTMENTS */}
      {activeTab === "DEPARTMENTS" && (
        <div className="space-y-4">
          {/* Indent-Wise Requisitions & Fulfillment Card */}
          <Card>
            <CardHeader
              action={
                <div className="flex items-center gap-2">
                  <Badge
                    variant={overallIndentFulfillmentRate === 100 ? "success" : "warning"}
                    size="sm"
                  >
                    {overallIndentFulfillmentRate}% Requisition Fulfillment
                  </Badge>
                </div>
              }
            >
              <CardTitle>Department Indent Requisitions &amp; Stock-Out Fulfillment</CardTitle>
              <CardDescription>
                Track physical department requisition slips (indents), comparing what each department requested vs what was provided from inventory.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Date Filter Bar */}
              <DateQuickFilterBar
                activeFilter={deptDateFilter}
                onFilterChange={setDeptDateFilter}
                customStart={deptCustomStart}
                customEnd={deptCustomEnd}
                onCustomStartChange={setDeptCustomStart}
                onCustomEndChange={setDeptCustomEnd}
                totalOlderCount={olderDeptCount}
                onViewAll={() => setDeptDateFilter("ALL")}
              />

              {/* Metrics Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Indent Forms
                  </span>
                  <p className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                    {totalIndentsCount}
                  </p>
                  <span className="text-[11px] text-slate-400">
                    {totalIndentItemsCount} line {totalIndentItemsCount === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Total Requested
                  </span>
                  <p className="text-xl font-bold font-mono text-slate-800 mt-0.5">
                    {totalUnitsRequested.toLocaleString()}
                  </p>
                  <span className="text-[11px] text-slate-400">from indent slips</span>
                </div>
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Total Provided
                  </span>
                  <p className="text-xl font-bold font-mono text-emerald-700 mt-0.5">
                    {totalUnitsProvided.toLocaleString()}
                  </p>
                  <span className="text-[11px] text-slate-400">issued from stock</span>
                </div>
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Fulfillment Rate
                  </span>
                  <p
                    className={`text-xl font-bold font-mono mt-0.5 ${overallIndentFulfillmentRate === 100
                        ? "text-emerald-700"
                        : "text-amber-700"
                      }`}
                  >
                    {overallIndentFulfillmentRate}%
                  </p>
                  <span className="text-[11px] text-slate-400">
                    {totalUnitsProvided < totalUnitsRequested
                      ? `${(totalUnitsRequested - totalUnitsProvided).toLocaleString()} short`
                      : "100% satisfied"}
                  </span>
                </div>
              </div>

              {/* Indents List */}
              {indentRequisitionGroups.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-slate-200/70">
                  No department indents recorded for the selected date range.
                </div>
              ) : (
                <div className="space-y-3">
                  {indentRequisitionGroups.map((group: IndentGroupType) => {
                    const isExpanded = !!expandedIndents[group.indentKey];
                    return (
                      <div
                        key={group.indentKey}
                        className="border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-2xs"
                      >
                        {/* Indent Header Banner */}
                        <div className="p-3.5 bg-slate-50/90 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-blue-100 text-blue-800 border border-blue-200">
                              Indent {group.indentNumber}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">
                                  {group.department}
                                </span>
                                <Badge variant="neutral" size="sm">
                                  {group.items.length} {group.items.length === 1 ? "line" : "lines"}
                                </Badge>
                              </div>
                              <span className="text-[11px] font-mono text-slate-400">
                                Issued: {group.date}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right text-xs">
                              <span className="text-slate-500">Requested: </span>
                              <strong className="font-mono text-slate-800">
                                {group.totalRequested.toLocaleString()}
                              </strong>
                              <span className="text-slate-300 mx-1.5">|</span>
                              <span className="text-slate-500">Provided: </span>
                              <strong className="font-mono text-emerald-700">
                                {group.totalProvided.toLocaleString()}
                              </strong>
                            </div>

                            {group.isFullyFulfilled ? (
                              <Badge variant="success" size="sm">
                                Fully Fulfilled (100%)
                              </Badge>
                            ) : (
                              <Badge variant="warning" size="sm">
                                Partial ({group.totalProvided}/{group.totalRequested} / {group.fulfillmentRate}%)
                              </Badge>
                            )}

                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="text-xs px-2.5 py-1 h-auto"
                              onClick={() =>
                                setExpandedIndents((prev) => ({
                                  ...prev,
                                  [group.indentKey]: !prev[group.indentKey],
                                }))
                              }
                            >
                              {isExpanded ? "Hide items" : "View items"}
                            </Button>
                          </div>
                        </div>

                        {/* Collapsible Items Table */}
                        {isExpanded && (
                          <div className="overflow-x-auto p-3">
                            <Table className="min-w-[600px] border-0 shadow-none text-xs">
                              <TableHeader>
                                <tr>
                                  <TableHead>Product</TableHead>
                                  <TableHead align="right">Requested</TableHead>
                                  <TableHead align="right">Provided</TableHead>
                                  <TableHead>Unit</TableHead>
                                  <TableHead>Fulfillment</TableHead>
                                  <TableHead>Notes</TableHead>
                                </tr>
                              </TableHeader>
                              <TableBody>
                                {group.items.map((item: IndentItem, idx: number) => {
                                  const itemFull = item.quantity >= item.requestedQuantity;
                                  return (
                                    <TableRow key={`${item.product}-${idx}`}>
                                      <TableCell className="font-medium text-slate-900">
                                        {item.product}
                                      </TableCell>
                                      <TableCell align="right" mono className="text-slate-700">
                                        {item.requestedQuantity}
                                      </TableCell>
                                      <TableCell align="right" mono className="font-bold text-emerald-700">
                                        {item.quantity}
                                      </TableCell>
                                      <TableCell className="text-slate-500">
                                        {item.unit || "units"}
                                      </TableCell>
                                      <TableCell>
                                        {itemFull ? (
                                          <Badge variant="success" size="sm">
                                            100% Fulfilled
                                          </Badge>
                                        ) : (
                                          <Badge variant="warning" size="sm">
                                            Partial ({item.quantity}/{item.requestedQuantity})
                                          </Badge>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-slate-400 text-[11px] truncate max-w-[160px]">
                                        {item.notes || "-"}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Department Usage Distribution & Raw Logs Card */}
          <Card>
            <CardHeader>
              <CardTitle>Department Stock-Out Distribution &amp; History</CardTitle>
              <CardDescription>
                Activity distribution of stock issued to clinical and hospital departments.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {departments.size === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">
                  No department stock-out issues have been recorded.
                </p>
              ) : (
                <div className="space-y-3.5 p-2 bg-slate-50/70 border border-slate-200/80 rounded-xl">
                  {Array.from(departments.entries()).map(([name, counts]) => (
                    <div
                      key={name}
                      className="grid gap-2 sm:grid-cols-[10rem_1fr] items-center"
                    >
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {name}
                      </p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <span className="w-28 text-[11px] text-slate-500">
                            Stock-Out: {counts.issuedQty.toLocaleString()} base units
                          </span>
                          <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-600 transition-all duration-300"
                              style={{
                                width: `${(counts.issuedQty / maxActivity) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {departmentActivity.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  {visibleDeptActivity.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-slate-200/60">
                      No department stock-out issues match the selected date filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="border-0 shadow-none">
                        <TableHeader>
                          <tr>
                            <TableHead>Activity</TableHead>
                            <TableHead>Indent Number</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead align="right">Req. / Supplied</TableHead>
                            <TableHead align="right">Date</TableHead>
                          </tr>
                        </TableHeader>
                        <TableBody>
                          {visibleDeptActivity.filter((r) => r.type === "DEPARTMENT_ISSUE").map((row, index) => {
                            const reqQty = getNumber(row, "requestedQuantity") || getNumber(row, "quantity");
                            const supQty = getNumber(row, "quantity");
                            return (
                              <TableRow key={`${getText(row, "type")}-${index}`}>
                                <TableCell>
                                  <Badge
                                    variant={
                                      row.type === "DEPARTMENT_RETURN"
                                        ? "success"
                                        : "primary"
                                    }
                                    size="sm"
                                  >
                                    {getText(row, "type").replaceAll("_", " ")}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs font-semibold text-blue-700">
                                  {getText(row, "indentNumber", "N/A")}
                                </TableCell>
                                <TableCell className="text-slate-700 font-medium">
                                  {getText(row, "department")}
                                </TableCell>
                                <TableCell className="text-slate-900 font-semibold">
                                  {getText(row, "product")}
                                </TableCell>
                                <TableCell align="right" numeric>
                                  {row.type === "DEPARTMENT_ISSUE" ? (
                                    <span className="font-mono">
                                      <span className="text-slate-500 font-normal">{reqQty} / </span>
                                      <span className="font-bold text-emerald-700">{supQty}</span>
                                      {" "}
                                      <span className="text-[10px] text-slate-400 font-sans">
                                        {getText(row, "unit", "")}
                                      </span>
                                    </span>
                                  ) : (
                                    <span>
                                      {supQty}{" "}
                                      <span className="text-[10px] text-slate-400 font-sans">
                                        {getText(row, "unit", "")}
                                      </span>
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell
                                  align="right"
                                  mono
                                  className="text-slate-500 text-[11px]"
                                >
                                  {getText(row, "date")}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-Tab 5: LEDGER */}
      {activeTab === "LEDGER" && (
        <Card>
          <CardHeader>
            <CardTitle>Manufacturing Stock Movements</CardTitle>
            <CardDescription>
              Raw material consumption deductions and finished manufactured additions posted to inventory.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {manufacturingMovements.length > 0 && (
              <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                <DateQuickFilterBar
                  activeFilter={ledgerDateFilter}
                  onFilterChange={setLedgerDateFilter}
                  customStart={ledgerCustomStart}
                  customEnd={ledgerCustomEnd}
                  onCustomStartChange={setLedgerCustomStart}
                  onCustomEndChange={setLedgerCustomEnd}
                  totalOlderCount={olderLedgerCount}
                  onViewAll={() => setLedgerDateFilter("ALL")}
                />
              </div>
            )}

            {visibleLedgerMovements.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                {manufacturingMovements.length === 0
                  ? "No manufacturing stock movements recorded for this project."
                  : "No movements match the selected date filter."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="border-0 rounded-none shadow-none">
                  <TableHeader sticky>
                    <tr>
                      <TableHead>Movement Type</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead align="right">Quantity</TableHead>
                      <TableHead align="right">Date</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {visibleLedgerMovements.map((row, index) => (
                      <TableRow key={`${getText(row, "timestamp")}-${index}`}>
                        <TableCell>
                          <Badge variant="purple" size="sm">
                            {getText(row, "transactionType").replace(
                              "MANUFACTURING_",
                              "Mfg ",
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900">
                          {getText(row, "productName")}
                        </TableCell>
                        <TableCell align="right" numeric>
                          {getText(row, "originalQuantity")}{" "}
                          <span className="text-[10px] text-slate-400 font-sans">
                            {getText(row, "unitName", "")}
                          </span>
                        </TableCell>
                        <TableCell
                          align="right"
                          mono
                          className="text-slate-500 text-[11px]"
                        >
                          {getText(row, "timestamp").slice(0, 10)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <BulkCatalogModal
        isOpen={showBulkCatalogModal}
        onClose={() => setShowBulkCatalogModal(false)}
        initialProjectId={projectId}
      />
      <CloneCatalogModal
        isOpen={showCloneCatalogModal}
        onClose={() => setShowCloneCatalogModal(false)}
        projectId={projectId}
        projectName={project.name}
        onSuccess={() => {
          void overviewQuery.refetch();
        }}
      />
    </div>
  );
}

export default ProjectOperationsOverview;
