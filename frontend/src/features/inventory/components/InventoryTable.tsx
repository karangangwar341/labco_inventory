'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query/query-keys';
import { useAuth } from '../../auth/auth.store';
import { inventoryService } from '../inventory.service';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { PermissionDenied } from '../../../components/feedback/PermissionDenied';
import { ApiError } from '../../../lib/api/errors';
import { StockBalance } from '../inventory.types';

type ViewMode = 'PRODUCT' | 'WAREHOUSE' | 'CLIENT' | 'CATEGORY' | 'BRAND' | 'BATCH';

interface ProductAggregated {
  productId: string;
  productName: string;
  brand: string;
  categoryName: string;
  unit: string;
  minThreshold: number;
  usableQty: number;
  reservedQty: number;
  damagedQty: number;
  expiredQty: number;
  physicalQty: number;
  availableQty: number;
  locations: Set<string>;
  batches: StockBalance[];
}

export function InventoryTable() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('PRODUCT');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [selectedCondition, setSelectedCondition] = useState('ALL');
  const searchParams = useSearchParams();
  const [showLowStockOnly, setShowLowStockOnly] = useState(() => searchParams.get('filter') === 'LOW_STOCK');
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  const {
    data: rawBalances = [],
    isLoading: isBalancesLoading,
    error: queryError,
    refetch: refetchBalances,
  } = useQuery({
    queryKey: queryKeys.inventory.balances(user?.id || user?.role),
    queryFn: () => inventoryService.getBalances(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: rawLocations = [] } = useQuery({
    queryKey: ['inventory', 'locations', user?.id],
    queryFn: () => inventoryService.getLocations(),
    staleTime: 10 * 60 * 1000,
  });

  const balances = Array.isArray(rawBalances) ? rawBalances : [];
  const locationsList = Array.isArray(rawLocations) ? rawLocations : [];

  const warehouseLocations = useMemo(
    () => locationsList.filter((l) => l.locationType === 'WAREHOUSE'),
    [locationsList],
  );

  const clientLocations = useMemo(
    () => locationsList.filter((l) => l.locationType === 'CLIENT'),
    [locationsList],
  );

  const warehouseLocationIds = useMemo(
    () => new Set(warehouseLocations.map((w) => w.id)),
    [warehouseLocations],
  );

  const clientLocationIds = useMemo(
    () => new Set(clientLocations.map((c) => c.id)),
    [clientLocations],
  );

  const error = queryError
    ? queryError instanceof ApiError
      ? queryError
      : new ApiError(0, (queryError as Error).message || 'Failed to load balances')
    : null;

  useEffect(() => {
    if (searchParams.get('filter') === 'LOW_STOCK') {
      setShowLowStockOnly(true);
    }
    const locParam = searchParams.get('locationId');
    if (locParam && locationsList.length > 0) {
      const match = locationsList.find(
        (l) => l.id === locParam || l.warehouseId === locParam || l.clientId === locParam,
      );
      if (match) {
        setSelectedLocation(match.id);
        if (match.locationType === 'CLIENT') {
          setViewMode('CLIENT');
        } else {
          setViewMode('WAREHOUSE');
        }
      }
    }
    const viewParam = searchParams.get('view');
    if (viewParam === 'WAREHOUSE') {
      setViewMode('WAREHOUSE');
    } else if (viewParam === 'CLIENT') {
      setViewMode('CLIENT');
    }
  }, [searchParams, locationsList]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, selectedBrand, selectedLocation, selectedCondition, showLowStockOnly, viewMode]);

  const fetchBalances = () => {
    void refetchBalances();
  };

  const toggleProductExpand = (prodId: string) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [prodId]: !prev[prodId],
    }));
  };

  // Extract unique categories and brands for filter dropdowns
  const { uniqueCategories, uniqueBrands } = useMemo(() => {
    const cats = new Set<string>();
    const brands = new Set<string>();

    for (const b of balances) {
      if (b.categoryName) cats.add(b.categoryName);
      if (b.brand) brands.add(b.brand);
    }

    return {
      uniqueCategories: Array.from(cats).sort(),
      uniqueBrands: Array.from(brands).sort(),
    };
  }, [balances]);

  // Filter balances based on user search and dropdown selections
  const filteredBalances = useMemo(() => {
    return balances.filter((b) => {
      const pName = b.productName || b.productId || '';
      const bBrand = b.brand || '';
      const bCategory = b.categoryName || '';
      const batchStr = b.batchNumber || '';

      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        pName.toLowerCase().includes(searchLower) ||
        bBrand.toLowerCase().includes(searchLower) ||
        bCategory.toLowerCase().includes(searchLower) ||
        batchStr.toLowerCase().includes(searchLower) ||
        b.productId.toLowerCase().includes(searchLower);

      const matchesCategory =
        selectedCategory === 'ALL' || (b.categoryName || 'General') === selectedCategory;

      const matchesBrand =
        selectedBrand === 'ALL' || (b.brand || 'Generic') === selectedBrand;

      const matchesScope =
        viewMode === 'WAREHOUSE'
          ? b.locationType === 'WAREHOUSE' || warehouseLocationIds.has(b.locationId)
          : viewMode === 'CLIENT'
          ? b.locationType === 'CLIENT' || clientLocationIds.has(b.locationId)
          : true;

      const matchesLocation =
        selectedLocation === 'ALL'
          ? matchesScope
          : b.locationId === selectedLocation;

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

      return (
        matchesSearch &&
        matchesCategory &&
        matchesBrand &&
        matchesLocation &&
        matchesLowStock &&
        matchesCondition
      );
    });
  }, [
    balances,
    searchTerm,
    selectedCategory,
    selectedBrand,
    selectedLocation,
    selectedCondition,
    showLowStockOnly,
    viewMode,
    warehouseLocationIds,
    clientLocationIds,
  ]);

  // Aggregate by Product
  const productWiseList: ProductAggregated[] = useMemo(() => {
    const map = new Map<string, ProductAggregated>();

    for (const b of filteredBalances) {
      const prodId = b.productId || 'UNKNOWN';
      const existing = map.get(prodId);

      const usable = Number(b.usableQty ?? 0);
      const reserved = Number(b.reservedQty ?? 0);
      const damaged = Number(b.damagedQty ?? 0);
      const expired = Number(b.expiredQty ?? 0);
      const physical = Number(b.physicalQty ?? (usable + damaged + expired));
      const available = Number(b.availableQty ?? Math.max(0, usable - reserved));

      if (!existing) {
        map.set(prodId, {
          productId: prodId,
          productName: b.productName || 'Product',
          brand: b.brand || 'Generic',
          categoryName: b.categoryName || 'General',
          unit: b.unit || 'units',
          minThreshold: Number(b.minThreshold ?? 0),
          usableQty: usable,
          reservedQty: reserved,
          damagedQty: damaged,
          expiredQty: expired,
          physicalQty: physical,
          availableQty: available,
          locations: new Set([b.locationName || 'Main Store']),
          batches: [b],
        });
      } else {
        existing.usableQty += usable;
        existing.reservedQty += reserved;
        existing.damagedQty += damaged;
        existing.expiredQty += expired;
        existing.physicalQty += physical;
        existing.availableQty += available;
        if (b.locationName) existing.locations.add(b.locationName);
        existing.batches.push(b);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [filteredBalances]);

  // Group by Category
  const categoryWiseGroups = useMemo(() => {
    const map = new Map<string, ProductAggregated[]>();

    for (const prod of productWiseList) {
      const cat = prod.categoryName || 'General';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(prod);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [productWiseList]);

  // Group by Brand
  const brandWiseGroups = useMemo(() => {
    const map = new Map<string, ProductAggregated[]>();

    for (const prod of productWiseList) {
      const brand = prod.brand || 'Generic / Unbranded';
      if (!map.has(brand)) {
        map.set(brand, []);
      }
      map.get(brand)!.push(prod);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [productWiseList]);

  // Group by Warehouse / Facility
  const warehouseWiseGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        locationId: string;
        locationName: string;
        products: ProductAggregated[];
        totalUsable: number;
        totalAvailable: number;
        totalReserved: number;
        totalQuarantine: number;
      }
    >();

    // Pre-populate all warehouse locations matching filter
    for (const wh of warehouseLocations) {
      if (selectedLocation === 'ALL' || selectedLocation === wh.id) {
        map.set(wh.id, {
          locationId: wh.id,
          locationName: wh.name,
          products: [],
          totalUsable: 0,
          totalAvailable: 0,
          totalReserved: 0,
          totalQuarantine: 0,
        });
      }
    }

    for (const b of filteredBalances) {
      const isWarehouse =
        b.locationType === 'WAREHOUSE' ||
        warehouseLocationIds.has(b.locationId) ||
        (!b.locationType && !clientLocationIds.has(b.locationId));

      if (!isWarehouse) continue;

      const locId = b.locationId || 'UNKNOWN';
      const locName = b.locationName || 'Main Store';
      const prodId = b.productId || 'UNKNOWN';

      const usable = Number(b.usableQty ?? 0);
      const reserved = Number(b.reservedQty ?? 0);
      const damaged = Number(b.damagedQty ?? 0);
      const expired = Number(b.expiredQty ?? 0);
      const physical = Number(b.physicalQty ?? (usable + damaged + expired));
      const available = Number(b.availableQty ?? Math.max(0, usable - reserved));

      if (!map.has(locId)) {
        map.set(locId, {
          locationId: locId,
          locationName: locName,
          products: [],
          totalUsable: 0,
          totalAvailable: 0,
          totalReserved: 0,
          totalQuarantine: 0,
        });
      }

      const group = map.get(locId)!;
      group.totalUsable += usable;
      group.totalAvailable += available;
      group.totalReserved += reserved;
      group.totalQuarantine += damaged + expired;

      let existingProd = group.products.find((p) => p.productId === prodId);
      if (!existingProd) {
        existingProd = {
          productId: prodId,
          productName: b.productName || 'Product',
          brand: b.brand || 'Generic',
          categoryName: b.categoryName || 'General',
          unit: b.unit || 'units',
          minThreshold: Number(b.minThreshold ?? 0),
          usableQty: usable,
          reservedQty: reserved,
          damagedQty: damaged,
          expiredQty: expired,
          physicalQty: physical,
          availableQty: available,
          locations: new Set([locName]),
          batches: [b],
        };
        group.products.push(existingProd);
      } else {
        existingProd.usableQty += usable;
        existingProd.reservedQty += reserved;
        existingProd.damagedQty += damaged;
        existingProd.expiredQty += expired;
        existingProd.physicalQty += physical;
        existingProd.availableQty += available;
        existingProd.batches.push(b);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.locationName.localeCompare(b.locationName));
  }, [filteredBalances, warehouseLocations, selectedLocation, warehouseLocationIds, clientLocationIds]);

  // Group by Consigned Client
  const clientWiseGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        locationId: string;
        locationName: string;
        products: ProductAggregated[];
        totalUsable: number;
        totalAvailable: number;
        totalReserved: number;
        totalQuarantine: number;
      }
    >();

    // Pre-populate all client locations matching filter
    for (const cl of clientLocations) {
      if (selectedLocation === 'ALL' || selectedLocation === cl.id) {
        map.set(cl.id, {
          locationId: cl.id,
          locationName: cl.name,
          products: [],
          totalUsable: 0,
          totalAvailable: 0,
          totalReserved: 0,
          totalQuarantine: 0,
        });
      }
    }

    for (const b of filteredBalances) {
      const isClient =
        b.locationType === 'CLIENT' || clientLocationIds.has(b.locationId);

      if (!isClient) continue;

      const locId = b.locationId || 'UNKNOWN';
      const locName = b.locationName || 'Client Facility';
      const prodId = b.productId || 'UNKNOWN';

      const usable = Number(b.usableQty ?? 0);
      const reserved = Number(b.reservedQty ?? 0);
      const damaged = Number(b.damagedQty ?? 0);
      const expired = Number(b.expiredQty ?? 0);
      const physical = Number(b.physicalQty ?? (usable + damaged + expired));
      const available = Number(b.availableQty ?? Math.max(0, usable - reserved));

      if (!map.has(locId)) {
        map.set(locId, {
          locationId: locId,
          locationName: locName,
          products: [],
          totalUsable: 0,
          totalAvailable: 0,
          totalReserved: 0,
          totalQuarantine: 0,
        });
      }

      const group = map.get(locId)!;
      group.totalUsable += usable;
      group.totalAvailable += available;
      group.totalReserved += reserved;
      group.totalQuarantine += damaged + expired;

      let existingProd = group.products.find((p) => p.productId === prodId);
      if (!existingProd) {
        existingProd = {
          productId: prodId,
          productName: b.productName || 'Product',
          brand: b.brand || 'Generic',
          categoryName: b.categoryName || 'General',
          unit: b.unit || 'units',
          minThreshold: Number(b.minThreshold ?? 0),
          usableQty: usable,
          reservedQty: reserved,
          damagedQty: damaged,
          expiredQty: expired,
          physicalQty: physical,
          availableQty: available,
          locations: new Set([locName]),
          batches: [b],
        };
        group.products.push(existingProd);
      } else {
        existingProd.usableQty += usable;
        existingProd.reservedQty += reserved;
        existingProd.damagedQty += damaged;
        existingProd.expiredQty += expired;
        existingProd.physicalQty += physical;
        existingProd.availableQty += available;
        existingProd.batches.push(b);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.locationName.localeCompare(b.locationName));
  }, [filteredBalances, clientLocations, selectedLocation, clientLocationIds]);

  // Summary counts
  const summary = useMemo(() => {
    const totalProducts = new Set(balances.map((b) => b.productId)).size;
    const totalCategories = uniqueCategories.length;
    const totalBrands = uniqueBrands.length;

    let lowStockCount = 0;
    let damagedCount = 0;
    let expiredCount = 0;

    for (const prod of productWiseList) {
      if (prod.minThreshold > 0 && prod.availableQty <= prod.minThreshold) {
        lowStockCount++;
      }
      if (prod.damagedQty > 0) damagedCount++;
      if (prod.expiredQty > 0) expiredCount++;
    }

    return {
      totalProducts,
      totalCategories,
      totalBrands,
      lowStockCount,
      quarantineCount: damagedCount + expiredCount,
    };
  }, [balances, uniqueCategories, uniqueBrands, productWiseList]);

  if (error?.isForbidden || error?.status === 403) {
    return (
      <div className="space-y-6">
        <PageHeader title="Current Stock Levels" description="View available items in your store or warehouse." />
        <PermissionDenied message={error.message || 'You do not have permission to view inventory balances for this location.'} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Current Stock Levels" description="View available items in your store or warehouse." />
        <ErrorState message={error.message} onRetry={fetchBalances} />
      </div>
    );
  }

  const productTotalPages = Math.max(1, Math.ceil(productWiseList.length / pageSize));
  const productActivePage = Math.min(currentPage, productTotalPages);
  const paginatedProductList = productWiseList.slice(
    (productActivePage - 1) * pageSize,
    productActivePage * pageSize,
  );

  const batchTotalPages = Math.max(1, Math.ceil(filteredBalances.length / pageSize));
  const batchActivePage = Math.min(currentPage, batchTotalPages);
  const paginatedBatchList = filteredBalances.slice(
    (batchActivePage - 1) * pageSize,
    batchActivePage * pageSize,
  );

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader
        title="Current Stock Levels"
        description={
          user?.role === 'CLIENT_ADMIN'
            ? 'View posted stock and stock history for your manufactured products. Product definitions are managed in the catalogue.'
            : 'View posted stock and stock history at your locations. Product definitions are managed in the catalogue.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Link href="/catalog" className="flex-1 sm:flex-none">
              <Button variant="secondary" className="w-full sm:w-auto text-xs">Browse catalogue</Button>
            </Link>
            <Link href="/requests/new" className="flex-1 sm:flex-none">
              <Button variant="primary" className="w-full sm:w-auto text-xs">
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>+ Move / Request Stock</span>
                </span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* 2. Structured Catalog & Inventory KPI Summary Cards */}
      <div className={`grid grid-cols-2 ${user?.role === 'CLIENT_ADMIN' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-3.5`}>
        {/* Card 1: Total Products */}
        <Card className="bg-gradient-to-br from-blue-50/70 to-white border-blue-200/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-blue-900 text-xs font-semibold">
              <span>Products with stock</span>
              <span className="text-blue-600 font-mono text-[11px]">📦 Items</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
              {summary.totalProducts} <span className="text-xs font-normal text-slate-500">products</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Products with stock records</p>
          </CardContent>
        </Card>

        {/* Card 2: Categories */}
        <Card className="bg-gradient-to-br from-emerald-50/70 to-white border-emerald-200/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-emerald-900 text-xs font-semibold">
              <span>Categories in stock</span>
              <span className="text-emerald-600 font-mono text-[11px]">🏷️ Groups</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
              {summary.totalCategories} <span className="text-xs font-normal text-slate-500">categories</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Categories linked to these products</p>
          </CardContent>
        </Card>

        {/* Card 3: Brands */}
        {user?.role !== 'CLIENT_ADMIN' && (
          <Card className="bg-gradient-to-br from-indigo-50/70 to-white border-indigo-200/80">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-indigo-900 text-xs font-semibold">
                <span>Brands in stock</span>
                <span className="text-indigo-600 font-mono text-[11px]">🏢 Brands</span>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
                {summary.totalBrands} <span className="text-xs font-normal text-slate-500">brands</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Brands linked to these products</p>
            </CardContent>
          </Card>
        )}

        {/* Card 4: Health / Alerts */}
        <Card className="bg-gradient-to-br from-amber-50/70 to-white border-amber-200/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-amber-900 text-xs font-semibold">
              <span>Stock Alerts</span>
              <span className="text-amber-600 font-mono text-[11px]">⚠️ Health</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
              {summary.lowStockCount}{' '}
              <span className="text-xs font-normal text-slate-500">low stock</span>
              {summary.quarantineCount > 0 && (
                <span className="text-xs font-semibold text-rose-600 ml-2">
                  · {summary.quarantineCount} quarantine
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {summary.lowStockCount === 0 && summary.quarantineCount === 0
                ? 'All stock levels healthy'
                : 'Items requiring reorder or quarantine'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. View Mode Switcher + Filter Controls */}
      <Card>
        <CardContent className="p-4 space-y-3.5">
          {/* Top row: View Mode Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-medium overflow-x-auto whitespace-nowrap scrollbar-none max-w-full">
              <button
                type="button"
                onClick={() => setViewMode('PRODUCT')}
                className={`px-3 py-1.5 rounded-md shrink-0 whitespace-nowrap transition-all ${
                  viewMode === 'PRODUCT'
                    ? 'bg-white text-blue-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📦 Product-Wise
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('WAREHOUSE');
                  if (clientLocationIds.has(selectedLocation)) {
                    setSelectedLocation('ALL');
                  }
                }}
                className={`px-3 py-1.5 rounded-md shrink-0 whitespace-nowrap transition-all ${
                  viewMode === 'WAREHOUSE'
                    ? 'bg-white text-blue-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🏭 Warehouse-Wise ({warehouseLocations.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('CLIENT');
                  if (warehouseLocationIds.has(selectedLocation)) {
                    setSelectedLocation('ALL');
                  }
                }}
                className={`px-3 py-1.5 rounded-md shrink-0 whitespace-nowrap transition-all ${
                  viewMode === 'CLIENT'
                    ? 'bg-white text-blue-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🏥 Client-Wise ({clientLocations.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('CATEGORY')}
                className={`px-3 py-1.5 rounded-md shrink-0 whitespace-nowrap transition-all ${
                  viewMode === 'CATEGORY'
                    ? 'bg-white text-blue-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🏷️ Category-Wise
              </button>
              {user?.role !== 'CLIENT_ADMIN' && (
                <button
                  type="button"
                  onClick={() => setViewMode('BRAND')}
                  className={`px-3 py-1.5 rounded-md shrink-0 whitespace-nowrap transition-all ${
                    viewMode === 'BRAND'
                      ? 'bg-white text-blue-700 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🏢 Brand-Wise
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode('BATCH')}
                className={`px-3 py-1.5 rounded-md shrink-0 whitespace-nowrap transition-all ${
                  viewMode === 'BATCH'
                    ? 'bg-white text-blue-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📋 Batch / Lot Ledger
              </button>
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 select-none shrink-0 self-end sm:self-center">
              <input
                type="checkbox"
                checked={showLowStockOnly}
                onChange={(e) => setShowLowStockOnly(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              <span>⚠️ Show Low Stock Only</span>
            </label>
          </div>

          {/* Bottom row: Search and Dimension Filters */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${user?.role === 'CLIENT_ADMIN' ? 'lg:grid-cols-4' : 'lg:grid-cols-5'} gap-2.5`}>
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder={user?.role === 'CLIENT_ADMIN' ? 'Search item, SKU, batch...' : 'Search item, SKU, brand, batch...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Category Filter */}
            <div>
              <Select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="ALL">All Categories ({uniqueCategories.length})</option>
                {uniqueCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>

            {/* Brand Filter */}
            {user?.role !== 'CLIENT_ADMIN' && (
              <div>
                <Select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                >
                  <option value="ALL">All Brands ({uniqueBrands.length})</option>
                  {uniqueBrands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Location Filter */}
            <div>
              <Select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="ALL">
                  {viewMode === 'WAREHOUSE'
                    ? `🏭 All Central Warehouses (${warehouseLocations.length})`
                    : viewMode === 'CLIENT'
                    ? `🏥 All Consigned Clients (${clientLocations.length})`
                    : `All Locations (${locationsList.length})`}
                </option>
                {viewMode !== 'CLIENT' && warehouseLocations.length > 0 && (
                  <optgroup label="🏭 Distribution Hubs & Depots">
                    {warehouseLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {viewMode !== 'WAREHOUSE' && clientLocations.length > 0 && (
                  <optgroup label="🏥 Consigned Client Locations">
                    {clientLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </div>

            {/* Status Filter */}
            <div>
              <Select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
              >
                <option value="ALL">All Stock Statuses</option>
                <option value="USABLE">Good Stock Only</option>
                <option value="DAMAGED">Damaged (Quarantine)</option>
                <option value="EXPIRED">Expired (Quarantine)</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Inventory Data Display */}
      {isBalancesLoading ? (
        <LoadingState message="Loading projected stock balances..." />
      ) : filteredBalances.length === 0 ? (
        <EmptyState
          title="No stock records match your filters"
          description={
            balances.length === 0
              ? 'No inventory stock balances have been committed yet. Receive approved stock from suppliers or client dispatches.'
              : 'Try clearing your category, brand, or search filters to view available stock.'
          }
          action={
            (searchTerm || selectedCategory !== 'ALL' || selectedBrand !== 'ALL' || selectedLocation !== 'ALL' || selectedCondition !== 'ALL' || showLowStockOnly) ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('ALL');
                  setSelectedBrand('ALL');
                  setSelectedLocation('ALL');
                  setSelectedCondition('ALL');
                  setShowLowStockOnly(false);
                }}
              >
                Clear All Filters
              </Button>
            ) : undefined
          }
        />
      ) : viewMode === 'PRODUCT' ? (
        /* PRODUCT-WISE VIEW */
        <div className="space-y-0">
          <Table>
          <TableHeader sticky>
            <tr>
              <TableHead>Product</TableHead>
              {user?.role !== 'CLIENT_ADMIN' && <TableHead>Brand / Maker</TableHead>}
              <TableHead>Category</TableHead>
              <TableHead align="right" className="text-emerald-800 font-bold bg-emerald-50/40">
                Ready to Send
              </TableHead>
              <TableHead align="right">Good Stock</TableHead>
              <TableHead align="right" className="text-amber-700">Reserved</TableHead>
              <TableHead align="right" className="text-rose-600">Quarantine</TableHead>
              <TableHead align="right" className="font-bold text-slate-900">Total Units</TableHead>
              <TableHead className="text-center">Batches</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {paginatedProductList.map((p) => {
              const isLow = p.minThreshold > 0 && p.availableQty <= p.minThreshold;
              const isOut = p.availableQty <= 0;
              const isExpanded = !!expandedProducts[p.productId];

              return (
                <React.Fragment key={p.productId}>
                  <TableRow className="hover:bg-slate-50/70 transition-colors">
                    {/* Product Name & SKU */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{p.productName}</span>
                          {isOut ? (
                            <Badge variant="danger" size="sm">OUT OF STOCK</Badge>
                          ) : isLow ? (
                            <Badge variant="warning" size="sm">LOW STOCK</Badge>
                          ) : (
                            <Badge variant="success" size="sm">IN STOCK</Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Brand */}
                    {user?.role !== 'CLIENT_ADMIN' && (
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200/60">
                          {p.brand}
                        </span>
                      </TableCell>
                    )}

                    {/* Category */}
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200/60">
                        {p.categoryName}
                      </span>
                    </TableCell>

                    {/* Ready to Send */}
                    <TableCell align="right" numeric className="text-emerald-700 font-bold bg-emerald-50/20 text-sm">
                      {p.availableQty.toLocaleString()}{' '}
                      <span className="text-[10px] text-emerald-600 font-sans font-normal">{p.unit}</span>
                    </TableCell>

                    {/* Good Stock */}
                    <TableCell align="right" numeric className="text-slate-900 font-medium">
                      {p.usableQty.toLocaleString()}{' '}
                      <span className="text-[10px] text-slate-400 font-sans font-normal">{p.unit}</span>
                    </TableCell>

                    {/* Reserved */}
                    <TableCell align="right" numeric className="text-amber-700 font-medium">
                      {p.reservedQty.toLocaleString()}{' '}
                      <span className="text-[10px] text-slate-400 font-sans font-normal">{p.unit}</span>
                    </TableCell>

                    {/* Quarantine */}
                    <TableCell align="right" numeric className="text-rose-600">
                      {p.damagedQty + p.expiredQty > 0 ? (
                        <span className="font-semibold">
                          {(p.damagedQty + p.expiredQty).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}{' '}
                      <span className="text-[10px] text-slate-400 font-sans font-normal">{p.unit}</span>
                    </TableCell>

                    {/* Total Physical */}
                    <TableCell align="right" numeric className="font-bold text-slate-900">
                      {p.physicalQty.toLocaleString()}{' '}
                      <span className="text-[10px] text-slate-500 font-sans font-normal">{p.unit}</span>
                    </TableCell>

                    {/* Expand Batches */}
                    <TableCell className="text-center">
                      {p.batches.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleProductExpand(p.productId)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-700 transition-colors inline-flex items-center gap-1"
                        >
                          <span>{p.batches.length} batch{p.batches.length === 1 ? '' : 'es'}</span>
                          <svg
                            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Expanded Batch Details Subtable */}
                  {isExpanded && (
                    <TableRow className="bg-slate-50/80">
                      <TableCell colSpan={user?.role === 'CLIENT_ADMIN' ? 8 : 9} className="p-3">
                        <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs space-y-2">
                          <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                            <span>Batch &amp; Lot Breakdown for {p.productName}:</span>
                            <span className="text-[11px] text-slate-400">Locations: {Array.from(p.locations).join(', ')}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {p.batches.map((b) => (
                              <div
                                key={b.id}
                                className="p-2.5 rounded border border-slate-100 bg-slate-50/60 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-medium text-slate-900">
                                    Lot: {b.batchNumber || 'No Batch #'}
                                  </span>
                                  <Badge variant="neutral" size="sm">{b.locationName || 'Store'}</Badge>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-slate-600">
                                  <span>Ready to Send: <strong className="text-emerald-700">{Number(b.availableQty ?? 0)} {p.unit}</strong></span>
                                  <span>Total: <strong>{Number(b.physicalQty ?? 0)} {p.unit}</strong></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>

        {/* Pagination Toolbar */}
        {productTotalPages > 1 && (
          <div className="py-2.5 px-4 bg-white border border-slate-200 border-t-0 rounded-b-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 shadow-2xs">
            <div className="flex items-center gap-3">
              <div>
                Showing <span className="font-semibold text-slate-700">{(productActivePage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-semibold text-slate-700">{Math.min(productActivePage * pageSize, productWiseList.length)}</span> of{' '}
                <span className="font-semibold text-slate-700">{productWiseList.length}</span> products
              </div>
              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                <span className="text-slate-500">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-0.5 rounded border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  {[10, 15, 25, 50].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={productActivePage <= 1}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
                title="First Page"
              >
                «
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={productActivePage <= 1}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
              >
                Previous
              </button>
              <span className="px-2 text-slate-600 font-medium">
                Page {productActivePage} of {productTotalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(productTotalPages, p + 1))}
                disabled={productActivePage >= productTotalPages}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(productTotalPages)}
                disabled={productActivePage >= productTotalPages}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
                title="Last Page"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
      ) : viewMode === 'WAREHOUSE' ? (
        /* WAREHOUSE / FACILITY-WISE VIEW */
        <div className="space-y-4">
          {warehouseWiseGroups.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
              No warehouse inventory records found for the selected filter.
            </div>
          ) : (
            warehouseWiseGroups.map((group) => (
              <Card key={group.locationId} className="overflow-hidden border border-slate-200 shadow-2xs">
                <div className="p-4 bg-gradient-to-r from-blue-50/50 via-white to-white border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                      🏭
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-900">{group.locationName}</span>
                        <Badge variant="purple" size="sm">
                          {group.products.length} product{group.products.length === 1 ? '' : 's'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="text-slate-600">
                      Ready to Send: <strong className="text-emerald-700 text-sm">{group.totalAvailable.toLocaleString()} units</strong>
                    </div>
                    <div className="text-slate-500">
                      Usable: <strong className="text-slate-900">{group.totalUsable.toLocaleString()} units</strong>
                    </div>
                    {group.totalReserved > 0 && (
                      <div className="text-amber-700">
                        Reserved: <strong>{group.totalReserved.toLocaleString()} units</strong>
                      </div>
                    )}
                    {group.totalQuarantine > 0 && (
                      <div className="text-rose-600">
                        Quarantine: <strong>{group.totalQuarantine.toLocaleString()} units</strong>
                      </div>
                    )}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <tr>
                      <TableHead>Product Name</TableHead>
                      {user?.role !== 'CLIENT_ADMIN' && <TableHead>Brand</TableHead>}
                      <TableHead>Category</TableHead>
                      <TableHead align="right" className="text-emerald-800 font-bold">Ready to Send</TableHead>
                      <TableHead align="right">Good Stock</TableHead>
                      <TableHead align="right" className="text-amber-700">Reserved</TableHead>
                      <TableHead align="right" className="text-rose-600">Quarantine</TableHead>
                      <TableHead className="text-center">Batches</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {group.products.map((p) => {
                      const isLow = p.minThreshold > 0 && p.availableQty <= p.minThreshold;
                      const isOut = p.availableQty <= 0;

                      return (
                        <TableRow key={p.productId}>
                          <TableCell className="font-semibold text-slate-900">
                            {p.productName}
                          </TableCell>
                          {user?.role !== 'CLIENT_ADMIN' && (
                            <TableCell>
                              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200/60">
                                {p.brand}
                              </span>
                            </TableCell>
                          )}
                          <TableCell>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200/60">
                              {p.categoryName}
                            </span>
                          </TableCell>
                          <TableCell align="right" numeric className="text-emerald-700 font-bold bg-emerald-50/20">
                            {p.availableQty.toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell align="right" numeric className="text-slate-900">
                            {p.usableQty.toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell align="right" numeric className="text-amber-700">
                            {p.reservedQty.toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell align="right" numeric className="text-rose-600">
                            {(p.damagedQty + p.expiredQty).toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs font-mono text-slate-600">
                              {p.batches.length} batch{p.batches.length === 1 ? '' : 'es'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {isOut ? (
                              <Badge variant="danger" size="sm">OUT OF STOCK</Badge>
                            ) : isLow ? (
                              <Badge variant="warning" size="sm">LOW STOCK</Badge>
                            ) : (
                              <Badge variant="success" size="sm">IN STOCK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            ))
          )}
        </div>
      ) : viewMode === 'CLIENT' ? (
        /* CONSIGNED CLIENT-WISE VIEW */
        <div className="space-y-4">
          {clientWiseGroups.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
              No consigned client inventory records found for the selected filter.
            </div>
          ) : (
            clientWiseGroups.map((group) => (
              <Card key={group.locationId} className="overflow-hidden border border-slate-200 shadow-2xs">
                <div className="p-4 bg-gradient-to-r from-emerald-50/50 via-white to-white border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                      🏥
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-900">{group.locationName}</span>
                        <Badge variant="success" size="sm">
                          {group.products.length} product{group.products.length === 1 ? '' : 's'} consigned
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="text-slate-600">
                      Usable on Site: <strong className="text-emerald-700 text-sm">{group.totalUsable.toLocaleString()} units</strong>
                    </div>
                    {group.totalReserved > 0 && (
                      <div className="text-amber-700">
                        In Production: <strong>{group.totalReserved.toLocaleString()} units</strong>
                      </div>
                    )}
                    {group.totalQuarantine > 0 && (
                      <div className="text-rose-600">
                        Quarantine: <strong>{group.totalQuarantine.toLocaleString()} units</strong>
                      </div>
                    )}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <tr>
                      <TableHead>Product Name</TableHead>
                      {user?.role !== 'CLIENT_ADMIN' && <TableHead>Brand</TableHead>}
                      <TableHead>Category</TableHead>
                      <TableHead align="right" className="text-emerald-800 font-bold">Usable Stock</TableHead>
                      <TableHead align="right" className="text-amber-700">Reserved</TableHead>
                      <TableHead align="right" className="text-rose-600">Quarantine</TableHead>
                      <TableHead className="text-center">Batches</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {group.products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={user?.role === 'CLIENT_ADMIN' ? 7 : 8} className="text-center py-6 text-xs text-slate-400 italic">
                          No stock currently held at this client facility.
                        </TableCell>
                      </TableRow>
                    ) : (
                      group.products.map((p) => {
                        const isLow = p.minThreshold > 0 && p.availableQty <= p.minThreshold;
                        const isOut = p.availableQty <= 0;

                        return (
                          <TableRow key={p.productId}>
                            <TableCell className="font-semibold text-slate-900">
                              {p.productName}
                            </TableCell>
                            {user?.role !== 'CLIENT_ADMIN' && (
                              <TableCell>
                                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200/60">
                                  {p.brand}
                                </span>
                              </TableCell>
                            )}
                            <TableCell>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200/60">
                                {p.categoryName}
                              </span>
                            </TableCell>
                            <TableCell align="right" numeric className="text-emerald-700 font-bold bg-emerald-50/20">
                              {p.usableQty.toLocaleString()} {p.unit}
                            </TableCell>
                            <TableCell align="right" numeric className="text-amber-700">
                              {p.reservedQty.toLocaleString()} {p.unit}
                            </TableCell>
                            <TableCell align="right" numeric className="text-rose-600">
                              {(p.damagedQty + p.expiredQty).toLocaleString()} {p.unit}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-xs font-mono text-slate-600">
                                {p.batches.length} batch{p.batches.length === 1 ? '' : 'es'}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {isOut ? (
                                <Badge variant="danger" size="sm">OUT OF STOCK</Badge>
                              ) : isLow ? (
                                <Badge variant="warning" size="sm">LOW STOCK</Badge>
                              ) : (
                                <Badge variant="success" size="sm">IN STOCK</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </Card>
            ))
          )}
        </div>
      ) : viewMode === 'CATEGORY' ? (
        /* CATEGORY-WISE VIEW */
        <div className="space-y-4">
          {categoryWiseGroups.map(([catName, prods]) => {
            const totalAvailable = prods.reduce((sum, p) => sum + p.availableQty, 0);

            return (
              <Card key={catName} className="overflow-hidden border border-slate-200 shadow-2xs">
                <div className="p-3.5 bg-gradient-to-r from-emerald-50/40 via-white to-white border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-900">{catName}</span>
                    <Badge variant="neutral" size="sm">{prods.length} item{prods.length === 1 ? '' : 's'}</Badge>
                  </div>
                  <div className="text-xs text-slate-500">
                    Category Total Available: <strong className="text-emerald-700 text-sm">{totalAvailable.toLocaleString()} units</strong>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <tr>
                      <TableHead>Product Name</TableHead>
                      {user?.role !== 'CLIENT_ADMIN' && <TableHead>Brand</TableHead>}
                      <TableHead align="right" className="text-emerald-800 font-bold">Ready to Send</TableHead>
                      <TableHead align="right">Good Stock</TableHead>
                      <TableHead align="right" className="text-amber-700">Reserved</TableHead>
                      <TableHead align="right" className="text-rose-600">Quarantine</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {prods.map((p) => {
                      const isLow = p.minThreshold > 0 && p.availableQty <= p.minThreshold;
                      const isOut = p.availableQty <= 0;

                      return (
                        <TableRow key={p.productId}>
                          <TableCell className="font-semibold text-slate-900">
                            {p.productName}
                          </TableCell>
                          {user?.role !== 'CLIENT_ADMIN' && (
                            <TableCell>
                              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200/60">
                                {p.brand}
                              </span>
                            </TableCell>
                          )}
                          <TableCell align="right" numeric className="text-emerald-700 font-bold bg-emerald-50/20">
                            {p.availableQty.toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell align="right" numeric className="text-slate-900">
                            {p.usableQty.toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell align="right" numeric className="text-amber-700">
                            {p.reservedQty.toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell align="right" numeric className="text-rose-600">
                            {(p.damagedQty + p.expiredQty).toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell className="text-center">
                            {isOut ? (
                              <Badge variant="danger" size="sm">OUT OF STOCK</Badge>
                            ) : isLow ? (
                              <Badge variant="warning" size="sm">LOW STOCK</Badge>
                            ) : (
                              <Badge variant="success" size="sm">IN STOCK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            );
          })}
        </div>
      ) : viewMode === 'BRAND' ? (
        /* BRAND-WISE VIEW */
        <div className="space-y-4">
          {brandWiseGroups.map(([brandName, prods]) => {
            const totalAvailable = prods.reduce((sum, p) => sum + p.availableQty, 0);

            return (
              <Card key={brandName} className="overflow-hidden border border-slate-200 shadow-2xs">
                <div className="p-3.5 bg-gradient-to-r from-indigo-50/40 via-white to-white border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-900">{brandName}</span>
                    <Badge variant="neutral" size="sm">{prods.length} item{prods.length === 1 ? '' : 's'}</Badge>
                  </div>
                  <div className="text-xs text-slate-500">
                    Brand Total Available: <strong className="text-indigo-700 text-sm">{totalAvailable.toLocaleString()} units</strong>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <tr>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead align="right" className="text-emerald-800 font-bold">Ready to Send</TableHead>
                      <TableHead align="right">Good Stock</TableHead>
                      <TableHead align="right" className="text-amber-700">Reserved</TableHead>
                      <TableHead align="right" className="text-rose-600">Quarantine</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {prods.map((p) => {
                      const isLow = p.minThreshold > 0 && p.availableQty <= p.minThreshold;
                      const isOut = p.availableQty <= 0;

                      return (
                        <TableRow key={p.productId}>
                          <TableCell className="font-semibold text-slate-900">
                            {p.productName}
                          </TableCell>
                          <TableCell>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200/60">
                              {p.categoryName}
                            </span>
                          </TableCell>
                          <TableCell align="right" numeric className="text-emerald-700 font-bold bg-emerald-50/20">
                            {p.availableQty.toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell align="right" numeric className="text-slate-900">
                            {p.usableQty.toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell align="right" numeric className="text-amber-700">
                            {p.reservedQty.toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell align="right" numeric className="text-rose-600">
                            {(p.damagedQty + p.expiredQty).toLocaleString()} {p.unit}
                          </TableCell>
                          <TableCell className="text-center">
                            {isOut ? (
                              <Badge variant="danger" size="sm">OUT OF STOCK</Badge>
                            ) : isLow ? (
                              <Badge variant="warning" size="sm">LOW STOCK</Badge>
                            ) : (
                              <Badge variant="success" size="sm">IN STOCK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            );
          })}
        </div>
      ) : (
        /* DETAILED BATCH / LOT LEDGER VIEW */
        <div className="space-y-0">
          <Table>
          <TableHeader sticky>
            <tr>
              <TableHead>Item &amp; SKU</TableHead>
              {user?.role !== 'CLIENT_ADMIN' && <TableHead>Brand</TableHead>}
              <TableHead>Category</TableHead>
              <TableHead>Store Location</TableHead>
              <TableHead>Batch / Lot No.</TableHead>
              <TableHead align="right" className="text-emerald-800 font-bold bg-emerald-50/40">Ready to Send</TableHead>
              <TableHead align="right">Good Stock</TableHead>
              <TableHead align="right" className="text-amber-700">Reserved</TableHead>
              <TableHead align="right" className="text-rose-600">Quarantine</TableHead>
              <TableHead align="right" className="font-bold text-slate-900">Total in Store</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {paginatedBatchList.map((b) => {
              const available = Number(b.availableQty ?? (Number(b.usableQty) - Number(b.reservedQty)));
              const physical = Number(b.physicalQty ?? 0);
              const minThresh = Number(b.minThreshold ?? 0);
              const isLow = minThresh > 0 && available <= minThresh;

              return (
                <TableRow key={b.id}>
                  {/* Product */}
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{b.productName || 'Product'}</span>
                        {isLow && <Badge variant="warning" size="sm">LOW STOCK</Badge>}
                      </div>
                    </div>
                  </TableCell>

                  {/* Brand */}
                  {user?.role !== 'CLIENT_ADMIN' && (
                    <TableCell>
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200/60">
                        {b.brand || 'Generic'}
                      </span>
                    </TableCell>
                  )}

                  {/* Category */}
                  <TableCell>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200/60">
                      {b.categoryName || 'General'}
                    </span>
                  </TableCell>

                  {/* Location */}
                  <TableCell className="text-slate-600 text-xs">
                    {b.locationName || 'Main Store'}
                  </TableCell>

                  {/* Batch / Lot */}
                  <TableCell mono>
                    {b.batchNumber ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200/80 text-[11px] font-medium">
                        {b.batchNumber}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-mono">—</span>
                    )}
                  </TableCell>

                  {/* Ready to Send (Available) */}
                  <TableCell align="right" numeric className="text-emerald-700 font-bold bg-emerald-50/20">
                    {available.toLocaleString()}{' '}
                    <span className="text-[10px] text-emerald-600 font-sans font-normal">{b.unit || 'units'}</span>
                  </TableCell>

                  {/* Usable / Good Stock */}
                  <TableCell align="right" numeric className="text-slate-900">
                    {Number(b.usableQty).toLocaleString()}{' '}
                    <span className="text-[10px] text-slate-400 font-sans font-normal">{b.unit || 'units'}</span>
                  </TableCell>

                  {/* Reserved */}
                  <TableCell align="right" numeric className="text-amber-700 font-medium">
                    {Number(b.reservedQty).toLocaleString()}{' '}
                    <span className="text-[10px] text-slate-400 font-sans font-normal">{b.unit || 'units'}</span>
                  </TableCell>

                  {/* Quarantine (Damaged + Expired) */}
                  <TableCell align="right" numeric className="text-rose-600">
                    {Number(b.damagedQty) + Number(b.expiredQty) > 0 ? (
                      <span className="font-semibold">
                        {(Number(b.damagedQty) + Number(b.expiredQty)).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}{' '}
                    <span className="text-[10px] text-slate-400 font-sans font-normal">{b.unit || 'units'}</span>
                  </TableCell>

                  {/* Physical Total */}
                  <TableCell align="right" numeric className="font-bold text-slate-900">
                    {physical.toLocaleString()}{' '}
                    <span className="text-[10px] text-slate-500 font-sans font-normal">{b.unit || 'units'}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Batch Pagination Toolbar */}
        {batchTotalPages > 1 && (
          <div className="py-2.5 px-4 bg-white border border-slate-200 border-t-0 rounded-b-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 shadow-2xs">
            <div className="flex items-center gap-3">
              <div>
                Showing <span className="font-semibold text-slate-700">{(batchActivePage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-semibold text-slate-700">{Math.min(batchActivePage * pageSize, filteredBalances.length)}</span> of{' '}
                <span className="font-semibold text-slate-700">{filteredBalances.length}</span> batch records
              </div>
              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                <span className="text-slate-500">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-0.5 rounded border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  {[10, 15, 25, 50].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={batchActivePage <= 1}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
                title="First Page"
              >
                «
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={batchActivePage <= 1}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
              >
                Previous
              </button>
              <span className="px-2 text-slate-600 font-medium">
                Page {batchActivePage} of {batchTotalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(batchTotalPages, p + 1))}
                disabled={batchActivePage >= batchTotalPages}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(batchTotalPages)}
                disabled={batchActivePage >= batchTotalPages}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
                title="Last Page"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export default InventoryTable;
