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
import { useAuth } from '../../auth/auth.store';
import { catalogService } from '../../catalog/catalog.service';
import { administrationService } from '../../administration/administration.service';
import { reportsService } from '../reports.service';
import { ReportType, QueryReportDto } from '../reports.types';
import { queryKeys } from '../../../lib/query/query-keys';

const REPORT_OPTIONS: Array<{ type: ReportType; label: string; description: string }> = [
  { type: 'STOCK_BALANCE', label: 'Current stock', description: 'Real-time projected usable, reserved, available, and quarantined quantities' },
  { type: 'INVENTORY_LEDGER', label: 'Movement history', description: 'Immutable double-entry inventory audit trail and stock deltas' },
  { type: 'BATCH_EXPIRY', label: 'Expiry forecast', description: 'Lot-level expiration schedule, days remaining, and shelf-life tracking' },
  { type: 'CLIENT_CONSUMPTION', label: 'Department usage', description: 'Internal clinical and department issues and returns' },
  { type: 'PRODUCTION_RUNS', label: 'Manufacturing', description: 'Work-in-progress runs, recipe inputs, outputs, and wastage' },
];

const LABELS: Record<string, string> = {
  productName: 'Product', locationName: 'Location', locationType: 'Location type', batchNumber: 'Batch / Lot',
  expiryDate: 'Expiry date', usableQuantity: 'Usable', reservedQuantity: 'Reserved', availableQuantity: 'Available',
  damagedQuantity: 'Damaged', expiredQuantity: 'Expired', physicalQuantity: 'Physical total', minThreshold: 'Min threshold',
  lowStockAlert: 'Low stock', timestamp: 'Timestamp', transactionType: 'Movement type', sourceRefType: 'Source',
  condition: 'Condition', originalQuantity: 'Quantity', unitName: 'Unit', baseDelta: 'Stock delta',
  direction: 'Direction', postedBy: 'Recorded by', daysRemaining: 'Days to expiry', batchStatus: 'Batch status',
  isExpired: 'Expired', department: 'Department', product: 'Product', quantity: 'Quantity', unit: 'Unit',
  baseQuantity: 'Base quantity', date: 'Date', type: 'Activity', runId: 'Run ID', productionReference: 'Reference',
  clientName: 'Client', mode: 'Mode', status: 'Status', plannedOutput: 'Planned output', actualOutput: 'Actual output',
  wastage: 'Wastage', totalInputsCount: 'Inputs', totalOutputsCount: 'Outputs', createdAt: 'Created',
};

const NUMERIC_COLUMNS = new Set([
  'usableQuantity', 'reservedQuantity', 'availableQuantity', 'damagedQuantity',
  'expiredQuantity', 'physicalQuantity', 'minThreshold', 'originalQuantity',
  'baseDelta', 'daysRemaining', 'quantity', 'baseQuantity', 'plannedOutput',
  'actualOutput', 'wastage', 'totalInputsCount', 'totalOutputsCount',
]);

const MONO_COLUMNS = new Set([
  'batchNumber', 'runId', 'productionReference', 'timestamp', 'date', 'createdAt', 'expiryDate',
]);

function formatCellValue(column: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-300 font-mono">—</span>;
  }

  // Boolean flags
  if (typeof value === 'boolean') {
    if (column === 'lowStockAlert') {
      return value ? <Badge variant="warning" size="sm">LOW STOCK</Badge> : <span className="text-slate-400">Normal</span>;
    }
    if (column === 'isExpired') {
      return value ? <Badge variant="danger" size="sm">EXPIRED</Badge> : <Badge variant="success" size="sm">Active</Badge>;
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

  // Batch / Run Status
  if (column === 'batchStatus' || column === 'status') {
    const s = String(value).toUpperCase();
    if (s.includes('EXPIRED') || s.includes('REJECTED') || s.includes('FAILED')) {
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

  // Batch / Code identifiers
  if (column === 'batchNumber' || column === 'runId' || column === 'productionReference') {
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
  const [clientId, setClientId] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canViewClientActivity = user?.role !== 'STORE_ADMIN';
  const options = REPORT_OPTIONS.filter(
    (item) => canViewClientActivity || !['CLIENT_CONSUMPTION', 'PRODUCTION_RUNS'].includes(item.type)
  );

  const params: QueryReportDto = useMemo(() => ({
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(productId ? { productId } : {}),
    ...(isSuperAdmin && clientId ? { clientId } : {}),
  }), [startDate, endDate, productId, isSuperAdmin, clientId]);

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

  const clientsQuery = useQuery({
    queryKey: queryKeys.administration.clients(),
    queryFn: administrationService.getClients,
    enabled: Boolean(isSuperAdmin),
    staleTime: 10 * 60_000,
  });

  const csvMutation = useMutation({
    mutationFn: () => reportsService.generateCsv(reportType, params),
    onSuccess: (csv) => {
      setExportError(null);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${reportType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    },
    onError: (error) => setExportError(error instanceof Error ? error.message : 'Could not export this report.'),
  });

  const rows = reportQuery.data?.data ?? [];
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const activeReportMeta = options.find((item) => item.type === reportType);

  const hasActiveFilters = Boolean(startDate || endDate || productId || clientId);
  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setProductId('');
    setClientId('');
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
      {/* Page Header with primary print / CSV actions */}
      <PageHeader
        title="Reports & Analytics"
        description="Comprehensive audit-grade inventory movement ledgers, batch expiry forecasting, and stock telemetry."
        actions={
          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            <Button
              variant="secondary"
              disabled={!rows.length || csvMutation.isPending}
              onClick={() => csvMutation.mutate()}
            >
              <svg className="w-4 h-4 mr-1.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {csvMutation.isPending ? 'Preparing CSV...' : 'Export CSV'}
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
                    onClick={() => setReportType(option.type)}
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isSelected
                        ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {activeReportMeta && (
              <p className="text-[11px] text-slate-500 pl-1">{activeReportMeta.description}</p>
            )}
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

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
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

              {isSuperAdmin && (
                <Select
                  label="Client Scope"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">All client accounts</option>
                  {(clientsQuery.data ?? []).map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
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
            className="print:px-0"
            action={
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  Showing <strong className="text-slate-800 font-mono">{reportQuery.data?.rowCount ?? rows.length}</strong> records
                </span>
                <span className="h-4 w-px bg-slate-200" />
              </div>
            }
          >
            <CardTitle>{activeReportMeta?.label}</CardTitle>
            <CardDescription>{activeReportMeta?.description}</CardDescription>
          </CardHeader>

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
                          {formatCellValue(column, row[column])}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
              <table className="w-full text-left text-xs">
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
    </div>
  );
}

export default ReportsView;
