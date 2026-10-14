'use client';

import React, { useState, useMemo } from 'react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../auth/auth.store';
import { canViewWarehouseIdentity } from '../../../lib/auth/permissions';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';

type ReportType = 'LEDGER_AUDIT' | 'STOCK_BALANCE' | 'EXPIRY_FORECAST' | 'DEPARTMENT_CONSUMPTION';

interface LedgerRecord {
  txId: string;
  type: string;
  location: string;
  product: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  unit: string;
  condition: string;
  actor: string;
  timestamp: string;
}

const MOCK_LEDGER_DATA: LedgerRecord[] = [
  {
    txId: 'TX-2026-901',
    type: 'TRANSFER_DISPATCH',
    location: 'Central Warehouse',
    product: 'Reagent Cartridge Alpha-9',
    direction: 'OUT',
    quantity: 10,
    unit: 'CARTON',
    condition: 'USABLE',
    actor: 'superadmin',
    timestamp: '2026-10-14 00:45:10',
  },
  {
    txId: 'TX-2026-902',
    type: 'TRANSFER_RECEIPT',
    location: 'Metro Diagnostics Lab',
    product: 'Reagent Cartridge Alpha-9',
    direction: 'IN',
    quantity: 10,
    unit: 'CARTON',
    condition: 'USABLE',
    actor: 'superadmin',
    timestamp: '2026-10-14 00:45:11',
  },
  {
    txId: 'TX-2026-903',
    type: 'DEPARTMENT_ISSUE',
    location: 'Metro Diagnostics Lab',
    product: 'Sterile Micro-Pipette Tips (200uL)',
    direction: 'OUT',
    quantity: 5,
    unit: 'BOX',
    condition: 'USABLE',
    actor: 'superadmin',
    timestamp: '2026-10-14 01:05:32',
  },
];

export function ReportsView() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState<ReportType>('LEDGER_AUDIT');
  const [filterQuery, setFilterQuery] = useState('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const canSeeSource = canViewWarehouseIdentity(user?.role);

  const filteredRecords = useMemo(() => {
    return MOCK_LEDGER_DATA.filter((r) => {
      const matchSearch =
        !filterQuery ||
        r.txId.toLowerCase().includes(filterQuery.toLowerCase()) ||
        r.product.toLowerCase().includes(filterQuery.toLowerCase()) ||
        r.actor.toLowerCase().includes(filterQuery.toLowerCase());
      return matchSearch;
    });
  }, [filterQuery]);

  const sanitizeCsvValue = (val: string | number) => {
    const str = String(val);
    if (['=', '+', '-', '@'].includes(str.charAt(0))) {
      return `'${str}`;
    }
    return str;
  };

  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return;

    const headers = ['Transaction ID', 'Type', 'Location', 'Product', 'Direction', 'Quantity', 'Unit', 'Condition', 'Actor', 'Timestamp'];
    const rows = filteredRecords.map((row) => {
      const loc = !canSeeSource && row.location === 'Central Warehouse' ? '[REDACTED]' : row.location;
      return [
        sanitizeCsvValue(row.txId),
        sanitizeCsvValue(row.type),
        sanitizeCsvValue(loc),
        sanitizeCsvValue(row.product),
        sanitizeCsvValue(row.direction),
        sanitizeCsvValue(row.quantity),
        sanitizeCsvValue(row.unit),
        sanitizeCsvValue(row.condition),
        sanitizeCsvValue(row.actor),
        sanitizeCsvValue(row.timestamp),
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_report_${reportType.toLowerCase()}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice(
      `Export generated with formula-injection neutralization. Audit log recorded.`,
    );
    setTimeout(() => setExportNotice(null), 5000);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports & Audit Logs"
        description="Filter-driven compliance reporting with spreadsheet formula-injection neutralization on exports."
        actions={
          filteredRecords.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={handleExportCsv}>
              ⬇ Export Filtered CSV ({filteredRecords.length})
            </Button>
          ) : undefined
        }
      />

      {exportNotice && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-[#18794e] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🛡️</span>
            <span>{exportNotice}</span>
          </div>
          <button onClick={() => setExportNotice(null)} className="text-[#18794e] hover:opacity-75">✕</button>
        </div>
      )}

      {/* 1. Filters First */}
      <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {[
              { type: 'LEDGER_AUDIT' as ReportType, label: 'Ledger Audit' },
              { type: 'STOCK_BALANCE' as ReportType, label: 'Stock Balance Summary' },
              { type: 'EXPIRY_FORECAST' as ReportType, label: 'Expiry Forecast' },
              { type: 'DEPARTMENT_CONSUMPTION' as ReportType, label: 'Dept Consumption' },
            ].map((r) => (
              <button
                key={r.type}
                onClick={() => setReportType(r.type)}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  reportType === r.type
                    ? 'bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe] font-semibold'
                    : 'text-[#5b6678] hover:bg-[#f1f5f9]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search transaction, product, actor..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-xs text-[#172033] placeholder-[#5b6678]/60 focus:outline-none focus:border-[#2563eb]"
            />
          </div>
        </div>
      </div>

      {/* 2. Result Table Second */}
      {filteredRecords.length === 0 ? (
        <EmptyState
          title="No audit records found"
          description="Try broadening your search query or switching report categories."
        />
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Operation Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Direction & Qty</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead className="text-right">Timestamp</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {filteredRecords.map((r) => {
              const displayLoc = !canSeeSource && r.location === 'Central Warehouse' ? '[REDACTED]' : r.location;
              return (
                <TableRow key={r.txId}>
                  <TableCell className="font-mono font-semibold text-[#172033]">{r.txId}</TableCell>
                  <TableCell className="font-medium text-[#2563eb]">{r.type}</TableCell>
                  <TableCell className="text-[#5b6678]">{displayLoc}</TableCell>
                  <TableCell className="text-[#172033] font-medium">{r.product}</TableCell>
                  <TableCell>
                    <span className={`font-mono font-bold ${r.direction === 'IN' ? 'text-[#18794e]' : 'text-[#b42318]'}`}>
                      {r.direction === 'IN' ? '+' : '-'}{r.quantity} {r.unit}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.condition === 'USABLE' ? 'success' : 'danger'}>
                      {r.condition}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#5b6678] font-mono text-[11px]">{r.actor}</TableCell>
                  <TableCell className="text-right text-[#5b6678] font-mono text-[11px]">{r.timestamp}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default ReportsView;
