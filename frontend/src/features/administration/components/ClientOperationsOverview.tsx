"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
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
import { ManufacturingView } from "@/features/manufacturing/components/ManufacturingView";
import { StaffManagementView } from "@/features/staff/components/StaffManagementView";
import {
  DateQuickFilterBar,
  DateQuickFilter,
  isDateInRange,
} from "@/components/data-display/DateQuickFilterBar";

type ReportRow = Record<string, unknown>;
type ReportResponse = { data: ReportRow[]; rowCount: number };

type SubTab = "OVERVIEW" | "MANUFACTURING" | "STAFF" | "DEPARTMENTS" | "LEDGER";

const getText = (row: ReportRow, key: string, fallback = "—") => {
  const value = row[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
};
const getNumber = (row: ReportRow, key: string) => Number(row[key] ?? 0) || 0;

export function ClientOperationsOverview({ clientId }: { clientId: string }) {
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

  const [ledgerDateFilter, setLedgerDateFilter] = useState<DateQuickFilter>("TODAY");
  const [ledgerCustomStart, setLedgerCustomStart] = useState("");
  const [ledgerCustomEnd, setLedgerCustomEnd] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["administration", "client-overview", clientId],
    queryFn: async () => {
      const [client, stock, departmentActivity, production, ledger, catalog] =
        await Promise.all([
          administrationService.getClient(clientId),
          reportsService.generateReport<ReportResponse>("STOCK_BALANCE", {
            clientId,
          }),
          reportsService.generateReport<ReportResponse>("CLIENT_CONSUMPTION", {
            clientId,
          }),
          reportsService.generateReport<ReportResponse>("PRODUCTION_RUNS", {
            clientId,
          }),
          reportsService.generateReport<ReportResponse>("INVENTORY_LEDGER", {
            clientId,
          }),
          catalogService.getProducts(),
        ]);
      return {
        client,
        stock: stock.data,
        departmentActivity: departmentActivity.data,
        production: production.data,
        ledger: ledger.data,
        manufacturedProducts: catalog.filter(
          (product) =>
            product.kind === "MANUFACTURED_PRODUCT" &&
            product.ownerScope === "CLIENT" &&
            product.clientId === clientId,
        ),
      };
    },
    staleTime: 2 * 60_000,
  });

  if (overviewQuery.isLoading)
    return <LoadingState message="Loading client operations overview…" />;
  if (overviewQuery.error || !overviewQuery.data) {
    return (
      <ErrorState
        title="Client overview could not be loaded"
        message={
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "Try again."
        }
        onRetry={() => overviewQuery.refetch()}
      />
    );
  }

  const {
    client,
    stock,
    departmentActivity,
    production,
    ledger,
    manufacturedProducts,
  } = overviewQuery.data;

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
      damagedQuantity: 0,
      expiredQuantity: 0,
    };
    for (const field of [
      "usableQuantity",
      "availableQuantity",
      "reservedQuantity",
      "damagedQuantity",
      "expiredQuantity",
    ]) {
      previous[field] = getNumber(previous, field) + getNumber(row, field);
    }
    stockByProduct.set(productId, previous);
  }

  // Department counts
  const departments = new Map<
    string,
    { issues: number; returns: number; issuedQty: number; returnedQty: number }
  >();
  for (const row of departmentActivity) {
    const name = getText(row, "department", "General");
    const counts = departments.get(name) ?? {
      issues: 0,
      returns: 0,
      issuedQty: 0,
      returnedQty: 0,
    };
    if (row.type === "DEPARTMENT_RETURN") {
      counts.returns += 1;
      counts.returnedQty += getNumber(row, "baseQuantity");
    } else {
      counts.issues += 1;
      counts.issuedQty += getNumber(row, "baseQuantity");
    }
    departments.set(name, counts);
  }
  const maxActivity = Math.max(
    1,
    ...Array.from(departments.values()).flatMap((counts) => [
      counts.issuedQty,
      counts.returnedQty,
    ]),
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${client.name} Operations`}
        description="Consolidated overview of client inventory balances, manufacturing runs, workforce, and clinical department activity."
        actions={
          <Link href="/admin/clients">
            <Button variant="secondary">← Back to Clients</Button>
          </Link>
        }
      />

      {/* Client Meta Banner */}
      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-800">Status:</span>
          <Badge
            variant={client.status === "ACTIVE" ? "success" : "neutral"}
            size="sm"
          >
            {client.status ?? "ACTIVE"}
          </Badge>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">
            <strong>Assigned warehouses:</strong>{" "}
            {client.warehouseAssignments
              ?.map((a) => a.warehouse.name)
              .join(", ") || "No warehouse assigned"}
          </span>
        </div>
      </div>

      {/* Sub-Tabs Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => handleTabChange("OVERVIEW")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "OVERVIEW"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
          }`}
        >
          <span>📊 Overview &amp; Balances</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("MANUFACTURING")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "MANUFACTURING"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
          }`}
        >
          <span>⚙️ Manufacturing Runs</span>
          {production.length > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === "MANUFACTURING"
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
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "STAFF"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
          }`}
        >
          <span>👥 Staff &amp; Workforce</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("DEPARTMENTS")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "DEPARTMENTS"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
          }`}
        >
          <span>🏥 Clinical Departments</span>
          {departments.size > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === "DEPARTMENTS"
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
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "LEDGER"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
          }`}
        >
          <span>📜 Inventory Ledger</span>
          {manufacturingMovements.length > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === "LEDGER"
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
                <span className="text-xs text-slate-500">
                  {manufacturedProducts.length} products
                </span>
              }
            >
              <CardTitle>Manufactured products</CardTitle>
              <CardDescription>
                Products created by this client, with current available stock where present.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {manufacturedProducts.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">
                  This client has not created any manufactured products yet.
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

          {/* Client Stock Balances */}
          <Card>
            <CardHeader
              action={
                <span className="text-xs font-mono text-slate-500 font-semibold">
                  {stockByProduct.size} Items
                </span>
              }
            >
              <CardTitle>Client Inventory Balances</CardTitle>
              <CardDescription>
                Authoritative posted balances currently located at this client’s facility.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {stockByProduct.size === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No inventory stock has been posted to this client yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="border-0 rounded-none shadow-none">
                    <TableHeader sticky>
                      <tr>
                        <TableHead>Product</TableHead>
                        <TableHead align="right">Available</TableHead>
                        <TableHead align="right">Reserved</TableHead>
                        <TableHead align="right">Damaged</TableHead>
                        <TableHead align="right">Expired</TableHead>
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
                          <TableCell
                            align="right"
                            numeric
                            className="text-rose-600"
                          >
                            {getNumber(row, "damagedQuantity").toLocaleString()}{" "}
                            {getText(row, "baseUnit", "")}
                          </TableCell>
                          <TableCell
                            align="right"
                            numeric
                            className="text-slate-500"
                          >
                            {getNumber(row, "expiredQuantity").toLocaleString()}{" "}
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
          <ManufacturingView clientId={clientId} hideHeader={true} />
        </div>
      )}

      {/* Sub-Tab 3: STAFF */}
      {activeTab === "STAFF" && (
        <div className="pt-2">
          <StaffManagementView clientId={clientId} hideHeader={true} />
        </div>
      )}

      {/* Sub-Tab 4: DEPARTMENTS */}
      {activeTab === "DEPARTMENTS" && (
        <Card>
          <CardHeader>
            <CardTitle>Department Use &amp; Clinical Returns</CardTitle>
            <CardDescription>
              Activity distribution of issues and returns grouped by department.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {departments.size === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                No department issues or returns have been recorded.
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
                          Issued: {counts.issuedQty.toLocaleString()} base units
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
                      <div className="flex items-center gap-3">
                        <span className="w-28 text-[11px] text-slate-500">
                          Returned: {counts.returnedQty.toLocaleString()} base units
                        </span>
                        <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                            style={{
                              width: `${(counts.returnedQty / maxActivity) * 100}%`,
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

                {visibleDeptActivity.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-slate-200/60">
                    No department issues or returns match the selected date filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="border-0 shadow-none">
                      <TableHeader>
                        <tr>
                          <TableHead>Activity</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead align="right">Quantity</TableHead>
                          <TableHead align="right">Date</TableHead>
                        </tr>
                      </TableHeader>
                      <TableBody>
                        {visibleDeptActivity.map((row, index) => (
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
                            <TableCell className="text-slate-700 font-medium">
                              {getText(row, "department")}
                            </TableCell>
                            <TableCell className="text-slate-900 font-semibold">
                              {getText(row, "product")}
                            </TableCell>
                            <TableCell align="right" numeric>
                              {getText(row, "quantity")}{" "}
                              <span className="text-[10px] text-slate-400 font-sans">
                                {getText(row, "unit", "")}
                              </span>
                            </TableCell>
                            <TableCell
                              align="right"
                              mono
                              className="text-slate-500 text-[11px]"
                            >
                              {getText(row, "date")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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
                  ? "No manufacturing stock movements recorded for this client."
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
    </div>
  );
}

export default ClientOperationsOverview;
