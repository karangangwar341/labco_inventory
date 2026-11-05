'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { useAuth } from '../../auth/auth.store';
import { catalogService } from '../../catalog/catalog.service';
import { administrationService } from '../../administration/administration.service';
import { departmentsService } from '../../departments/departments.service';
import { reportsService } from '../reports.service';
import { ReportType, QueryReportDto } from '../reports.types';
import { queryKeys } from '../../../lib/query/query-keys';

const REPORT_OPTIONS: Array<{ type: ReportType; label: string; description: string }> = [
  { type: 'STOCK_BALANCE', label: 'Current stock', description: 'Real-time usable, reserved, and available quantities' },
  { type: 'INVENTORY_LEDGER', label: 'Movement history', description: 'Immutable double-entry inventory audit trail and stock deltas' },
  { type: 'PROJECT_CONSUMPTION', label: 'Department usage', description: 'Internal clinical and department issues and returns' },
  { type: 'PRODUCTION_RUNS', label: 'Manufacturing', description: 'Work-in-progress runs, recipe inputs, outputs, and wastage' },
  { type: 'SHIPMENTS', label: 'Shipments & Logistics', description: 'Inbound, outbound, and inter-facility movements, status, quantities, and dates' },
  { type: 'MISSING_STOCK', label: 'Missing stock', description: 'Quantities confirmed missing by Super Admin, grouped by product for any date range' },
];

const LABELS: Record<string, string> = {
  productName: 'Product', locationName: 'Location', locationType: 'Location type',
  usableQuantity: 'Usable', reservedQuantity: 'Reserved', availableQuantity: 'Available',
  minThreshold: 'Min threshold',
  lowStockAlert: 'Low stock', timestamp: 'Timestamp', transactionType: 'Movement type', sourceRefType: 'Source', indentNumber: 'Indent Slip Number',
  condition: 'Condition', originalQuantity: 'Quantity', unitName: 'Unit', baseDelta: 'Stock delta',
  direction: 'Direction', postedBy: 'Recorded by', department: 'Department', product: 'Product', quantity: 'Quantity', unit: 'Unit',
  baseQuantity: 'Base quantity', date: 'Date', type: 'Activity', productionReference: 'Reference',
  projectName: 'Project', mode: 'Mode', status: 'Status', plannedOutput: 'Planned output', actualOutput: 'Actual output',
  wastage: 'Wastage', totalInputsCount: 'Inputs', totalOutputsCount: 'Outputs', createdAt: 'Created',
  shipmentType: 'Shipment type', sourceLocation: 'Source location',
  destinationLocation: 'Destination location', trackingNumber: 'Tracking Number', productsSummary: 'Included Products', issuedBy: 'Issued by', dispatchedQuantity: 'Dispatched qty',
  dispatchedAt: 'Dispatched at', shippedAt: 'Shipped at', receivedAt: 'Received at', totalItemsCount: 'Items',
  missingQuantity: 'Missing quantity', shipmentCount: 'Shipments',
};

const NUMERIC_COLUMNS = new Set([
  'usableQuantity', 'reservedQuantity', 'availableQuantity',
  'minThreshold', 'originalQuantity',
  'baseDelta', 'quantity', 'baseQuantity', 'plannedOutput',
  'actualOutput', 'wastage', 'totalInputsCount', 'totalOutputsCount', 'dispatchedQuantity',
  'missingQuantity', 'shipmentCount', 'totalItemsCount',
]);

const MONO_COLUMNS = new Set([
  'productionReference', 'timestamp', 'date', 'createdAt',
]);

interface DepartmentProductUsage {
  productName: string;
  brand: string;
  unit: string;
  issuedQuantity: number;
  returnedQuantity: number;
  netQuantity: number;
  indents: string[];
}

interface DepartmentSummaryItem {
  department: string;
  totalIndents: number;
  indentNumbers: string[];
  totalUniqueProducts: number;
  totalIssuedQuantity: number;
  totalReturnedQuantity: number;
  netQuantity: number;
  products: DepartmentProductUsage[];
  lastActivityDate: string;
}

