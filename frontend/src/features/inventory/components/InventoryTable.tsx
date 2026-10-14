'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { StockBalance } from '../inventory.types';
import { inventoryService } from '../inventory.service';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { PermissionDenied } from '../../../components/feedback/PermissionDenied';
import { ApiError } from '../../../lib/api/errors';

export function InventoryTable() {
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [selectedCondition, setSelectedCondition] = useState('ALL');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchBalances = useCallback(() => {
    setIsLoading(true);
    setError(null);
    inventoryService
      .getBalances()
      .then((data) => {
        setBalances(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError(err);
        } else {
          setError(new ApiError(0, err instanceof Error ? err.message : 'Failed to load balances'));
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const filteredBalances = useMemo(() => {
    return balances.filter((b) => {
      const pName = b.productName || b.productId || '';
      const skuStr = b.sku || '';
      const batchStr = b.batchNumber || '';

      const matchesSearch =
        pName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        skuStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        batchStr.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesLocation =
        selectedLocation === 'ALL' || b.locationId === selectedLocation;

      // Authoritative backend availableQty
      const available = Number(b.availableQty ?? (Number(b.usableQty) - Number(b.reservedQty)));
      const minThresh = Number(b.minThreshold ?? 0);
      const matchesLowStock = !showLowStockOnly || (minThresh > 0 && available <= minThresh);

      const usableNum = Number(b.usableQty ?? 0);
      const damagedNum = Number(b.damagedQty ?? 0);
      const expiredNum = Number(b.expiredQty ?? 0);

      const matchesCondition =
        selectedCondition === 'ALL' ||
        (selectedCondition === 'USABLE' && usableNum > 0) ||
        (selectedCondition === 'DAMAGED' && damagedNum > 0) ||
        (selectedCondition === 'EXPIRED' && expiredNum > 0);

      return matchesSearch && matchesLocation && matchesLowStock && matchesCondition;
    });
  }, [balances, searchTerm, selectedLocation, selectedCondition, showLowStockOnly]);

  if (error?.isForbidden || error?.status === 403) {
    return (
      <div className="space-y-4">
        <PageHeader title="Inventory" description="Authoritative stock balances." />
        <PermissionDenied message={error.message || 'You do not have permission to view inventory balances for this location.'} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Inventory" description="Authoritative stock balances." />
        <ErrorState message={error.message} onRetry={fetchBalances} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Title: "Inventory" */}
      <PageHeader
        title="Inventory"
        description="Immutable stock balances and availability projected across warehouses and client locations."
        actions={
          <Link href="/requests/new">
            <Button variant="primary">+ New Stock Request</Button>
          </Link>
        }
      />

      {/* 2. Filters: Location, Product, Stock Condition */}
      <div className="p-3.5 bg-white border border-[#dbe3ee] rounded-lg flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <input
            type="text"
            placeholder="Filter product, SKU, or batch..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] placeholder-[#5b6678]/60 focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]"
          />

          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
          >
            <option value="ALL">All Locations</option>
            <option value="loc-wh-1">Central Warehouse</option>
            <option value="loc-client-1">Metro Diagnostics Lab</option>
          </select>

          <select
            value={selectedCondition}
            onChange={(e) => setSelectedCondition(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
          >
            <option value="ALL">All Stock Conditions</option>
            <option value="USABLE">Usable Stock</option>
            <option value="DAMAGED">Damaged Quarantine</option>
            <option value="EXPIRED">Expired Quarantine</option>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <label className="flex items-center gap-1.5 cursor-pointer text-[#172033] text-xs">
            <input
              type="checkbox"
              checked={showLowStockOnly}
              onChange={(e) => setShowLowStockOnly(e.target.checked)}
              className="rounded border-[#dbe3ee] text-[#2563eb] focus:ring-[#2563eb]"
            />
            <span>Low Stock (Below Threshold)</span>
          </label>
        </div>
      </div>

      {/* 3. Availability Explanation: Usable, Reserved, Available */}
      <div className="px-3.5 py-2.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[#172033]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#2563eb]">Balance Invariant:</span>
          <span>
            <strong className="text-[#172033]">Available</strong> = Usable - Reserved (≥ 0)
          </span>
          <span className="text-[#5b6678]">·</span>
          <span>
            <strong className="text-[#172033]">Physical Total</strong> = Usable + Damaged + Expired
          </span>
        </div>
        <span className="text-[11px] text-[#5b6678]">Pessimistic Row Locking Active</span>
      </div>

      {/* 4. Main Inventory Table & 5. Empty / Loading State */}
      {isLoading ? (
        <LoadingState message="Loading inventory balances from backend..." />
      ) : filteredBalances.length === 0 ? (
        <EmptyState
          title="No inventory records found"
          description={
            balances.length === 0
              ? "No stock balances have been recorded yet. Post an inbound shipment or import batch to initialize inventory."
              : "No stock balances match your search filters. Try clearing the search or changing location filter."
          }
        />
      ) : (
        <Table>
          <TableHeader sticky>
            <tr>
              <TableHead>Product & SKU</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Batch / Lot</TableHead>
              <TableHead className="text-right">Usable</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right text-[#18794e]">Available</TableHead>
              <TableHead className="text-right text-[#b42318]">Damaged</TableHead>
              <TableHead className="text-right text-[#a15c00]">Expired</TableHead>
              <TableHead className="text-right font-bold text-[#172033]">Physical Total</TableHead>
              <TableHead className="text-center">Version</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {filteredBalances.map((b) => {
              // Authoritative backend-projected values
              const available = Number(b.availableQty ?? 0);
              const physical = Number(b.physicalQty ?? 0);
              const minThresh = Number(b.minThreshold ?? 0);
              const isLow = minThresh > 0 && available <= minThresh;

              return (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#172033]">{b.productName || b.productId}</span>
                      {isLow && <Badge variant="warning">LOW</Badge>}
                    </div>
                    <span className="text-[11px] text-[#5b6678] font-mono">{b.sku || b.productId}</span>
                  </TableCell>
                  <TableCell className="text-[#5b6678]">{b.locationName || b.locationId}</TableCell>
                  <TableCell className="font-mono text-[#5b6678]">{b.batchNumber || '—'}</TableCell>
                  <TableCell className="text-right font-mono font-medium text-[#172033]">
                    {Number(b.usableQty)} {b.unit || 'units'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[#a15c00]">
                    {Number(b.reservedQty)} {b.unit || 'units'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-[#18794e]">
                    {available} {b.unit || 'units'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[#b42318]">
                    {Number(b.damagedQty)} {b.unit || 'units'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[#5b6678]">
                    {Number(b.expiredQty)} {b.unit || 'units'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-[#172033]">
                    {physical} {b.unit || 'units'}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#5b6678] text-[10px] font-mono border border-[#dbe3ee]">
                      v{b.version ?? 1}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default InventoryTable;
