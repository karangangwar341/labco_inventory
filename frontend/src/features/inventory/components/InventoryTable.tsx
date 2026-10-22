'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query/query-keys';
import { useAuth } from '../../auth/auth.store';
import { inventoryService } from '../inventory.service';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';

export function InventoryTable() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const { data: balances = [], isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.inventory.balances(user?.id || user?.role),
    queryFn: () => inventoryService.getBalances(),
    staleTime: 60_000,
  });
  const locationsQuery = useQuery({
    queryKey: ['inventory', 'locations', user?.id],
    queryFn: () => inventoryService.getLocations(),
    staleTime: 10 * 60_000,
  });

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return balances.filter((balance) => {
      const available = Number(balance.availableQty ?? Number(balance.usableQty) - Number(balance.reservedQty));
      const matchesQuery = !query || [balance.productName, balance.brand, balance.categoryName, balance.locationName]
        .some((value) => value?.toLowerCase().includes(query));
      return matchesQuery && (selectedLocation === 'ALL' || balance.locationId === selectedLocation) &&
        (!showLowStockOnly || (Number(balance.minThreshold ?? 0) > 0 && available <= Number(balance.minThreshold)));
    }).sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
  }, [balances, searchTerm, selectedLocation, showLowStockOnly]);

  const summary = useMemo(() => {
    const products = new Set(filtered.map((balance) => balance.productId));
    const available = filtered.reduce((sum, balance) => sum + Number(balance.availableQty || 0), 0);
    const lowStock = filtered.filter((balance) => Number(balance.minThreshold || 0) > 0 && Number(balance.availableQty || 0) <= Number(balance.minThreshold)).length;
    return { products: products.size, available, lowStock };
  }, [filtered]);

  if (isLoading) return <LoadingState message="Loading inventory balances…" />;
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Inventory could not be loaded.'} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Inventory" description="Usable stock, reservations, and available quantities by product and location." />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Products</p><p className="mt-1 text-xl font-semibold">{summary.products}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Available quantity</p><p className="mt-1 text-xl font-semibold">{summary.available.toLocaleString()}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Low stock items</p><p className="mt-1 text-xl font-semibold">{summary.lowStock}</p></div>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row">
        <input aria-label="Search inventory" type="search" placeholder="Search product or location" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="min-h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm" />
        {user?.role === 'SUPER_ADMIN' && <select aria-label="Filter by location" value={selectedLocation} onChange={(event) => setSelectedLocation(event.target.value)} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm"><option value="ALL">All locations</option>{(locationsQuery.data || []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>}
        <label className="inline-flex min-h-10 items-center gap-2 px-2 text-sm"><input type="checkbox" checked={showLowStockOnly} onChange={(event) => setShowLowStockOnly(event.target.checked)} />Low stock only</label>
      </div>
      {filtered.length === 0 ? <EmptyState title="No inventory found" description="Try changing the search or location filter." /> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader sticky><tr><TableHead>Product</TableHead><TableHead>Location</TableHead><TableHead>Category</TableHead><TableHead align="right">Usable</TableHead><TableHead align="right">Reserved</TableHead><TableHead align="right">Available</TableHead><TableHead>Unit</TableHead></tr></TableHeader>
            <TableBody>{filtered.map((balance) => <TableRow key={balance.id}>
              <TableCell><span className="font-medium">{balance.productName || 'Product'}</span>{balance.brand && <span className="ml-2 text-xs text-slate-500">{balance.brand}</span>}</TableCell>
              <TableCell>{balance.locationName || 'Location'}</TableCell>
              <TableCell>{balance.categoryName || '—'}</TableCell>
              <TableCell align="right">{Number(balance.usableQty).toLocaleString()}</TableCell>
              <TableCell align="right">{Number(balance.reservedQty).toLocaleString()}</TableCell>
              <TableCell align="right" className="font-semibold">{Number(balance.availableQty).toLocaleString()}</TableCell>
              <TableCell>{balance.unit || 'units'}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
