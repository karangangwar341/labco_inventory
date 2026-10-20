'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { requestsService } from '../requests.service';
import type { CreateStockRequestPayload } from '../requests.types';
import { catalogService } from '@/features/catalog/catalog.service';
import { CatalogProduct } from '@/features/catalog/catalog.types';
import { inventoryService } from '@/features/inventory/inventory.service';
import { StockLocationDto } from '@/types/api';
import { useAuth } from '@/features/auth/auth.store';
import { queryKeys } from '@/lib/query/query-keys';
import { authService } from '@/features/auth/auth.service';
import type { CategoryDto } from '@/types/api';

type Direction = 'STOCK_IN' | 'STOCK_OUT';
type RequestLineDraft = {
  // These two fields only drive the cascading form selectors and are excluded from the API payload.
  categoryId: string;
  subcategoryId: string;
  productId: string;
  unitId: string;
  quantity: string;
  batchNumber: string;
  expiryDate: string;
};

const blankLine = (): RequestLineDraft => ({
  categoryId: '',
  subcategoryId: '',
  productId: '',
  unitId: '',
  quantity: '',
  batchNumber: '',
  expiryDate: '',
});

function isStockInType(value: string | null): value is Direction {
  return value === 'STOCK_IN' || value === 'STOCK_OUT';
}