function formatCellValue(
  column: string,
  value: unknown,
  row?: Record<string, any>,
  onViewShipment?: (shipment: any) => void
): React.ReactNode {
  if (column === 'trackingNumber') {
    return (
      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
        {String(value)}
      </span>
    );
  }

  if (column === 'indentNumber') {
    const num = String(value ?? '').trim();
    if (!num || num === 'N/A' || num === 'null' || num === 'undefined') {
      return <span className="font-mono text-xs text-slate-400">-</span>;
    }
    const cleanNum = num.replace(/^IND-/, '');
    const lineItems: any[] = row?._items || [];
    return (
      <button
        type="button"
        onClick={(e) => {
          if (lineItems.length > 0) {
            e.stopPropagation();
            onViewShipment?.({ ...row, items: lineItems });
          }
        }}
        className={`font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1 ${
          lineItems.length > 0 ? 'hover:bg-blue-100 hover:border-blue-300 cursor-pointer' : ''
        }`}
        title={lineItems.length > 0 ? 'Click to view indent slip items' : undefined}
      >
        <span>{cleanNum}</span>
      </button>
    );
  }

  if (column === 'productsSummary') {
    const summary = String(value);
    const lineItems: any[] = row?._items || [];
    return (
      <div className="flex flex-col gap-1 max-w-xs md:max-w-sm py-1">
        <span className="text-xs text-slate-800 font-medium truncate block" title={summary}>
          {summary}
        </span>
        {lineItems.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewShipment?.({ ...row, items: lineItems });
            }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline w-fit"
          >
            <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Click to view more ({lineItems.length} products)
          </button>
        )}
      </div>
    );
  }
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-300 font-mono">-</span>;
  }

  // Boolean flags
  if (typeof value === 'boolean') {
    if (column === 'lowStockAlert') {
      return value ? <Badge variant="warning" size="sm">LOW STOCK</Badge> : <span className="text-slate-400">Normal</span>;
    }
    return value ? 'Yes' : 'No';
  }

  // Stock direction & movement delta
  if (column === 'direction') {
    const dir = String(value).toUpperCase();
    return dir === 'IN' || dir === 'STOCK_IN'
      ? <Badge variant="success" size="sm">IN</Badge>
      : dir === 'OUT' || dir === 'STOCK_OUT'
        ? <Badge variant="primary" size="sm">OUT</Badge>
        : <Badge variant="neutral" size="sm">{String(value)}</Badge>;
  }

  if (column === 'baseDelta') {
    const num = Number(value);
    if (!isNaN(num)) {
      if (num > 0) return <span className="text-emerald-700 font-mono font-semibold">+{num.toLocaleString()}</span>;
      if (num < 0) return <span className="text-rose-600 font-mono font-semibold">{num.toLocaleString()}</span>;
      return <span className="text-slate-500 font-mono">0</span>;
    }
  }

  // Workflow status
  if (column === 'status') {
    const s = String(value).toUpperCase();
    if (s.includes('REJECTED') || s.includes('FAILED')) {
      return <Badge variant="danger" size="sm">{String(value)}</Badge>;
    }
    if (s.includes('ACTIVE') || s.includes('APPROVED') || s.includes('COMPLETED')) {
      return <Badge variant="success" size="sm">{String(value)}</Badge>;
    }
    if (s.includes('PENDING') || s.includes('WARNING') || s.includes('PROGRESS')) {
      return <Badge variant="warning" size="sm">{String(value)}</Badge>;
    }
    return <Badge variant="neutral" size="sm">{String(value)}</Badge>;
  }

  // Dates
  if (column.toLowerCase().includes('date') || column === 'timestamp' || column === 'createdAt') {
    const dateStr = String(value);
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return (
        <span className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
          {d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
        </span>
      );
    }
  }

  // Numeric quantities
  if (NUMERIC_COLUMNS.has(column)) {
    const num = Number(value);
    if (!isNaN(num)) {
      return <span className="font-mono tabular-nums font-semibold text-slate-800">{num.toLocaleString()}</span>;
    }
  }

  // Run and reference identifiers
  if (column === 'runId' || column === 'productionReference') {
    return (
      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200/80">
        {String(value)}
      </span>
    );
  }

  return String(value);
}

