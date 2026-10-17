'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { administrationService } from '../administration.service';
import { reportsService } from '@/features/reports/reports.service';

type ReportRow = Record<string, unknown>;
type ReportResponse = { data: ReportRow[]; rowCount: number };

const getText = (row: ReportRow, key: string, fallback = '—') => {
  const value = row[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
};
const getNumber = (row: ReportRow, key: string) => Number(row[key] ?? 0) || 0;

export function ClientOperationsOverview({ clientId }: { clientId: string }) {
  const overviewQuery = useQuery({
    queryKey: ['administration', 'client-overview', clientId],
    queryFn: async () => {
      const [client, stock, departmentActivity, production, ledger] = await Promise.all([
        administrationService.getClient(clientId),
        reportsService.generateReport<ReportResponse>('STOCK_BALANCE', { clientId }),
        reportsService.generateReport<ReportResponse>('CLIENT_CONSUMPTION', { clientId }),
        reportsService.generateReport<ReportResponse>('PRODUCTION_RUNS', { clientId }),
        reportsService.generateReport<ReportResponse>('INVENTORY_LEDGER', { clientId }),
      ]);
      return { client, stock: stock.data, departmentActivity: departmentActivity.data, production: production.data, ledger: ledger.data };
    },
    staleTime: 2 * 60_000,
  });

  if (overviewQuery.isLoading) return <LoadingState message="Loading client operations overview…" />;
  if (overviewQuery.error || !overviewQuery.data) {
    return (
      <ErrorState
        title="Client overview could not be loaded"
        message={overviewQuery.error instanceof Error ? overviewQuery.error.message : 'Try again.'}
        onRetry={() => overviewQuery.refetch()}
      />
    );
  }

  const { client, stock, departmentActivity, production, ledger } = overviewQuery.data;

  // Aggregate stock
  const stockByProduct = new Map<string, ReportRow>();
  for (const row of stock) {
    const name = getText(row, 'productName', 'Product');
    const productId = getText(row, 'productId', name);
    const previous = stockByProduct.get(productId) ?? {
      productId,
      productName: name,
      usableQuantity: 0,
      availableQuantity: 0,
      reservedQuantity: 0,
      damagedQuantity: 0,
      expiredQuantity: 0,
    };
    for (const field of ['usableQuantity', 'availableQuantity', 'reservedQuantity', 'damagedQuantity', 'expiredQuantity']) {
      previous[field] = getNumber(previous, field) + getNumber(row, field);
    }
    stockByProduct.set(productId, previous);
  }

  // Department counts
  const departments = new Map<string, { issues: number; returns: number }>();
  for (const row of departmentActivity) {
    const name = getText(row, 'department', 'General');
    const counts = departments.get(name) ?? { issues: 0, returns: 0 };
    if (row.type === 'DEPARTMENT_RETURN') counts.returns += 1;
    else counts.issues += 1;
    departments.set(name, counts);
  }
  const maxActivity = Math.max(1, ...Array.from(departments.values()).flatMap((counts) => [counts.issues, counts.returns]));
  const activeProducts = Array.from(stockByProduct.values()).filter((row) => getNumber(row, 'availableQuantity') > 0).length;
  const approvedRuns = production.filter((row) => row.status === 'APPROVED').length;
  const manufacturingMovements = ledger.filter((row) => getText(row, 'transactionType').startsWith('MANUFACTURING_'));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${client.name} Operations`}
        description="Consolidated overview of client inventory balances, clinical department activity, and manufacturing runs."
        actions={
          <Link href="/admin/clients">
            <Button variant="secondary">
              ← Back to Clients
            </Button>
          </Link>
        }
      />

      {/* Client Meta Banner */}
      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-800">Status:</span>
          <Badge variant={client.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
            {client.status ?? 'ACTIVE'}
          </Badge>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">
            <strong>Consigned Warehouses:</strong>{' '}
            {client.warehouseAssignments?.map((a) => a.warehouse.name).join(', ') || 'No warehouse assigned'}
          </span>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              In-Stock Products
            </span>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {activeProducts}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Products with positive available stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Department Lines
            </span>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {departmentActivity.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Issues and clinical returns logged</p>
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
            <p className="text-[11px] text-slate-500 mt-0.5">Manufacturing batches committed</p>
          </CardContent>
        </Card>
      </div>

      {/* Section 1: Client Stock Balances */}
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
                    <TableRow key={getText(row, 'productId')}>
                      <TableCell>
                        <span className="font-semibold text-slate-900">{getText(row, 'productName')}</span>
                      </TableCell>
                      <TableCell align="right" numeric className="text-emerald-700 font-bold">
                        {getNumber(row, 'availableQuantity').toLocaleString()}
                      </TableCell>
                      <TableCell align="right" numeric className="text-amber-700">
                        {getNumber(row, 'reservedQuantity').toLocaleString()}
                      </TableCell>
                      <TableCell align="right" numeric className="text-rose-600">
                        {getNumber(row, 'damagedQuantity').toLocaleString()}
                      </TableCell>
                      <TableCell align="right" numeric className="text-slate-500">
                        {getNumber(row, 'expiredQuantity').toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Department Use & Returns */}
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
                <div key={name} className="grid gap-2 sm:grid-cols-[10rem_1fr] items-center">
                  <p className="truncate text-xs font-semibold text-slate-900">{name}</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="w-16 text-[11px] text-slate-500">Issues: {counts.issues}</span>
                      <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${(counts.issues / maxActivity) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-16 text-[11px] text-slate-500">Returns: {counts.returns}</span>
                      <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                          style={{ width: `${(counts.returns / maxActivity) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {departmentActivity.length > 0 && (
            <div className="overflow-x-auto pt-2">
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
                  {departmentActivity.slice(0, 10).map((row, index) => (
                    <TableRow key={`${getText(row, 'type')}-${index}`}>
                      <TableCell>
                        <Badge
                          variant={row.type === 'DEPARTMENT_RETURN' ? 'success' : 'primary'}
                          size="sm"
                        >
                          {getText(row, 'type').replaceAll('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-700 font-medium">{getText(row, 'department')}</TableCell>
                      <TableCell className="text-slate-900 font-semibold">{getText(row, 'product')}</TableCell>
                      <TableCell align="right" numeric>
                        {getText(row, 'quantity')} <span className="text-[10px] text-slate-400 font-sans">{getText(row, 'unit', '')}</span>
                      </TableCell>
                      <TableCell align="right" mono className="text-slate-500 text-[11px]">
                        {getText(row, 'date')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Manufacturing Production Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Manufacturing Runs</CardTitle>
          <CardDescription>
            Finished production batches and raw material recipe conversions.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {production.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No manufacturing production runs recorded for this client.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="border-0 rounded-none shadow-none">
                <TableHeader sticky>
                  <tr>
                    <TableHead>Run Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead align="right">Inputs</TableHead>
                    <TableHead align="right">Outputs</TableHead>
                    <TableHead align="right">Created</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {production.map((row) => (
                    <TableRow key={getText(row, 'runId')}>
                      <TableCell mono className="font-semibold text-slate-900">
                        #{getText(row, 'productionReference', getText(row, 'runId')).slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === 'APPROVED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'
                          }
                          size="sm"
                        >
                          {getText(row, 'status')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600 font-mono text-xs">{getText(row, 'mode')}</TableCell>
                      <TableCell align="right" numeric>{getText(row, 'totalInputsCount', '0')}</TableCell>
                      <TableCell align="right" numeric>{getText(row, 'totalOutputsCount', '0')}</TableCell>
                      <TableCell align="right" mono className="text-slate-500 text-[11px]">
                        {getText(row, 'createdAt').slice(0, 10)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Manufacturing Movements Ledger */}
      {manufacturingMovements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Manufacturing Stock Movements</CardTitle>
            <CardDescription>
              Raw material consumption deductions and finished manufactured additions posted to inventory.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="border-0 rounded-none shadow-none">
                <TableHeader sticky>
                  <tr>
                    <TableHead>Movement Type</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead align="right">Quantity</TableHead>
                    <TableHead align="right">Date</TableHead>
                    <TableHead align="right">Ref</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {manufacturingMovements.map((row, index) => (
                    <TableRow key={`${getText(row, 'timestamp')}-${index}`}>
                      <TableCell>
                        <Badge variant="purple" size="sm">
                          {getText(row, 'transactionType').replace('MANUFACTURING_', 'Mfg ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">{getText(row, 'productName')}</TableCell>
                      <TableCell align="right" numeric>
                        {getText(row, 'originalQuantity')}{' '}
                        <span className="text-[10px] text-slate-400 font-sans">{getText(row, 'unitName', '')}</span>
                      </TableCell>
                      <TableCell align="right" mono className="text-slate-500 text-[11px]">
                        {getText(row, 'timestamp').slice(0, 10)}
                      </TableCell>
                      <TableCell align="right" mono className="text-slate-400 text-[11px]">
                        #{getText(row, 'sourceRefId', '—').slice(0, 8)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ClientOperationsOverview;