export function CreateRequestForm() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const userId = user?.id;
  const clientId = user?.clientId;
  const [direction, setDirection] = useState<Direction>(() => (user?.role === 'CLIENT_ADMIN' ? 'STOCK_IN' : 'STOCK_OUT'));
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [stockedProductIds, setStockedProductIds] = useState<Set<string>>(new Set());
  const [availableByProduct, setAvailableByProduct] = useState<Record<string, number>>({});
  const [balancesByProduct, setBalancesByProduct] = useState<Record<string, Awaited<ReturnType<typeof inventoryService.getBalances>>>>({});
  const [stockLoadedForLocation, setStockLoadedForLocation] = useState('');
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [locations, setLocations] = useState<StockLocationDto[]>([]);
  const [lines, setLines] = useState<RequestLineDraft[]>([blankLine()]);
  const [locationId, setLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'GRID' | 'CARDS'>('GRID');

  const totalRequestedUnits = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [lines]);

  const distinctProductsCount = useMemo(() => {
    return new Set(lines.map((l) => l.productId).filter(Boolean)).size;
  }, [lines]);

  const isWarehouseUser = user?.role === 'STORE_ADMIN' || user?.role === 'SUPER_ADMIN';
  const isDispatch = direction === 'STOCK_OUT' && isWarehouseUser;

  const targetLocations = useMemo(() => {
    if (user?.role === 'CLIENT_ADMIN') return locations.filter((location) => location.locationType === 'CLIENT');
    if (user?.role === 'STORE_ADMIN') return locations.filter((location) => location.locationType === 'WAREHOUSE');
    return locations;
  }, [locations, user?.role]);

  const sourceLocations = useMemo(() => {
    if (user?.role === 'CLIENT_ADMIN') return locations.filter((location) => location.locationType === 'CLIENT');
    return locations.filter((location) => location.locationType === 'WAREHOUSE');
  }, [locations, user?.role]);

  const dispatchTargets = useMemo(
    () => locations.filter((location) => location.locationType === 'CLIENT'),
    [locations],
  );

  const availableLocations = direction === 'STOCK_IN' ? targetLocations : sourceLocations;
  const selectableProducts = useMemo(
    () => direction === 'STOCK_OUT'
      ? products.filter((product) => stockedProductIds.has(product.id))
      : products,
    [direction, products, stockedProductIds],
  );
  const topLevelCategories = useMemo(
    () => categories.filter((category) => !category.parentId),
    [categories],
  );
  const categoriesForLine = (categoryId: string) => categories.filter((category) => category.parentId === categoryId);
  const productsForLine = (line: RequestLineDraft) => selectableProducts.filter((product) => {
    const productCategory = categories.find((category) => category.id === product.categoryId) ?? product.category;
    if (line.subcategoryId) return product.categoryId === line.subcategoryId;
    if (!line.categoryId) return true;
    return product.categoryId === line.categoryId || productCategory?.parentId === line.categoryId;
  });
  const selectedProductForLine = (line: RequestLineDraft) => products.find((product) => product.id === line.productId);

  const loadFormOptions = useCallback(async () => {
    setIsLoading(true);
    setFormError(null);
    try {
      const scope = clientId ? `client-${clientId}` : 'company';
      const bootstrap = userId
        ? await queryClient.fetchQuery({
            queryKey: queryKeys.session.bootstrap(userId),
            queryFn: () => authService.getBootstrap(),
            staleTime: 5 * 60 * 1000,
          })
        : undefined;
      const [productData, categoryData, locationData] = bootstrap
        ? [
            bootstrap.products.map((product) => ({
              ...product,
              kind: product.kind as CatalogProduct['kind'],
              trackingMode: product.trackingMode as CatalogProduct['trackingMode'],
              baseUnit: product.units.find((unit) => unit.isBaseUnit)?.unitName ?? '',
              minThreshold: Number(product.minQuantity),
              isActive: true,
              categoryName: product.category.name,
              units: product.units.map((unit) => ({ ...unit, status: 'ACTIVE' as const })),
            })) as CatalogProduct[],
            bootstrap.categories,
            bootstrap.locations,
          ]
        : await Promise.all([
            queryClient.fetchQuery({
              queryKey: queryKeys.catalog.products(scope),
              queryFn: () => catalogService.getProducts(),
              staleTime: 5 * 60 * 1000,
            }),
            queryClient.fetchQuery({
              queryKey: queryKeys.catalog.categories(scope),
              queryFn: () => catalogService.getCategories(),
              staleTime: 5 * 60 * 1000,
            }),
            queryClient.fetchQuery({
              queryKey: queryKeys.inventory.locations(userId),
              queryFn: () => inventoryService.getLocations(),
              staleTime: 5 * 60 * 1000,
            }),
          ]);
      const approvedProducts = productData.filter((product) => product.status === 'APPROVED');
      setProducts(approvedProducts);
      setCategories(categoryData as CategoryDto[]);
      setLocations(locationData);

      const editId = new URLSearchParams(window.location.search).get('edit');
      if (editId) {
        const draft = await requestsService.getRequestById(editId);
        if (draft.status !== 'DRAFT') {
          throw new Error('Only an unsent draft can be edited.');
        }
        const requestType = draft.requestType || draft.type || '';
        setEditingDraftId(draft.id);
        setDirection(requestType === 'STOCK_IN' ? 'STOCK_IN' : 'STOCK_OUT');
        setLocationId(draft.sourceLocationId || draft.locationId || draft.destinationLocationId || '');
        setDestinationLocationId(draft.destinationLocationId || '');
        setSourceType(draft.sourceType || '');
        setReason(draft.reason || draft.notes || '');
        setLines(draft.lines.map((line) => {
          const product = productData.find((option) => option.id === line.productId);
          const category = categoryData.find((option) => option.id === product?.categoryId);
          return {
            categoryId: category?.parentId || category?.id || '',
            subcategoryId: category?.parentId ? category.id : '',
            productId: line.productId,
            unitId: line.unitId || '',
            quantity: String(line.quantity),
            batchNumber: line.batchNumber || '',
            expiryDate: line.expiryDate ? new Date(line.expiryDate).toISOString().slice(0, 10) : '',
          };
        }));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not load products and locations.');
    } finally {
      setIsLoading(false);
    }
  }, [clientId, queryClient, userId]);

  useEffect(() => {
    const requestedDirection = searchParams.get('type');
    if (user?.role === 'CLIENT_ADMIN') {
      setDirection('STOCK_IN');
      void loadFormOptions();
      return;
    }
    if (isStockInType(requestedDirection)) setDirection(requestedDirection);
    void loadFormOptions();
  }, [loadFormOptions, router, searchParams, user?.role]);

  useEffect(() => {
    if (!availableLocations.some((location) => location.id === locationId)) {
      setLocationId(availableLocations[0]?.id || '');
    }
  }, [availableLocations, locationId]);

  useEffect(() => {
    if (direction !== 'STOCK_OUT' || !locationId) {
      setStockedProductIds(new Set());
      setIsLoadingStock(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingStock(true);
    setStockLoadedForLocation('');
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    const balanceFilters = isSuperAdmin ? { locationId, limit: 500 } : undefined;
    void queryClient.fetchQuery({
      // Store and client APIs are scoped to the signed-in user's assigned location,
      // so share the exact cache entry used by Stock & Inventory. Super Admins
      // choose a source warehouse and therefore need a separate location cache.
      queryKey: queryKeys.inventory.balances(userId, balanceFilters),
      queryFn: () => inventoryService.getBalances(balanceFilters),
      staleTime: 2 * 60 * 1000,
    }).then((balances) => {
      if (!isCurrent) return;
      const availability = balances.reduce<Record<string, number>>((totals, balance) => {
        totals[balance.productId] = (totals[balance.productId] || 0) + Number(balance.availableQty ?? 0);
        return totals;
      }, {});
      const balancesByProductId = balances.reduce<typeof balancesByProduct>((grouped, balance) => {
        (grouped[balance.productId] ||= []).push(balance);
        return grouped;
      }, {});
      setAvailableByProduct(availability);
      setBalancesByProduct(balancesByProductId);
      setStockedProductIds(new Set(Object.entries(availability).filter(([, quantity]) => quantity > 0).map(([id]) => id)));
      setStockLoadedForLocation(locationId);
    }).catch((error) => {
      if (!isCurrent) return;
      setStockedProductIds(new Set());
      setAvailableByProduct({});
      setBalancesByProduct({});
      setStockLoadedForLocation(locationId);
      setFormError(error instanceof Error ? error.message : 'Could not load available stock.');
    }).finally(() => {
      if (isCurrent) setIsLoadingStock(false);
    });

    return () => { isCurrent = false; };
  }, [direction, locationId, queryClient, user?.role, userId]);

  useEffect(() => {
    if (direction !== 'STOCK_OUT' || isLoadingStock || stockLoadedForLocation !== locationId) return;
    setLines((current) => current.map((line) => (
      !line.productId
        ? line
        : !stockedProductIds.has(line.productId)
          ? { ...line, productId: '', unitId: '', quantity: '', batchNumber: '', expiryDate: '' }
          : (() => {
              const product = products.find((option) => option.id === line.productId);
              if (!product || (product.trackingMode !== 'BATCH_ONLY' && product.trackingMode !== 'BOTH')) return line;
              const availableLots = (balancesByProduct[product.id] || []).filter(
                (balance) => balance.batchNumber && Number(balance.availableQty) > 0,
              );
              if (line.batchNumber && availableLots.some((balance) => balance.batchNumber === line.batchNumber)) return line;
              return availableLots.length === 1
                ? { ...line, batchNumber: availableLots[0].batchNumber! }
                : line.batchNumber
                  ? { ...line, batchNumber: '' }
                  : line;
            })()
    )));
  }, [balancesByProduct, direction, isLoadingStock, locationId, products, stockLoadedForLocation, stockedProductIds]);

  useEffect(() => {
    if (!dispatchTargets.some((location) => location.id === destinationLocationId)) {
      setDestinationLocationId(dispatchTargets[0]?.id || '');
    }
  }, [dispatchTargets, destinationLocationId]);

  const updateLine = (index: number, changes: Partial<RequestLineDraft>) => {
    setLines((current) => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, ...changes } : line,
    ));
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((option) => option.id === productId);
    const category = categories.find((option) => option.id === product?.categoryId) ?? product?.category;
    const baseUnit = product?.units?.find((unit) => unit.isBaseUnit && unit.status !== 'SUPERSEDED');
    const availableLots = product && (product.trackingMode === 'BATCH_ONLY' || product.trackingMode === 'BOTH')
      ? (balancesByProduct[product.id] || []).filter(
          (balance) => balance.batchNumber && Number(balance.availableQty) > 0,
        )
      : [];
    updateLine(index, {
      categoryId: category?.parentId || category?.id || '',
      subcategoryId: category?.parentId ? category.id : '',
      productId,
      unitId: baseUnit?.id || '',
      batchNumber: direction === 'STOCK_OUT' && availableLots.length === 1
        ? availableLots[0].batchNumber!
        : '',
      expiryDate: '',
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSavedDraftId(null);

    if (!user) {
      setFormError('Your session has ended. Sign in again to continue.');
      return;
    }
    if (!locationId) {
      setFormError('No stock location is available for your account. Ask your administrator to check your assignment.');
      return;
    }
    if (isDispatch && !destinationLocationId) {
      setFormError('Choose the client receiving this stock.');
      return;
    }
    if (direction === 'STOCK_IN' && !sourceType) {
      setFormError('Choose where the stock came from.');
      return;
    }

    for (const [index, line] of lines.entries()) {
      const product = selectedProductForLine(line);
      if (!product) {
        setFormError(`Choose a product for item ${index + 1}.`);
        return;
      }
      if (!line.unitId) {
        setFormError(`${product.name} has no active unit configured. Ask your administrator for help.`);
        return;
      }
      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
        setFormError(`Enter a quantity greater than zero for ${product.name}.`);
        return;
      }

      if (direction === 'STOCK_OUT' && (product.trackingMode === 'BATCH_ONLY' || product.trackingMode === 'BOTH')) {
        const availableLots = (balancesByProduct[product.id] || []).filter(
          (balance) => balance.batchNumber && Number(balance.availableQty) > 0,
        );
        if (availableLots.length > 1 && !availableLots.some((balance) => balance.batchNumber === line.batchNumber)) {
          setFormError(`Choose the lot to dispatch for ${product.name}.`);
          return;
        }
      }

      // MOQ enforcement on dispatch/stock-out
      const selectedUnit = product.units?.find((u) => u.id === line.unitId);
      const conversion = Number(selectedUnit?.conversionToBase || 1);
      const requestedBase = Number(line.quantity) * conversion;
      const moq = Number(product.minOrderQuantity || 1);
      if ((direction === 'STOCK_OUT' || isDispatch) && moq > 1 && requestedBase < moq) {
        setFormError(
          `Order quantity for "${product.name}" (${requestedBase} ${product.baseUnit}) is below the Minimum Order Quantity (MOQ) of ${moq} ${product.baseUnit}. Please increase the requested quantity.`,
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const selectedDestination = dispatchTargets.find((location) => location.id === destinationLocationId);
      const payload: CreateStockRequestPayload = {
        requestType: isDispatch ? 'DISPATCH' : direction,
        sourceType: direction === 'STOCK_IN' ? sourceType : undefined,
        sourceLocationId: direction === 'STOCK_OUT' ? locationId : undefined,
        destinationLocationId: direction === 'STOCK_IN' ? locationId : isDispatch ? destinationLocationId : undefined,
        clientId: user.role === 'CLIENT_ADMIN' ? user.clientId || undefined : selectedDestination?.clientId || undefined,
        priority: 'NORMAL',
        reason: reason.trim() || undefined,
        lines: lines.map((line) => {
          const product = selectedProductForLine(line);
          const availableLots = product && (product.trackingMode === 'BATCH_ONLY' || product.trackingMode === 'BOTH')
            ? (balancesByProduct[product.id] || []).filter(
                (balance) => balance.batchNumber && Number(balance.availableQty) > 0,
              )
            : [];
          const batchNumber = line.batchNumber || (
            direction === 'STOCK_OUT' && availableLots.length === 1
              ? availableLots[0].batchNumber
              : undefined
          );
          return {
            productId: line.productId,
            unitId: line.unitId,
            quantity: Number(line.quantity),
            condition: 'USABLE' as const,
            batchNumber: batchNumber?.trim() || undefined,
            expiryDate: line.expiryDate ? new Date(`${line.expiryDate}T00:00:00.000Z`).toISOString() : undefined,
          };
        }),
      };
      const request = editingDraftId
        ? await requestsService.updateRequest(editingDraftId, {
            reason: payload.reason,
            lines: payload.lines,
          })
        : await requestsService.createRequest(payload);

      try {
        const submitted = await requestsService.submitRequest(request.id);
        const isStockOut = direction === 'STOCK_OUT' || isDispatch;
        router.push(`/requests/${submitted.id}${isStockOut ? '?challan=true' : ''}`);
      } catch (error) {
        setSavedDraftId(request.id);
        const detail = error instanceof Error ? error.message : 'The request could not be submitted.';
        setFormError(`Your draft was saved, but it was not sent for approval. ${detail}`);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Your request could not be saved. Check the details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <LoadingState message="Loading products and location assignments…" />;
  if (formError && products.length === 0 && locations.length === 0) {
    return <ErrorState title="Stock request could not be started" message={formError} onRetry={loadFormOptions} />;
  }

  const locationLabel = direction === 'STOCK_IN' ? 'Destination Stock Location' : 'Source Warehouse / Origin';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={editingDraftId
          ? 'Edit Stock Movement'
          : user?.role === 'CLIENT_ADMIN'
            ? 'New Restock Request'
            : direction === 'STOCK_IN'
              ? 'Receive New Stock (Stock In)'
              : 'Send / Dispatch Stock (Stock Out)'}
        description={
          user?.role === 'CLIENT_ADMIN'
            ? 'Request diagnostic products and reagents from Central Supply to restock your clinic or lab inventory.'
            : isDispatch
              ? 'Send items from your warehouse to a client clinic or hospital.'
              : direction === 'STOCK_IN'
                ? 'Record new items arriving at your warehouse from a supplier or delivery truck.'
                : 'Record items being dispatched, used, or transferred out of your store.'
        }
        actions={
          <Link href="/requests" className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
            ← Back to My Requests
          </Link>
        }
      />

      {/* Direction Switcher Segmented Control - Only shown for Warehouse / Store Admins */}
      {user?.role !== 'CLIENT_ADMIN' && (
        <div className="p-1 bg-slate-100 rounded-xl border border-slate-200/80 flex gap-1.5" aria-label="Stock direction">
          {(['STOCK_OUT', 'STOCK_IN'] as const).map((value) => {
            const isSelected = direction === value;
            const isStockIn = value === 'STOCK_IN';
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isSelected}
                disabled={Boolean(editingDraftId)}
                onClick={() => setDirection(value)}
                className={`flex-1 py-3 px-4 text-xs font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-2 ${
                  isSelected
                    ? isStockIn
                      ? 'bg-white text-emerald-800 shadow-sm border border-emerald-300'
                      : 'bg-white text-blue-800 shadow-sm border border-blue-300'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${isSelected ? (isStockIn ? 'bg-emerald-500' : 'bg-blue-600') : 'bg-slate-300'}`} />
                <span>{isStockIn ? '📥 Stock In (Receive New Stock)' : '📤 Stock Out (Dispatch / Send Items)'}</span>
              </button>
            );
          })}
        </div>
      )}

      {formError && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Submission Notice</span>
          </div>
          <p className="pl-6 text-rose-600 leading-relaxed">{formError}</p>
          {savedDraftId && (
            <div className="pl-6 pt-1">
              <Link href={`/requests/${savedDraftId}`} className="font-semibold underline text-rose-700">
                Open Saved Draft #{savedDraftId.slice(0, 8).toUpperCase()} →
              </Link>
            </div>
          )}
        </div>
      )}

      {products.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto font-bold text-sm">!</div>
            <h4 className="text-sm font-semibold text-slate-800">No approved products are available</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              No catalog products currently have approved status. Ask your administrator to review and approve catalog items.
            </p>
          </CardContent>
        </Card>
      ) : availableLocations.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto font-bold text-sm">!</div>
            <h4 className="text-sm font-semibold text-slate-800">No stock location assigned</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Your account has no active warehouse or client facility assignment. Contact Super Admin to configure your location permissions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Choose Location & Source */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">1</span>
                <CardTitle>Step 1: Choose Location &amp; Source</CardTitle>
              </div>
              <CardDescription>
                Where are these items currently located, and where are they going?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                label={locationLabel}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                required
                disabled={Boolean(editingDraftId)}
                helperText="Your operating warehouse or store location."
              >
                {availableLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({location.locationType === 'WAREHOUSE' ? 'Warehouse' : 'Client Store'})
                  </option>
                ))}
              </Select>

              {isDispatch && (
                <Select
                  label="Which Client or Clinic is receiving this?"
                  value={destinationLocationId}
                  onChange={(e) => setDestinationLocationId(e.target.value)}
                  required
                  disabled={Boolean(editingDraftId)}
                  helperText="Choose the hospital or facility receiving these items."
                >
                  {dispatchTargets.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              )}

              {direction === 'STOCK_IN' && (
                <Select
                  label="Where did you receive this stock from?"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  required
                  disabled={Boolean(editingDraftId)}
                  helperText="Select how these items arrived at your store."
                >
                  <option value="">Select origin...</option>
                  <option value="DIRECT_PURCHASE">Supplier Delivery (Purchase Bill / Order)</option>
                  <option value="OPENING_STOCK">Opening Initial Stock</option>
                  <option value="DEPARTMENT_RETURN">Returned from Hospital / Department</option>
                  <option value="DONATION">Manufacturer Sample or Donation</option>
                  <option value="OTHER">Other Delivery</option>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Requested Items */}
          <Card>
            <CardHeader
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setViewMode('GRID')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        viewMode === 'GRID'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>⚡</span>
                      <span>Fast Grid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('CARDS')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        viewMode === 'CARDS'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>📋</span>
                      <span>Cards</span>
                    </button>
                  </div>
                  <span className="text-xs font-mono text-slate-600 font-semibold bg-slate-100 px-2 py-1 rounded-md border border-slate-200/80">
                    {lines.length} Line{lines.length !== 1 ? 's' : ''}
                  </span>
                </div>
              }
            >
              <CardTitle>Requested Products &amp; Quantities</CardTitle>
              <CardDescription>
                {viewMode === 'GRID'
                  ? 'High-speed spreadsheet grid with live stock availability and instant keyboard navigation.'
                  : 'Select products, base units, and batch or expiration lot data.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {viewMode === 'GRID' ? (
                <div className="space-y-3">
                  {/* Grid Quick Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/90 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setLines((curr) => [...curr, blankLine()])}
                        className="text-xs px-2.5 py-1 gap-1"
                      >
                        <span>+</span>
                        <span>Add Row</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setLines((curr) => [...curr, blankLine(), blankLine(), blankLine(), blankLine(), blankLine()])}
                        className="text-xs px-2.5 py-1 gap-1"
                      >
                        <span>+5</span>
                        <span>Add 5 Rows</span>
                      </Button>
                      {lines.some((l) => !l.productId && !l.quantity) && lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines((curr) => {
                            const kept = curr.filter((l) => l.productId || l.quantity);
                            return kept.length ? kept : [blankLine()];
                          })}
                          className="text-[11px] text-slate-500 hover:text-slate-800 font-medium px-2 py-1"
                        >
                          Clear Empty Rows
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-600 font-medium">
                      <span>Products: <strong className="text-slate-900 font-mono">{distinctProductsCount}</strong></span>
                      <span className="text-slate-300">|</span>
                      <span>Total Units: <strong className="text-slate-900 font-mono">{totalRequestedUnits.toLocaleString()}</strong></span>
                    </div>
                  </div>

                  {/* Fast Spreadsheet Table */}
                  <div className="overflow-x-auto border border-slate-200/90 rounded-xl bg-white shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-2 px-2.5 w-8 text-center">#</th>
                          <th className="py-2 px-2.5 min-w-[260px]">Product &amp; Brand</th>
                          <th className="py-2 px-2 w-28 text-center">Stock</th>
                          <th className="py-2 px-2.5 w-24">Quantity</th>
                          <th className="py-2 px-2.5 w-32">Unit</th>
                          <th className="py-2 px-2.5 min-w-[150px]">Batch / Lot</th>
                          <th className="py-2 px-2.5 w-32">Expiry Date</th>
                          <th className="py-2 px-2 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.map((line, index) => {
                          const product = selectedProductForLine(line);
                          const activeUnits = product?.units?.filter((unit) => unit.status !== 'SUPERSEDED') || [];
                          const precision = product?.quantityPrecision ?? 0;
                          const tracksBatch = product?.trackingMode === 'BATCH_ONLY' || product?.trackingMode === 'BOTH';
                          const tracksExpiry = product?.trackingMode === 'EXPIRY_ONLY' || product?.trackingMode === 'BOTH';
                          const selectedUnit = activeUnits.find((unit) => unit.id === line.unitId);
                          const hasCurrentAvailability = !isLoadingStock && stockLoadedForLocation === locationId;
                          const availableLots = product
                            ? (balancesByProduct[product.id] || []).filter(
                                (balance) => balance.batchNumber && Number(balance.availableQty) > 0,
                              )
                            : [];
                          const effectiveBatchNumber = line.batchNumber || (availableLots.length === 1 ? availableLots[0].batchNumber : '');
                          const selectedLot = availableLots.find((balance) => balance.batchNumber === effectiveBatchNumber);
                          const availableBase = product && hasCurrentAvailability
                            ? direction === 'STOCK_OUT' && product.trackingMode === 'BATCH_ONLY' && selectedLot
                              ? Number(selectedLot.availableQty)
                              : availableByProduct[product.id]
                            : undefined;
                          const availableInSelectedUnit = availableBase === undefined
                            ? undefined
                            : availableBase / Number(selectedUnit?.conversionToBase || 1);

                          return (
                            <tr key={index} className="hover:bg-blue-50/20 transition-colors">
                              <td className="py-2 px-2.5 text-center font-mono text-[11px] text-slate-400">
                                {index + 1}
                              </td>
                              <td className="py-2 px-2.5">
                                <select
                                  value={line.productId}
                                  onChange={(e) => handleProductChange(index, e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
                                  required
                                >
                                  <option value="">Select a product...</option>
                                  {selectableProducts.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} {p.brand ? `· ${p.brand}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-2 text-center">
                                {product ? (
                                  availableBase !== undefined ? (
                                    availableBase > 0 ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                                        {availableInSelectedUnit?.toLocaleString(undefined, { maximumFractionDigits: precision }) ?? availableBase} {selectedUnit?.unitName || product.baseUnit}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                        0 avail
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-slate-400 font-mono text-[11px]">—</span>
                                  )
                                ) : (
                                  <span className="text-slate-300 font-mono text-[11px]">—</span>
                                )}
                              </td>
                              <td className="py-2 px-2.5">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step={precision ? 1 / 10 ** precision : 1}
                                  value={line.quantity}
                                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (index === lines.length - 1) {
                                        setLines((curr) => [...curr, blankLine()]);
                                      }
                                    }
                                  }}
                                  required
                                  placeholder="0"
                                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
                                />
                              </td>
                              <td className="py-2 px-2.5">
                                <select
                                  value={line.unitId}
                                  onChange={(e) => updateLine(index, { unitId: e.target.value })}
                                  disabled={!activeUnits.length}
                                  required
                                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
                                >
                                  <option value="">Unit...</option>
                                  {activeUnits.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.unitName} {u.isBaseUnit ? '(Base)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-2.5">
                                {tracksBatch && direction === 'STOCK_OUT' && product ? (
                                  availableLots.length > 0 ? (
                                    <select
                                      value={effectiveBatchNumber}
                                      onChange={(e) => updateLine(index, { batchNumber: e.target.value })}
                                      required={availableLots.length > 1}
                                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
                                    >
                                      {availableLots.length > 1 && <option value="">Choose lot...</option>}
                                      {availableLots.map((lot) => (
                                        <option key={lot.batchNumber} value={lot.batchNumber || ''}>
                                          {lot.batchNumber} ({Number(lot.availableQty)} {product.baseUnit})
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-[11px] text-amber-600 italic">No lots in stock</span>
                                  )
                                ) : tracksBatch ? (
                                  <input
                                    type="text"
                                    value={line.batchNumber}
                                    onChange={(e) => updateLine(index, { batchNumber: e.target.value })}
                                    placeholder="Batch / Lot #"
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
                                  />
                                ) : (
                                  <span className="text-slate-300 font-mono text-[11px] px-2">—</span>
                                )}
                              </td>
                              <td className="py-2 px-2.5">
                                {tracksExpiry || tracksBatch || direction === 'STOCK_IN' ? (
                                  <input
                                    type="date"
                                    value={line.expiryDate}
                                    onChange={(e) => updateLine(index, { expiryDate: e.target.value })}
                                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
                                  />
                                ) : (
                                  <span className="text-slate-300 font-mono text-[11px] px-2">—</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {lines.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setLines((curr) => curr.filter((_, i) => i !== index))}
                                    className="w-6 h-6 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center transition-colors text-xs font-bold"
                                    title="Remove row"
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLines((curr) => [...curr, blankLine()])}
                    className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-xs text-blue-600 hover:bg-blue-50/50 hover:border-blue-400 font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>+</span>
                    <span>Add Another Line (or press Enter in Quantity cell)</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {lines.map((line, index) => {
                    const product = selectedProductForLine(line);
                    const activeUnits = product?.units?.filter((unit) => unit.status !== 'SUPERSEDED') || [];
                    const precision = product?.quantityPrecision ?? 0;
                    const tracksBatch = product?.trackingMode === 'BATCH_ONLY' || product?.trackingMode === 'BOTH';
                    const tracksExpiry = product?.trackingMode === 'EXPIRY_ONLY' || product?.trackingMode === 'BOTH';
                    const selectedUnit = activeUnits.find((unit) => unit.id === line.unitId);
                    const hasCurrentAvailability = !isLoadingStock && stockLoadedForLocation === locationId;
                    const availableLots = product
                      ? (balancesByProduct[product.id] || []).filter(
                          (balance) => balance.batchNumber && Number(balance.availableQty) > 0,
                        )
                      : [];
                    const effectiveBatchNumber = line.batchNumber || (availableLots.length === 1 ? availableLots[0].batchNumber : '');
                    const selectedLot = availableLots.find((balance) => balance.batchNumber === effectiveBatchNumber);
                    const availableBase = product && hasCurrentAvailability
                      ? direction === 'STOCK_OUT' && product.trackingMode === 'BATCH_ONLY' && selectedLot
                        ? Number(selectedLot.availableQty)
                        : availableByProduct[product.id]
                      : undefined;
                    const availableInSelectedUnit = availableBase === undefined
                      ? undefined
                      : availableBase / Number(selectedUnit?.conversionToBase || 1);
                    const quantityHelper = [
                      precision > 0 ? `Up to ${precision} decimal places` : '',
                      direction === 'STOCK_OUT' && availableInSelectedUnit !== undefined
                        ? `${selectedLot ? 'Available in this lot' : 'Available here'}: ${availableInSelectedUnit.toLocaleString(undefined, { maximumFractionDigits: precision })} ${selectedUnit?.unitName || product?.baseUnit || 'units'}`
                        : '',
                    ].filter(Boolean).join(' · ') || undefined;

                    return (
                      <div
                        key={index}
                        className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-3.5 relative transition-all duration-150 hover:border-slate-300"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold font-mono">
                              {index + 1}
                            </span>
                            <span className="text-xs font-semibold text-slate-800">
                              {product ? product.name : `Line Item #${index + 1}`}
                            </span>
                            {product?.trackingMode && product.trackingMode !== 'NONE' && (
                              <Badge variant="neutral" size="sm">
                                {product.trackingMode.replaceAll('_', ' ')}
                              </Badge>
                            )}
                            {product?.minOrderQuantity && Number(product.minOrderQuantity) > 1 && (
                              <Badge variant="purple" size="sm">
                                MOQ: {product.minOrderQuantity} {product.baseUnit}
                              </Badge>
                            )}
                          </div>

                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                              className="text-[11px] font-medium text-rose-600 hover:text-rose-800 flex items-center gap-1 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Remove
                            </button>
                          )}
                        </div>

                        {/* Catalog filters narrow the product list while retaining stock-out availability rules. */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Select
                            label="Category"
                            value={line.categoryId}
                            onChange={(e) => updateLine(index, { categoryId: e.target.value, subcategoryId: '', productId: '', unitId: '', quantity: '', batchNumber: '', expiryDate: '' })}
                          >
                            <option value="">All categories</option>
                            {topLevelCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                          </Select>
                          <Select
                            label="Subcategory / brand"
                            value={line.subcategoryId}
                            onChange={(e) => updateLine(index, { subcategoryId: e.target.value, productId: '', unitId: '', quantity: '', batchNumber: '', expiryDate: '' })}
                            disabled={!line.categoryId || categoriesForLine(line.categoryId).length === 0}
                          >
                            <option value="">All subcategories</option>
                            {categoriesForLine(line.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                          </Select>
                        </div>

                        {/* Product Selector */}
                        <Select
                          label="Product"
                          value={line.productId}
                          onChange={(e) => handleProductChange(index, e.target.value)}
                          required
                        >
                          <option value="">{line.categoryId ? 'Select a product...' : 'Select a category or product...'}</option>
                          {productsForLine(line).map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.brand ? `${option.name} · ${option.brand}` : option.name}
                            </option>
                          ))}
                        </Select>
                        {line.categoryId && productsForLine(line).length === 0 && (
                          <p className="text-[11px] text-slate-500">No approved products match this category{direction === 'STOCK_OUT' ? ' with available stock at this location' : ''}.</p>
                        )}

                        {direction === 'STOCK_OUT' && !isLoadingStock && selectableProducts.length === 0 && (
                          <p className="text-[11px] text-amber-600 font-medium">
                            No available stocked products at this location to dispatch.
                          </p>
                        )}
                        {direction === 'STOCK_OUT' && isLoadingStock && (
                          <p className="text-[11px] text-blue-600">Loading available stock balances…</p>
                        )}

                        {/* Quantity & Unit Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                          <Input
                            label="Quantity"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step={precision ? 1 / 10 ** precision : 1}
                            value={line.quantity}
                            onChange={(e) => updateLine(index, { quantity: e.target.value })}
                            required
                            placeholder="e.g. 100"
                            helperText={quantityHelper}
                          />

                          <Select
                            label="Packaging Unit"
                            value={line.unitId}
                            onChange={(e) => updateLine(index, { unitId: e.target.value })}
                            required
                            disabled={!activeUnits.length}
                          >
                            <option value="">Select unit...</option>
                            {activeUnits.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {unit.unitName} {unit.isBaseUnit ? '(Base)' : ''}
                              </option>
                            ))}
                          </Select>
                        </div>

                        {/* Batch / Expiry Tracking Row */}
                        {(tracksBatch || tracksExpiry || Boolean(line.expiryDate) || Boolean(line.batchNumber)) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                            {tracksBatch && direction === 'STOCK_OUT' && product && (
                              availableLots.length > 0 ? (
                                <Select
                                  label="Batch / Lot to dispatch"
                                  value={effectiveBatchNumber}
                                  onChange={(e) => updateLine(index, { batchNumber: e.target.value })}
                                  required={availableLots.length > 1}
                                >
                                  {availableLots.length > 1 && <option value="">Choose a lot...</option>}
                                  {availableLots.map((balance) => (
                                    <option key={balance.id} value={balance.batchNumber}>
                                      {balance.batchNumber} · {Number(balance.availableQty).toLocaleString()} {balance.unit || product.baseUnit} available
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <p className="text-xs text-slate-500">No lot number is recorded for the available stock.</p>
                              )
                            )}

                            {tracksBatch && direction !== 'STOCK_OUT' && (
                              <Input
                                label="Batch / Lot Number"
                                value={line.batchNumber}
                                onChange={(e) => updateLine(index, { batchNumber: e.target.value })}
                                placeholder="e.g. LOT-2026-X"
                                helperText="Lot trace identifier for quarantine and recall"
                              />
                            )}

                            {(tracksExpiry || Boolean(line.expiryDate)) && (
                              <div className="space-y-1.5 w-full">
                                <label className="text-xs font-medium text-slate-700 block">
                                  Expiration Date
                                </label>
                                <input
                                  type="date"
                                  value={line.expiryDate}
                                  onChange={(e) => updateLine(index, { expiryDate: e.target.value })}
                                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                                />
                                <p className="text-[11px] text-slate-500">Scheduled expiry shelf date</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setLines((current) => [...current, blankLine()])}
                    className="w-full py-2.5 border-dashed"
                  >
                    <svg className="w-4 h-4 mr-1.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    + Add Another Product Line
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Note / Reason */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">3</span>
                <CardTitle>Step 3: Add a Note (Optional)</CardTitle>
              </div>
              <CardDescription>
                Add any helpful note, invoice number, or order details for your administrator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. Regular weekly replenishment, hospital emergency ward order, or invoice #104..."
                helperText={`${reason.length}/500 characters`}
              />
            </CardContent>
          </Card>

          {/* Friendly Guidance Banner */}
          <div className="p-4 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-sm">
              ✓
            </div>
            <div className="text-xs text-slate-700 space-y-1">
              <span className="font-semibold text-slate-900 block">
                {direction === 'STOCK_IN' && user?.role === 'CLIENT_ADMIN'
                  ? 'Record stock that has arrived'
                  : 'What happens when you send this for approval?'}
              </span>
              <p className="leading-relaxed text-slate-600">
                {direction === 'STOCK_OUT'
                  ? 'Available stock is reserved while Super Admin reviews it. After approval, the items are dispatched.'
                  : user?.role === 'CLIENT_ADMIN'
                    ? 'This records stock already received; it does not request a warehouse delivery. Super Admin approval is required before the quantity appears in your stock.'
                    : 'This records items arriving at your warehouse. Super Admin approval is required before they are added to available stock.'}
              </p>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
            <Link href="/requests" className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors">
              ← Cancel and return to list
            </Link>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              disabled={isSubmitting || products.length === 0 || availableLocations.length === 0}
              className="w-full sm:w-auto px-6 py-2.5 font-bold shadow-sm"
            >
              {editingDraftId
                ? 'Save Changes & Send for Approval'
                : direction === 'STOCK_IN' && user?.role === 'CLIENT_ADMIN'
                  ? 'Submit Received Stock for Approval →'
                  : 'Send for Approval →'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default CreateRequestForm;