export function ReportsView() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState<ReportType>('INVENTORY_LEDGER');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departmentViewMode, setDepartmentViewMode] = useState<'SUMMARY' | 'INDENT'>('SUMMARY');
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({});
  const [exportError, setExportError] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canViewProjectActivity = user?.role !== 'STORE_ADMIN';
  const options = REPORT_OPTIONS.filter(
    (item) => (canViewProjectActivity || !['PROJECT_CONSUMPTION', 'PRODUCTION_RUNS'].includes(item.type))
      && (isSuperAdmin || item.type !== 'MISSING_STOCK')
  );

  const params: QueryReportDto = useMemo(() => ({
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(productId ? { productId } : {}),
    ...(departmentFilter ? { departmentId: departmentFilter } : {}),
    ...(isSuperAdmin && warehouseId ? { warehouseId } : {}),
    ...(isSuperAdmin && projectId ? { projectId } : {}),
  }), [startDate, endDate, productId, departmentFilter, isSuperAdmin, warehouseId, projectId]);

  const reportQuery = useQuery({
    queryKey: queryKeys.reports.view(reportType, { ...params }),
    queryFn: () => reportsService.generateReport(reportType, params),
    enabled: Boolean(user && options.some((item) => item.type === reportType)),
    staleTime: 2 * 60_000,
  });

  const auditQuery = useQuery({
    queryKey: [...queryKeys.reports.all, 'audit-history', user?.id],
    queryFn: reportsService.getAuditHistory,
    enabled: Boolean(user),
    staleTime: 2 * 60_000,
  });

  const productsQuery = useQuery({
    queryKey: queryKeys.catalog.products(user?.id, { reportFilters: true }),
    queryFn: () => catalogService.getProducts(),
    enabled: Boolean(user),
    staleTime: 10 * 60_000,
  });

  const warehousesQuery = useQuery({
    queryKey: queryKeys.administration.warehouses(),
    queryFn: administrationService.getWarehouses,
    enabled: Boolean(isSuperAdmin),
    staleTime: 10 * 60_000,
  });

  const projectsQuery = useQuery({
    queryKey: queryKeys.administration.projects(),
    queryFn: administrationService.getProjects,
    enabled: Boolean(isSuperAdmin),
    staleTime: 10 * 60_000,
  });

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments.list(projectId),
    queryFn: () => departmentsService.getDepartments(projectId || undefined),
    enabled: Boolean(user && reportType === 'PROJECT_CONSUMPTION'),
    staleTime: 5 * 60_000,
  });

  const csvMutation = useMutation({
    mutationFn: () => reportsService.generateCsv(reportType, {
      ...params,
      ...(reportType === 'PROJECT_CONSUMPTION' && departmentViewMode === 'SUMMARY' ? { groupBy: 'department' } : {}),
    }),
    onSuccess: (csv) => {
      setExportError(null);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const suffix = reportType === 'PROJECT_CONSUMPTION' && departmentViewMode === 'SUMMARY' ? 'department_summary' : reportType.toLowerCase();
      link.download = `${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    },
    onError: (error) => setExportError(error instanceof Error ? error.message : 'Could not export this report.'),
  });

  const excelMutation = useMutation({
    mutationFn: () => reportsService.generateExcel(reportType, params),
    onSuccess: (blob) => {
      setExportError(null);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${reportType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    },
    onError: (error) => setExportError(error instanceof Error ? error.message : 'Could not export Excel spreadsheet.'),
  });

  const rawRows = reportQuery.data?.data ?? [];

  // Available departments for the department filter
  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    (departmentsQuery.data ?? []).forEach((d) => {
      if (d.name) set.add(d.name);
    });
    rawRows.forEach((r: any) => {
      if (r.department) set.add(String(r.department));
    });
    return Array.from(set).sort();
  }, [departmentsQuery.data, rawRows]);

  // Client-side department filter for instant responsiveness
  const displayRawRows = useMemo(() => {
    if (reportType === 'PROJECT_CONSUMPTION' && departmentFilter) {
      return rawRows.filter((r) => String(r.department || '').toLowerCase() === departmentFilter.toLowerCase());
    }
    return rawRows;
  }, [rawRows, reportType, departmentFilter]);

  const isIdField = (key: string) => {
    const k = key.toLowerCase();
    return (
      k === 'id' ||
      k.endsWith('id') ||
      k.endsWith('_id') ||
      k.includes('uuid') ||
      k === 'sourcerefid'
    );
  };

  const [selectedShipment, setSelectedShipment] = useState<any | null>(null);

  const rows = useMemo(() => {
    return displayRawRows.map((row) => {
      const cleaned: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        if (!isIdField(key) && key !== 'items') {
          cleaned[key] = val;
        }
      }
      if (row.items) {
        cleaned._items = row.items;
      }
      return cleaned;
    });
  }, [displayRawRows]);

  // Grouped Department Usage Summary calculation
  const departmentSummaries = useMemo<DepartmentSummaryItem[]>(() => {
    if (reportType !== 'PROJECT_CONSUMPTION') return [];

    const deptMap = new Map<
      string,
      {
        department: string;
        indentsSet: Set<string>;
        productsMap: Map<string, DepartmentProductUsage>;
        totalIssuedQuantity: number;
        totalReturnedQuantity: number;
        lastActivityDate: string;
      }
    >();

    for (const itemRow of displayRawRows) {
      const row = itemRow as Record<string, any>;
      const deptName = row.department || 'General';
      if (!deptMap.has(deptName)) {
        deptMap.set(deptName, {
          department: deptName,
          indentsSet: new Set<string>(),
          productsMap: new Map<string, DepartmentProductUsage>(),
          totalIssuedQuantity: 0,
          totalReturnedQuantity: 0,
          lastActivityDate: '',
        });
      }

      const deptEntry = deptMap.get(deptName)!;
      const indentNum = row.indentNumber ? String(row.indentNumber).replace(/^IND-/, '') : '';
      if (indentNum && indentNum !== 'N/A' && indentNum !== 'null') {
        deptEntry.indentsSet.add(indentNum);
      }

      if (row.date && (!deptEntry.lastActivityDate || row.date > deptEntry.lastActivityDate)) {
        deptEntry.lastActivityDate = row.date;
      }

      const isReturn = row.type === 'DEPARTMENT_RETURN';
      const items: any[] = Array.isArray(row.items) && row.items.length > 0
        ? row.items
        : [{
            productName: row.product || row.productsSummary || 'Item',
            brand: row.brand || 'N/A',
            quantity: row.quantity || 0,
            unit: row.unit || 'units',
          }];

      for (const it of items) {
        const pName = it.productName || it.name || 'Unknown Product';
        const pBrand = it.brand || 'N/A';
        const pUnit = it.unit || 'units';
        const qty = Number(it.quantity) || 0;
        const key = `${pName}___${pUnit}`;

        if (!deptEntry.productsMap.has(key)) {
          deptEntry.productsMap.set(key, {
            productName: pName,
            brand: pBrand,
            unit: pUnit,
            issuedQuantity: 0,
            returnedQuantity: 0,
            netQuantity: 0,
            indents: [],
          });
        }

        const prodEntry = deptEntry.productsMap.get(key)!;
        if (isReturn) {
          prodEntry.returnedQuantity += qty;
          deptEntry.totalReturnedQuantity += qty;
        } else {
          prodEntry.issuedQuantity += qty;
          deptEntry.totalIssuedQuantity += qty;
        }
        prodEntry.netQuantity = prodEntry.issuedQuantity - prodEntry.returnedQuantity;
        if (indentNum && !prodEntry.indents.includes(indentNum)) {
          prodEntry.indents.push(indentNum);
        }
      }
    }

    return Array.from(deptMap.values())
      .map((dept) => {
        const products = Array.from(dept.productsMap.values()).sort(
          (a, b) => b.netQuantity - a.netQuantity,
        );
        return {
          department: dept.department,
          totalIndents: dept.indentsSet.size,
          indentNumbers: Array.from(dept.indentsSet),
          totalUniqueProducts: products.length,
          totalIssuedQuantity: dept.totalIssuedQuantity,
          totalReturnedQuantity: dept.totalReturnedQuantity,
          netQuantity: dept.totalIssuedQuantity - dept.totalReturnedQuantity,
          products,
          lastActivityDate: dept.lastActivityDate,
        };
      })
      .sort((a, b) => b.netQuantity - a.netQuantity);
  }, [displayRawRows, reportType]);

  // Aggregate metrics for Department Usage KPI ribbon
  const departmentMetrics = useMemo(() => {
    if (reportType !== 'PROJECT_CONSUMPTION') return null;
    const totalDepartments = departmentSummaries.length;
    const totalIndents = departmentSummaries.reduce((sum, d) => sum + d.totalIndents, 0);
    const totalConsumed = departmentSummaries.reduce((sum, d) => sum + d.netQuantity, 0);
    const uniqueProductsSet = new Set<string>();
    for (const d of departmentSummaries) {
      for (const p of d.products) {
        uniqueProductsSet.add(p.productName);
      }
    }
    return {
      totalDepartments,
      totalIndents,
      totalConsumed,
      totalUniqueProducts: uniqueProductsSet.size,
    };
  }, [departmentSummaries, reportType]);

  const toggleDepartmentExpand = (deptName: string) => {
    setExpandedDepartments((prev) => ({
      ...prev,
      [deptName]: !prev[deptName],
    }));
  };

  const openIndentModalByNumber = (indentNum: string) => {
    const cleanNum = indentNum.replace(/^IND-/, '');
    const matched = rawRows.find((r) => String(r.indentNumber || '').replace(/^IND-/, '') === cleanNum);
    if (matched) {
      setSelectedShipment(matched);
    }
  };

  const columns = rows.length ? Object.keys(rows[0]).filter((col) => !col.startsWith('_')) : [];
  const activeReportMeta = options.find((item) => item.type === reportType);

  const hasActiveFilters = Boolean(startDate || endDate || productId || warehouseId || projectId || departmentFilter);
  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setProductId('');
    setDepartmentFilter('');
    setWarehouseId('');
    setProjectId('');
  };

  const setQuickRange = (preset: 'TODAY' | 'YESTERDAY' | 'LAST_WEEK' | 'LAST_MONTH' | 'ALL') => {
    const now = new Date();
    const format = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    if (preset === 'TODAY') {
      const today = format(now);
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'YESTERDAY') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = format(y);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'LAST_WEEK') {
      const past = new Date(now);
      past.setDate(past.getDate() - 7);
      setStartDate(format(past));
      setEndDate(format(now));
    } else if (preset === 'LAST_MONTH') {
      const past = new Date(now);
      past.setDate(past.getDate() - 30);
      setStartDate(format(past));
      setEndDate(format(now));
    } else if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header with primary print / CSV / Excel actions */}
      <PageHeader
        title="Reports & Exports"
        actions={
          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            <Button
              variant="primary"
              disabled={!rows.length || excelMutation.isPending}
              onClick={() => excelMutation.mutate()}
            >
              <svg className="w-4 h-4 mr-1.5 text-emerald-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {excelMutation.isPending ? 'Preparing Excel...' : 'Export Excel (.xlsx)'}
            </Button>
            <Button
              variant="secondary"
              disabled={!rows.length || csvMutation.isPending}
              onClick={() => csvMutation.mutate()}
            >
              <svg className="w-4 h-4 mr-1.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {csvMutation.isPending ? 'Preparing CSV...' : (reportType === 'PROJECT_CONSUMPTION' && departmentViewMode === 'SUMMARY' ? 'Export Dept Summary CSV' : 'Export CSV')}
            </Button>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() => window.print()}
            >
              <svg className="w-4 h-4 mr-1.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / PDF
            </Button>
          </div>
        }
      />

      {/* Report Selection & Filter Control Card */}
      <Card className="print:hidden">
        <CardContent className="space-y-5">
          {/* Top navigation tabs for report types */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Select Report Dataset
            </span>
            <div
              className="flex flex-wrap gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/80"
              role="tablist"
              aria-label="Report type"
            >
              {options.map((option) => {
                const isSelected = reportType === option.type;
                return (
                  <button
                    key={option.type}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => {
                      setReportType(option.type);
                      setDepartmentFilter('');
                    }}
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isSelected
                        ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                      }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Filter Row */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 tracking-tight">
                  Filter Parameters
                </span>
                <span className="text-slate-300">|</span>
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['TODAY', 'Today'],
                      ['YESTERDAY', 'Yesterday'],
                      ['LAST_WEEK', 'Last 7 Days'],
                      ['LAST_MONTH', 'Last 30 Days'],
                      ['ALL', 'All Time'],
                    ] as const
                  ).map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setQuickRange(preset)}
                      className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 transition-colors border border-slate-200/70"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-end">
              <div className="space-y-1.5 w-full">
                <label className="text-xs font-medium text-slate-700 block">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
              </div>

              <div className="space-y-1.5 w-full">
                <label className="text-xs font-medium text-slate-700 block">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
              </div>

              <Select
                label="Product Scope"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">All catalog products</option>
                {(productsQuery.data ?? []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Select>

              {reportType === 'PROJECT_CONSUMPTION' && (
                <Select
                  label="Department Scope"
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                >
                  <option value="">All departments (combined)</option>
                  {availableDepartments.map((deptName) => (
                    <option key={deptName} value={deptName}>
                      {deptName}
                    </option>
                  ))}
                </Select>
              )}

              {isSuperAdmin && (
                <>
                  <Select
                    label="Warehouse Scope"
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                  >
                    <option value="">All warehouses (global)</option>
                    {(warehousesQuery.data ?? []).map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Project Scope"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">All project accounts</option>
                    {(projectsQuery.data ?? []).map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </>
              )}
            </div>
          </div>

          {exportError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{exportError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Query Status Feedback */}
      <div className="print:hidden">
        {reportQuery.isLoading ? (
          <LoadingState message="Generating authoritative report..." />
        ) : reportQuery.error ? (
          <ErrorState
            message={reportQuery.error instanceof Error ? reportQuery.error.message : 'Could not load report.'}
            onRetry={() => reportQuery.refetch()}
          />
        ) : !rows.length ? (
          <EmptyState
            title="No records found in this timeframe"
            description="No inventory transactions or stock records match the selected date window and product criteria."
          />
        ) : null}
      </div>

      {/* Active Report Table Card */}
      {!!rows.length && (
        <Card className="print:border-0 print:shadow-none">
          <CardHeader
            className="print:hidden"
            action={
              <div className="flex items-center gap-3">
                {reportType === 'PROJECT_CONSUMPTION' && (
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setDepartmentViewMode('SUMMARY')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                        departmentViewMode === 'SUMMARY'
                          ? 'bg-white text-blue-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      Department Summary
                    </button>
                    <button
                      type="button"
                      onClick={() => setDepartmentViewMode('INDENT')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                        departmentViewMode === 'INDENT'
                          ? 'bg-white text-blue-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Indent Slips
                    </button>
                  </div>
                )}
                <span className="text-xs text-slate-500">
                  {reportType === 'PROJECT_CONSUMPTION' && departmentViewMode === 'SUMMARY' ? (
                    <>Showing <strong className="text-slate-800 font-mono">{departmentSummaries.length}</strong> departments</>
                  ) : (
                    <>Showing <strong className="text-slate-800 font-mono">{displayRawRows.length}</strong> records</>
                  )}
                </span>
                <span className="h-4 w-px bg-slate-200" />
              </div>
            }
          >
            <CardTitle>{activeReportMeta?.label}</CardTitle>
            <CardDescription>{activeReportMeta?.description}</CardDescription>
          </CardHeader>

          {/* Department Usage KPI Summary Banner */}
          {reportType === 'PROJECT_CONSUMPTION' && departmentMetrics && (
            <div className="mx-6 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-100 rounded-xl print:hidden">
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Departments</span>
                <span className="text-lg font-bold text-slate-900 font-mono">{departmentMetrics.totalDepartments}</span>
                <span className="text-[10px] text-slate-500">dispensed stock</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Indent Slips</span>
                <span className="text-lg font-bold text-blue-700 font-mono">{departmentMetrics.totalIndents}</span>
                <span className="text-[10px] text-slate-500">authorized requests</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Unique Products</span>
                <span className="text-lg font-bold text-slate-800 font-mono">{departmentMetrics.totalUniqueProducts}</span>
                <span className="text-[10px] text-slate-500">catalog items</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Units Consumed</span>
                <span className="text-lg font-bold text-emerald-700 font-mono">{departmentMetrics.totalConsumed.toLocaleString()}</span>
                <span className="text-[10px] text-slate-500">net items dispensed</span>
              </div>
            </div>
          )}

          {/* Print-only formal document header */}
          <div className="hidden print:block pb-3 mb-3 border-b border-slate-300">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-base font-bold text-slate-900 tracking-tight">Labco Instruments - Warehouse Management System</h1>
                <p className="text-xs text-slate-700 mt-0.5 font-semibold">
                  {activeReportMeta?.label} - {reportType === 'PROJECT_CONSUMPTION' && departmentViewMode === 'SUMMARY' ? 'Aggregated Department Consumption' : activeReportMeta?.description}
                </p>
                {reportType === 'INVENTORY_LEDGER' && (
                  <p className="text-[11px] text-slate-600 mt-1">
                    <strong>Column Guide:</strong> Stock Delta indicates net change in base units (Positive/+ = stock added into facility, Negative/- = stock deducted from facility).
                  </p>
                )}
              </div>
              <div className="text-right text-[11px] text-slate-500 font-mono space-y-0.5">
                <div>Printed: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                <div>Records: {reportType === 'PROJECT_CONSUMPTION' && departmentViewMode === 'SUMMARY' ? departmentSummaries.length : displayRawRows.length}</div>
              </div>
            </div>
          </div>

          {/* In-UI Column Delta & Movement Guide Banner */}
          {reportType === 'INVENTORY_LEDGER' && (
            <div className="mx-6 mb-4 p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2.5 print:hidden">
              <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="space-y-1">
                <p className="font-semibold text-blue-950">Data Guide: Understanding Stock Delta &amp; Movement Direction</p>
                <p className="text-blue-800/90 leading-relaxed">
                  <strong>Stock delta (baseDelta)</strong> shows the exact net change in base packaging units for that specific ledger posting.
                  Positive values (<span className="text-emerald-700 font-mono font-semibold">+qty IN</span>) indicate stock additions (inbound supplier receipts, transfer receipts, manufacturing output).
                  Negative values (<span className="text-rose-700 font-mono font-semibold">-qty OUT</span>) indicate stock deductions, including damaged stock-outs.
                </p>
              </div>
            </div>
          )}

          {/* DEPARTMENT USAGE: DEPARTMENT SUMMARY VIEW */}
          {reportType === 'PROJECT_CONSUMPTION' && departmentViewMode === 'SUMMARY' ? (
            <div className="overflow-x-auto">
              <Table className="border-0 rounded-none shadow-none">
                <TableHeader sticky>
                  <tr>
                    <TableHead className="w-12">S.No</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Indent Slips</TableHead>
                    <TableHead>Included Products Breakdown</TableHead>
                    <TableHead align="right">Items</TableHead>
                    <TableHead align="right">Total Quantity</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead align="center" className="print:hidden">Product Breakdown</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {departmentSummaries.map((dept, deptIdx) => {
                    const isExpanded = Boolean(expandedDepartments[dept.department]);
                    return (
                      <>
                        <TableRow
                          key={dept.department}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/40 font-medium' : 'hover:bg-slate-50/70'}`}
                          onClick={() => toggleDepartmentExpand(dept.department)}
                        >
                          <TableCell mono className="text-slate-400 text-xs">
                            {deptIdx + 1}
                          </TableCell>
                          <TableCell className="font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {dept.department.charAt(0).toUpperCase()}
                              </span>
                              <span className="font-bold text-slate-800">{dept.department}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              {dept.indentNumbers.length === 0 ? (
                                <span className="text-xs text-slate-400 font-mono">-</span>
                              ) : (
                                dept.indentNumbers.map((indentNum) => (
                                  <button
                                    key={indentNum}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openIndentModalByNumber(indentNum);
                                    }}
                                    className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                                    title="Click to view indent slip items"
                                  >
                                    {indentNum}
                                  </button>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-md">
                            <div className="flex flex-wrap gap-1.5 py-1">
                              {dept.products.map((p, pIdx) => (
                                <span
                                  key={pIdx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 text-[11px]"
                                  title={`${p.productName} (${p.brand !== 'N/A' ? p.brand : ''}) - ${p.netQuantity} ${p.unit}`}
                                >
                                  <span className="font-medium truncate max-w-[150px]">{p.productName}:</span>
                                  <span className="font-mono font-bold text-blue-700">{p.netQuantity} {p.unit}</span>
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell align="right" numeric className="font-mono text-xs text-slate-600">
                            {dept.totalUniqueProducts}
                          </TableCell>
                          <TableCell align="right" numeric className="font-mono font-bold text-slate-900 text-sm">
                            {dept.netQuantity.toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {dept.lastActivityDate ? new Date(dept.lastActivityDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                          </TableCell>
                          <TableCell align="center" className="print:hidden">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDepartmentExpand(dept.department);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-2xs"
                            >
                              <span>{isExpanded ? 'Hide Details' : 'View Products'}</span>
                              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </TableCell>
                        </TableRow>

                        {/* Inline Itemized Product Breakdown for this Department */}
                        {isExpanded && (
                          <TableRow key={`${dept.department}-breakdown`} className="bg-slate-50/70 border-y border-blue-100">
                            <TableCell colSpan={8} className="p-0">
                              <div className="p-4 space-y-3 bg-gradient-to-b from-blue-50/30 to-slate-50/60">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                      {dept.department} — Detailed Product Consumption
                                    </span>
                                    <Badge variant="neutral" size="sm">
                                      {dept.products.length} {dept.products.length === 1 ? 'Product' : 'Products'}
                                    </Badge>
                                  </div>
                                  <span className="text-[11px] text-slate-500">
                                    Total Indents: <strong className="text-slate-800">{dept.totalIndents}</strong> | Net Units Consumed: <strong className="text-emerald-700 font-mono">{dept.netQuantity.toLocaleString()}</strong>
                                  </span>
                                </div>

                                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-2xs">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                                      <tr>
                                        <th className="py-2 px-3">S.No</th>
                                        <th className="py-2 px-3">Product Name</th>
                                        <th className="py-2 px-3">Brand</th>
                                        <th className="py-2 px-3 text-right">Issued Qty</th>
                                        <th className="py-2 px-3 text-right">Returned Qty</th>
                                        <th className="py-2 px-3 text-right">Net Consumed</th>
                                        <th className="py-2 px-3">Unit</th>
                                        <th className="py-2 px-3">Indent Slips</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {dept.products.map((prod, prodIdx) => (
                                        <tr key={prodIdx} className="hover:bg-blue-50/30 transition-colors">
                                          <td className="py-2 px-3 font-mono text-slate-400">{prodIdx + 1}</td>
                                          <td className="py-2 px-3 font-semibold text-slate-900">{prod.productName}</td>
                                          <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{prod.brand}</td>
                                          <td className="py-2 px-3 text-right font-mono text-slate-700">{prod.issuedQuantity.toLocaleString()}</td>
                                          <td className="py-2 px-3 text-right font-mono text-slate-500">
                                            {prod.returnedQuantity > 0 ? (
                                              <span className="text-rose-600 font-semibold">-{prod.returnedQuantity.toLocaleString()}</span>
                                            ) : (
                                              '0'
                                            )}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                                            {prod.netQuantity.toLocaleString()}
                                          </td>
                                          <td className="py-2 px-3 text-slate-600 font-medium">{prod.unit}</td>
                                          <td className="py-2 px-3">
                                            <div className="flex flex-wrap items-center gap-1">
                                              {prod.indents.length === 0 ? (
                                                <span className="text-slate-400 font-mono">-</span>
                                              ) : (
                                                prod.indents.map((indentNum) => (
                                                  <button
                                                    key={indentNum}
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      openIndentModalByNumber(indentNum);
                                                    }}
                                                    className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                                                    title="Click to view indent slip items"
                                                  >
                                                    {indentNum}
                                                  </button>
                                                ))
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* STANDARD TABLE VIEW (Used for Indent Slips and all other report datasets) */
            <div className="overflow-x-auto">
              <Table className="border-0 rounded-none shadow-none">
                <TableHeader sticky>
                  <tr>
                    {columns.map((column) => {
                      const isNum = NUMERIC_COLUMNS.has(column);
                      return (
                        <TableHead
                          key={column}
                          align={isNum ? 'right' : 'left'}
                          className="whitespace-nowrap"
                        >
                          {LABELS[column] ?? column.replace(/([A-Z])/g, ' $1').replace(/^./, (l) => l.toUpperCase())}
                        </TableHead>
                      );
                    })}
                  </tr>
                </TableHeader>
                <TableBody>
                  {rows.map((row, rowIndex) => (
                    <TableRow key={`${reportType}-${rowIndex}`}>
                      {columns.map((column) => {
                        const isNum = NUMERIC_COLUMNS.has(column);
                        const isMono = MONO_COLUMNS.has(column);
                        return (
                          <TableCell
                            key={column}
                            align={isNum ? 'right' : 'left'}
                            mono={isMono}
                            numeric={isNum}
                            className="whitespace-nowrap"
                          >
                            {formatCellValue(column, row[column], row, (shipment) => setSelectedShipment(shipment))}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      {/* Export Audit Trail Section */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Recent Export Audit Log</CardTitle>
          <CardDescription>
            Chronological record of report exports generated for compliance and data traceability.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {auditQuery.isLoading ? (
            <div className="p-5 text-center text-xs text-slate-500">Loading export audit logs...</div>
          ) : auditQuery.error ? (
            <div className="p-5 text-xs text-rose-600">Could not retrieve export history.</div>
          ) : (auditQuery.data ?? []).length === 0 ? (
            <div className="p-5 text-center text-xs text-slate-400">No export logs recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Dataset</th>
                    <th className="py-2.5 px-4">Generated By</th>
                    <th className="py-2.5 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(auditQuery.data ?? []).slice(0, 8).map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        <span className="font-mono text-slate-600">
                          {entry.entityId.replaceAll('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {entry.actorUser?.username ?? 'System User'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[11px] text-slate-500">
                        {new Date(entry.occurredAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shipment / Indent Slip Items Modal */}
      {selectedShipment && (
        <Modal
          isOpen={Boolean(selectedShipment)}
          onClose={() => setSelectedShipment(null)}
          title={
            selectedShipment.indentNumber && selectedShipment.indentNumber !== 'N/A'
              ? `Indent Slip Details: Indent ${String(selectedShipment.indentNumber).replace(/^IND-/, '')}`
              : `Shipment Details: ${selectedShipment.trackingNumber || 'Products Breakdown'}`
          }
          description={
            selectedShipment.indentNumber && selectedShipment.indentNumber !== 'N/A'
              ? `Department: ${selectedShipment.department || 'General'} | Activity: ${selectedShipment.type || 'Department Issue'} | Recorded by: ${selectedShipment.issuedBy || 'Project Admin'}`
              : `${selectedShipment.sourceLocation || 'Origin'} → ${selectedShipment.destinationLocation || 'Destination'} | Status: ${selectedShipment.status}`
          }
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              {selectedShipment.indentNumber && selectedShipment.indentNumber !== 'N/A' ? (
                <>
                  <div>
                    <span className="text-slate-500">Indent Slip Number: </span>
                    <span className="font-mono font-bold text-slate-800">{String(selectedShipment.indentNumber).replace(/^IND-/, '')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Department: </span>
                    <span className="font-semibold text-slate-800">{selectedShipment.department}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Recorded By: </span>
                    <span className="font-mono text-slate-700">{selectedShipment.issuedBy || 'Project Admin'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Date: </span>
                    <span className="font-mono text-slate-700">{selectedShipment.date || 'Today'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Status: </span>
                    <Badge variant={String(selectedShipment.status).includes('APPROVED') || String(selectedShipment.status).includes('POSTED') ? 'success' : 'warning'} size="sm">
                      {selectedShipment.status}
                    </Badge>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-slate-500">Tracking Number: </span>
                    <span className="font-mono font-bold text-slate-800">{selectedShipment.trackingNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Dispatched: </span>
                    <span className="font-mono text-slate-700">{selectedShipment.dispatchedAt || 'Pending'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Received: </span>
                    <span className="font-mono text-slate-700">{selectedShipment.receivedAt || 'Pending'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Status: </span>
                    <Badge variant={String(selectedShipment.status).includes('COMPLETED') ? 'success' : 'warning'} size="sm">
                      {selectedShipment.status}
                    </Badge>
                  </div>
                </>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">S.No</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Brand</th>
                    {selectedShipment.indentNumber ? (
                      <>
                        <th className="py-2.5 px-3 text-right">Requested Qty</th>
                        <th className="py-2.5 px-3 text-right">Supplied Qty</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2.5 px-3 text-right">Dispatched</th>
                        <th className="py-2.5 px-3 text-right">Received</th>
                        <th className="py-2.5 px-3 text-right">Discrepancy</th>
                      </>
                    )}
                    <th className="py-2.5 px-3">Unit</th>
                    <th className="py-2.5 px-3">Condition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(selectedShipment.items || []).map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-3 font-medium text-slate-900">{item.productName}</td>
                      <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{item.brand || '-'}</td>
                      {selectedShipment.indentNumber ? (
                        <>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">
                            {item.requestedQuantity?.toLocaleString() ?? item.quantity?.toLocaleString() ?? '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700">
                            {item.quantity?.toLocaleString() ?? '-'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800">
                            {item.dispatchedQuantity?.toLocaleString() ?? '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700">
                            {item.receivedQuantity !== null && item.receivedQuantity !== undefined
                              ? item.receivedQuantity.toLocaleString()
                              : <span className="text-slate-400 font-normal">Pending</span>}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold">
                            {item.discrepancyQuantity > 0 ? (
                              <span className="text-rose-600 font-bold">-{item.discrepancyQuantity}</span>
                            ) : (
                              <span className="text-slate-400 font-normal">0</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-2 px-3 text-slate-600">{item.unit}</td>
                      <td className="py-2 px-3">
                        <Badge variant="neutral" size="sm">{item.condition || 'USABLE'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedShipment(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ReportsView;
