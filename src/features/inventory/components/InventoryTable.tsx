'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query/query-keys';
import { useAuth } from '../../auth/auth.store';
import { inventoryService } from '../inventory.service';
import { PageHeader } from '../../../components/layout/PageHeader';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';

export function InventoryTable() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user?.role === 'PROJECT_ADMIN') {
      router.replace('/');
    }
  }, [user?.role, router]);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedSubCategory, setSelectedSubCategory] = useState('ALL');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // Fetch balances specifically for raw materials in warehouses
  const {
    data: allBalances = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.inventory.balances(
      user?.id || user?.role || 'current-user',
      { scope: 'raw_materials_warehouses', kind: 'RAW_MATERIAL', locationType: 'WAREHOUSE' },
    ),
    queryFn: () =>
      inventoryService.getBalances({
        kind: 'RAW_MATERIAL',
        locationType: 'WAREHOUSE',
      }),
    staleTime: 60_000,
  });

  // Fetch locations and filter down to actual warehouses only
  const locationsQuery = useQuery({
    queryKey: ['inventory', 'locations', user?.id],
    queryFn: () => inventoryService.getLocations(),
    staleTime: 10 * 60_000,
  });

  // Extract only physical warehouses (exclude all project facilities / client clinics)
  const warehouseLocations = useMemo(() => {
    const all = (locationsQuery.data || []).filter(
      (loc) => loc.locationType === 'WAREHOUSE' || (!loc.projectId && loc.warehouseId),
    );
    if (user?.role === 'STORE_ADMIN' && user.warehouseId) {
      return all.filter((loc) => loc.warehouseId === user.warehouseId);
    }
    return all;
  }, [locationsQuery.data, user?.role, user?.warehouseId]);

  // Strict invariant: Filter to only RAW MATERIALS located in WAREHOUSES
  // (strictly removes project sites and manufactured assemblies)
  const rawWarehouseBalances = useMemo(() => {
    return allBalances.filter((balance) => {
      const isRawMaterial =
        balance.productKind === 'RAW_MATERIAL' ||
        (!balance.productKind &&
          !balance.productName?.startsWith('Labco Multi-Analyte') &&
          !balance.productName?.startsWith('Labco Complete'));
      const isWarehouse =
        balance.locationType === 'WAREHOUSE' ||
        (!balance.projectId && Boolean(balance.warehouseId));
      return isRawMaterial && isWarehouse;
    });
  }, [allBalances]);

  // Dynamic filter dropdown option collections based on available warehouse stock
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    rawWarehouseBalances.forEach((b) => {
      if (b.categoryName) set.add(b.categoryName);
    });
    return Array.from(set).sort();
  }, [rawWarehouseBalances]);

  const availableSubCategories = useMemo(() => {
    const set = new Set<string>();
    rawWarehouseBalances.forEach((b) => {
      if (selectedCategory !== 'ALL' && b.categoryName !== selectedCategory) {
        return;
      }
      if (b.subCategoryName) set.add(b.subCategoryName);
    });
    return Array.from(set).sort();
  }, [rawWarehouseBalances, selectedCategory]);

  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    rawWarehouseBalances.forEach((b) => {
      if (b.brand) set.add(b.brand);
    });
    return Array.from(set).sort();
  }, [rawWarehouseBalances]);

  // Handle category change (reset subcategory if incompatible)
  const handleCategoryChange = (newCat: string) => {
    setSelectedCategory(newCat);
    setSelectedSubCategory('ALL');
  };

  // Filter application
  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return rawWarehouseBalances
      .filter((balance) => {
        // Search across title, brand, category, subcategory, location, and IDs
        const matchesQuery =
          !query ||
          [
            balance.productName,
            balance.brand,
            balance.categoryName,
            balance.subCategoryName,
            balance.locationName,
          ].some((val) => val?.toLowerCase().includes(query));

        // Warehouse location filter
        const matchesWarehouse =
          selectedWarehouse === 'ALL' || balance.locationId === selectedWarehouse;

        // Category filter
        const matchesCategory =
          selectedCategory === 'ALL' || balance.categoryName === selectedCategory;

        // Subcategory filter
        const matchesSubCategory =
          selectedSubCategory === 'ALL' || balance.subCategoryName === selectedSubCategory;

        // Brand filter
        const matchesBrand =
          selectedBrand === 'ALL' || balance.brand === selectedBrand;

        // Low stock threshold filter
        const available = Number(
          balance.availableQty ??
            Number(balance.usableQty) - Number(balance.reservedQty),
        );
        const matchesLowStock =
          !showLowStockOnly ||
          (Number(balance.minThreshold ?? 0) > 0 &&
            available <= Number(balance.minThreshold));

        return (
          matchesQuery &&
          matchesWarehouse &&
          matchesCategory &&
          matchesSubCategory &&
          matchesBrand &&
          matchesLowStock
        );
      })
      .sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
  }, [
    rawWarehouseBalances,
    searchTerm,
    selectedWarehouse,
    selectedCategory,
    selectedSubCategory,
    selectedBrand,
    showLowStockOnly,
  ]);

  // Aggregate KPI summary for raw materials in warehouses
  const summary = useMemo(() => {
    const products = new Set(filtered.map((b) => b.productId));
    const available = filtered.reduce(
      (sum, b) => sum + Number(b.availableQty || 0),
      0,
    );
    const reserved = filtered.reduce(
      (sum, b) => sum + Number(b.reservedQty || 0),
      0,
    );
    const lowStock = filtered.filter(
      (b) =>
        Number(b.minThreshold || 0) > 0 &&
        Number(b.availableQty || 0) <= Number(b.minThreshold),
    ).length;
    const warehouses = new Set(filtered.map((b) => b.locationId));

    return {
      products: products.size,
      available,
      reserved,
      lowStock,
      warehousesCount: warehouses.size,
    };
  }, [filtered]);

  const hasActiveFilters =
    searchTerm !== '' ||
    selectedWarehouse !== 'ALL' ||
    selectedCategory !== 'ALL' ||
    selectedSubCategory !== 'ALL' ||
    selectedBrand !== 'ALL' ||
    showLowStockOnly;

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedWarehouse('ALL');
    setSelectedCategory('ALL');
    setSelectedSubCategory('ALL');
    setSelectedBrand('ALL');
    setShowLowStockOnly(false);
  };

  if (user?.role === 'PROJECT_ADMIN') {
    return <LoadingState message="Redirecting to Operations Overview..." />;
  }

  if (isLoading) return <LoadingState message="Loading warehouse inventory balances…" />;
  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Inventory could not be loaded.'}
        onRetry={() => void refetch()}
      />
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Warehouse Raw Materials Inventory"
          description="Usable stock, reservations, and available raw materials present across company warehouses."
        />
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Badge variant="primary" size="md" withDot>
            Raw Materials & Warehouses Only
          </Badge>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Raw Material Products</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary.products}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">In company warehouses</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Available Quantity</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {summary.available.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">Ready for dispatch & formulation</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Reserved for Requests</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {summary.reserved.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">Locked in approved orders</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Low Stock Warnings</p>
          <p
            className={`mt-1 text-2xl font-bold ${
              summary.lowStock > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {summary.lowStock}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">Below minimum threshold</p>
        </div>
      </div>

      {/* Multi-Filter Bar */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        {/* Row 1: Search & Dropdowns */}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {/* 1. Search */}
          <div className="relative">
            <input
              aria-label="Search warehouse inventory"
              type="search"
              placeholder="Search product, brand, SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />
          </div>

          {/* 2. Warehouse Filter (Only warehouses, no projects) */}
          <div>
            <select
              aria-label="Filter by warehouse"
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL">All Warehouses ({warehouseLocations.length})</option>
              {warehouseLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Category Filter */}
          <div>
            <select
              aria-label="Filter by category"
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL">All Categories ({availableCategories.length})</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Sub-category Filter */}
          <div>
            <select
              aria-label="Filter by sub-category"
              value={selectedSubCategory}
              onChange={(e) => setSelectedSubCategory(e.target.value)}
              disabled={availableSubCategories.length === 0}
              className="w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="ALL">
                {availableSubCategories.length === 0
                  ? 'No Subcategories'
                  : `All Subcategories (${availableSubCategories.length})`}
              </option>
              {availableSubCategories.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Brand Filter */}
          <div>
            <select
              aria-label="Filter by brand"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL">All Brands ({availableBrands.length})</option>
              {availableBrands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Toggles & Active Filters Clear */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 select-none">
            <input
              type="checkbox"
              checked={showLowStockOnly}
              onChange={(e) => setShowLowStockOnly(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Show low stock items only</span>
            {summary.lowStock > 0 && (
              <Badge variant="danger" size="sm">
                {summary.lowStock}
              </Badge>
            )}
          </label>

          {hasActiveFilters && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">
                Showing {filtered.length} of {rawWarehouseBalances.length} items
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Stock Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No raw material inventory matches your filters"
          description="Try broadening your category, brand, or warehouse selection."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-2xs">
          <Table>
            <TableHeader sticky>
              <tr>
                <TableHead>Raw Material Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Category / Subcategory</TableHead>
                <TableHead align="right">Usable Qty</TableHead>
                <TableHead align="right">Reserved Qty</TableHead>
                <TableHead align="right">Available Qty</TableHead>
                <TableHead>Unit</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {filtered.map((balance) => {
                const available = Number(balance.availableQty || 0);
                const minThreshold = Number(balance.minThreshold || 0);
                const isLowStock = minThreshold > 0 && available <= minThreshold;

                return (
                  <TableRow key={balance.id}>
                    {/* Product & Brand */}
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {balance.productName || 'Raw Material Product'}
                          </span>
                          <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Raw Material
                          </span>
                        </div>
                        {balance.brand && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span className="text-slate-400">Brand:</span>
                            <span className="font-medium text-slate-700">{balance.brand}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Warehouse Location */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
                        <svg
                          className="w-3.5 h-3.5 text-slate-400 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                        <span>{balance.locationName || 'Warehouse'}</span>
                      </div>
                    </TableCell>

                    {/* Category & Subcategory */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-800">
                          {balance.categoryName || 'General'}
                        </div>
                        {balance.subCategoryName && (
                          <div className="inline-block text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            Sub: {balance.subCategoryName}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Usable Qty */}
                    <TableCell align="right" className="text-xs text-slate-700 font-mono">
                      {Number(balance.usableQty).toLocaleString()}
                    </TableCell>

                    {/* Reserved Qty */}
                    <TableCell align="right" className="text-xs text-amber-700 font-mono">
                      {Number(balance.reservedQty) > 0 ? (
                        Number(balance.reservedQty).toLocaleString()
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </TableCell>

                    {/* Available Qty */}
                    <TableCell align="right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <span
                          className={`text-xs font-mono font-bold ${
                            isLowStock
                              ? 'text-rose-600'
                              : available > 0
                              ? 'text-emerald-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {available.toLocaleString()}
                        </span>
                        {isLowStock && (
                          <Badge variant="danger" size="sm">
                            Low
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Unit */}
                    <TableCell className="text-xs text-slate-500 font-medium">
                      {balance.unit || 'units'}
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
}
