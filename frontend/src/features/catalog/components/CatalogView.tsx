'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { invalidation } from '@/lib/query/invalidation';
import { useAuth } from '@/features/auth/auth.store';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { DataTable, ColumnDef } from '@/components/ui/DataTable';
import { ErrorState } from '@/components/feedback/ErrorState';
import { catalogService } from '../catalog.service';
import { CatalogProduct, CategoryDto } from '../catalog.types';
import { inventoryService } from '@/features/inventory/inventory.service';
import { UnitsDirectory } from './UnitsDirectory';

type CatalogTab = 'PRODUCTS' | 'TAXONOMY' | 'UNITS';

export function CatalogView() {
  const { user, role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productIdFromNotification = searchParams.get('productId');
  const queryClient = useQueryClient();
  const attemptedProductLookup = useRef<string | null>(null);
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<CatalogTab>(
    tabParam === 'UNITS' ? 'UNITS' : tabParam === 'TAXONOMY' ? 'TAXONOMY' : 'PRODUCTS'
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [notificationLoadError, setNotificationLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (tabParam === 'UNITS' || tabParam === 'TAXONOMY' || tabParam === 'PRODUCTS') {
      setActiveTab(tabParam as CatalogTab);
    }
  }, [tabParam]);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedKind, setSelectedKind] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Category creation modal/form state
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryParentId, setCategoryParentId] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Brand creation modal state
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [brandParentId, setBrandParentId] = useState('');
  const [brandError, setBrandError] = useState<string | null>(null);

  const canCreate = role === 'SUPER_ADMIN' || role === 'CLIENT_ADMIN';

  // Queries
  const {
    data: products = [],
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.catalog.products(user?.clientId ? `client-${user.clientId}` : 'company'),
    queryFn: () => catalogService.getProducts(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.catalog.categories(user?.clientId ? `client-${user.clientId}` : 'company'),
    queryFn: () => catalogService.getCategories(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: standardUnits = [] } = useQuery({
    queryKey: queryKeys.catalog.units(),
    queryFn: () => catalogService.getStandardUnits(),
    staleTime: 5 * 60 * 1000,
  });

  // Cached inventory balances to display real-time stock without redundant server requests
  const { data: rawBalances = [] } = useQuery({
    queryKey: queryKeys.inventory.balances(user?.id || user?.role),
    queryFn: () => inventoryService.getBalances(),
    staleTime: 5 * 60 * 1000,
  });

  const stockByProductId = useMemo(() => {
    const map = new Map<
      string,
      {
        availableQty: number;
        usableQty: number;
        reservedQty: number;
        damagedQty: number;
        expiredQty: number;
        physicalQty: number;
        unit?: string;
      }
    >();
    if (Array.isArray(rawBalances)) {
      for (const b of rawBalances) {
        const existing = map.get(b.productId) || {
          availableQty: 0,
          usableQty: 0,
          reservedQty: 0,
          damagedQty: 0,
          expiredQty: 0,
          physicalQty: 0,
          unit: b.unit,
        };
        existing.availableQty += Number(b.availableQty || 0);
        existing.usableQty += Number(b.usableQty || 0);
        existing.reservedQty += Number(b.reservedQty || 0);
        existing.damagedQty += Number(b.damagedQty || 0);
        existing.expiredQty += Number(b.expiredQty || 0);
        existing.physicalQty += Number(b.physicalQty || 0);
        if (!existing.unit && b.unit) existing.unit = b.unit;
        map.set(b.productId, existing);
      }
    }
    return map;
  }, [rawBalances]);

  useEffect(() => {
    if (!productIdFromNotification || isLoading) return;
    const cachedProduct = products.find((product) => product.id === productIdFromNotification);
    if (cachedProduct) {
      const requiresReview = role === 'SUPER_ADMIN' && cachedProduct.status === 'PENDING_APPROVAL';
      window.setTimeout(() => {
        if (requiresReview) setSelectedStatus('PENDING_APPROVAL');
        setSelectedProductId(cachedProduct.id);
      }, 0);
      router.replace(requiresReview ? '/catalog?status=PENDING_APPROVAL' : '/catalog', { scroll: false });
      return;
    }
    if (attemptedProductLookup.current === productIdFromNotification) return;
    attemptedProductLookup.current = productIdFromNotification;
    catalogService.getProductById(productIdFromNotification).then((product) => {
      const key = queryKeys.catalog.products(user?.clientId ? `client-${user.clientId}` : 'company');
      queryClient.setQueryData<CatalogProduct[]>(key, (current = []) =>
        current.some((item) => item.id === product.id) ? current : [...current, product],
      );
      const requiresReview = role === 'SUPER_ADMIN' && product.status === 'PENDING_APPROVAL';
      if (requiresReview) setSelectedStatus('PENDING_APPROVAL');
      setSelectedProductId(product.id);
      router.replace(requiresReview ? '/catalog?status=PENDING_APPROVAL' : '/catalog', { scroll: false });
    }).catch((error: unknown) => {
      setNotificationLoadError(error instanceof Error ? error.message : 'This product request could not be opened. Refresh the catalog and try again.');
    });
  }, [productIdFromNotification, role, isLoading, products, queryClient, router, user?.clientId]);

  // Fast Category lookup
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  // Extract all distinct brands (from products AND from registered brand categories)
  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.brand?.trim()) set.add(p.brand.trim());
    });
    categories.forEach((c) => {
      if (c.parentId && c.name?.trim()) {
        set.add(c.name.trim());
      }
    });
    return Array.from(set).sort();
  }, [products, categories]);

  // Root categories
  const roots = useMemo(
    () =>
      categories.filter(
        (category) =>
          !category.parentId &&
          (category.ownerScope === 'COMPANY' ||
            (category.ownerScope === 'CLIENT' && category.clientId === user?.clientId)),
      ),
    [categories, user?.clientId],
  );

  // Subcategories grouped by parent
  const subcategoriesByParent = useMemo(() => {
    const map = new Map<string, CategoryDto[]>();
    categories.forEach((cat) => {
      if (cat.parentId) {
        const list = map.get(cat.parentId) || [];
        list.push(cat);
        map.set(cat.parentId, list);
      }
    });
    return map;
  }, [categories]);

  // Products count per category
  const productCountByCat = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      if (p.categoryId) {
        counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
        const parent = categoryById.get(p.categoryId)?.parentId;
        if (parent) {
          counts.set(parent, (counts.get(parent) || 0) + 1);
        }
      }
    });
    return counts;
  }, [products, categoryById]);

  // Brands by category
  const brandsByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    products.forEach((p) => {
      if (p.categoryId && p.brand?.trim()) {
        const set = map.get(p.categoryId) || new Set<string>();
        set.add(p.brand.trim());
        map.set(p.categoryId, set);

        const parent = categoryById.get(p.categoryId)?.parentId;
        if (parent) {
          const parentSet = map.get(parent) || new Set<string>();
          parentSet.add(p.brand.trim());
          map.set(parent, parentSet);
        }
      }
    });
    return map;
  }, [products, categoryById]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // 1. Text Search
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const category = categoryById.get(product.categoryId);
        const parent = category?.parentId ? categoryById.get(category.parentId) : undefined;
        const matchesText = [
          product.name,
          product.sku,
          product.brand,
          product.client?.name,
          category?.name,
          parent?.name,
        ].some((val) => val?.toLowerCase().includes(query));
        if (!matchesText) return false;
      }

      // 2. Category Filter
      if (selectedCategory !== 'ALL') {
        const isExact = product.categoryId === selectedCategory;
        const parentId = categoryById.get(product.categoryId)?.parentId;
        const isChild = parentId === selectedCategory;
        if (!isExact && !isChild) return false;
      }

      // 3. Brand Filter
      if (selectedBrand !== 'ALL') {
        if (product.brand !== selectedBrand) return false;
      }

      // 4. Kind Filter
      if (selectedKind !== 'ALL') {
        if (product.kind !== selectedKind) return false;
      }

      // 5. Status Filter
      if (selectedStatus !== 'ALL') {
        const hasPendingVersion = product.versions?.some((v) => v.status === 'PENDING_APPROVAL');
        if (selectedStatus === 'PENDING_APPROVAL') {
          if (product.status !== 'PENDING_APPROVAL' && !hasPendingVersion) return false;
        } else {
          if (product.status !== selectedStatus) return false;
        }
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, selectedBrand, selectedKind, selectedStatus, categoryById]);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    selectedCategory !== 'ALL' ||
    selectedBrand !== 'ALL' ||
    selectedKind !== 'ALL' ||
    selectedStatus !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('ALL');
    setSelectedBrand('ALL');
    setSelectedKind('ALL');
    setSelectedStatus('ALL');
  };

  const selectedProduct = products.find((product) => product.id === selectedProductId) || null;
  const errorMessage = queryError instanceof Error ? queryError.message : null;

  // Mutations
  const createCategory = useMutation({
    mutationFn: () =>
      catalogService.createCategory({
        name: categoryName.trim(),
        parentId: categoryParentId || undefined,
      }),
    onSuccess: async () => {
      await invalidation.afterCatalogMutation(queryClient);
      setCategoryName('');
      setCategoryParentId('');
      setCategoryError(null);
      setShowCategoryForm(false);
    },
    onError: (error) =>
      setCategoryError(error instanceof Error ? error.message : 'Category could not be saved.'),
  });

  const createBrand = useMutation({
    mutationFn: () =>
      catalogService.createCategory({
        name: brandName.trim(),
        parentId: brandParentId || roots[0]?.id || undefined,
      }),
    onSuccess: async () => {
      await invalidation.afterCatalogMutation(queryClient);
      setBrandName('');
      setBrandParentId('');
      setBrandError(null);
      setShowBrandModal(false);
    },
    onError: (error) =>
      setBrandError(error instanceof Error ? error.message : 'Brand could not be saved.'),
  });

  const review = useMutation({
    mutationFn: async ({
      product,
      versionId,
      decision,
      reason,
    }: {
      product: CatalogProduct;
      versionId?: string;
      decision: 'APPROVE' | 'REJECT';
      reason?: string;
    }) => {
      if (versionId) return catalogService.reviewProductVersion(product.id, versionId, { decision, reason });
      return catalogService.reviewProduct(product.id, { decision, reason });
    },
    onSuccess: async () => {
      await invalidation.afterCatalogMutation(queryClient);
      setSelectedProductId(null);
    },
  });

  const handleReview = (product: CatalogProduct, decision: 'APPROVE' | 'REJECT', versionId?: string) => {
    if (decision === 'APPROVE' && !window.confirm(`Approve ${versionId ? 'this product change' : 'this new product'}?`)) return;
    const reason = decision === 'REJECT' ? window.prompt('Why is this product being rejected?') : undefined;
    if (decision === 'REJECT' && !reason?.trim()) return;
    review.mutate({ product, versionId, decision, reason: reason?.trim() });
  };

  const canEdit = (product: CatalogProduct) =>
    role === 'SUPER_ADMIN'
      ? true
      : role === 'CLIENT_ADMIN' && product.ownerScope === 'CLIENT' && product.clientId === user?.clientId;

  const categoryLabel = (product: CatalogProduct) => {
    const category = categoryById.get(product.categoryId);
    if (!category) return product.category?.name || 'Uncategorized';
    const parent = category.parentId ? categoryById.get(category.parentId) : undefined;
    return parent ? `${parent.name} / ${category.name}` : category.name;
  };

  // Switch to products tab filtered by a specific category
  const viewProductsInCategory = (catId: string) => {
    setSelectedCategory(catId);
    setActiveTab('PRODUCTS');
  };

  // Switch to products tab filtered by a specific brand
  const viewProductsInBrand = (brandName: string) => {
    setSelectedBrand(brandName);
    setActiveTab('PRODUCTS');
  };

  // Data Table Columns
  const columns: ColumnDef<CatalogProduct>[] = useMemo(() => {
    const cols: ColumnDef<CatalogProduct>[] = [
      {
        id: 'name',
        header: 'Product & SKU',
        width: role === 'CLIENT_ADMIN' ? '36%' : '26%',
        minWidth: '200px',
        valign: 'top',
        cell: (product) => (
          <div className="space-y-1">
            <span className="font-semibold text-slate-900 block leading-snug hover:text-blue-600 transition-colors">
              {product.name}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {product.sku && (
                <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                  {product.sku}
                </span>
              )}
              {role === 'SUPER_ADMIN' && product.ownerScope === 'CLIENT' && (
                <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-medium">
                  {product.client?.name || 'Client Item'}
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'kind',
        header: 'Kind',
        width: '13%',
        minWidth: '110px',
        valign: 'top',
        cell: (product) => (
          <Badge variant={product.kind === 'MANUFACTURED_PRODUCT' ? 'purple' : 'neutral'} size="sm">
            {product.kind === 'MANUFACTURED_PRODUCT' ? 'Manufactured' : 'Raw Material'}
          </Badge>
        ),
      },
      {
        id: 'category',
        header: 'Category / Hierarchy',
        width: role === 'CLIENT_ADMIN' ? '24%' : '18%',
        minWidth: '140px',
        valign: 'top',
        cell: (product) => {
          const category = categoryById.get(product.categoryId);
          const parent = category?.parentId ? categoryById.get(category.parentId) : undefined;
          return (
            <div className="text-xs leading-tight">
              {parent && <div className="text-[10px] text-slate-400 font-medium">{parent.name}</div>}
              <div className="font-medium text-slate-800">{category?.name || product.category?.name || 'Uncategorized'}</div>
            </div>
          );
        },
      },
    ];

    if (role !== 'CLIENT_ADMIN') {
      cols.push({
        id: 'brand',
        header: 'Brand / Maker',
        width: '14%',
        minWidth: '110px',
        valign: 'top',
        cell: (product) =>
          product.brand ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100/90 text-slate-700 font-medium border border-slate-200/80">
              {product.brand}
            </span>
          ) : (
            <span className="text-slate-400 text-xs italic">—</span>
          ),
      });
    }

    cols.push(
      {
        id: 'status',
        header: 'Status',
        width: '12%',
        minWidth: '110px',
        valign: 'top',
        cell: (product) => {
          const pendingVersion = product.versions?.find((version) => version.status === 'PENDING_APPROVAL');
          return (
            <Badge
              variant={
                pendingVersion || product.status === 'PENDING_APPROVAL'
                  ? 'warning'
                  : product.status === 'REJECTED'
                  ? 'danger'
                  : 'success'
              }
              size="sm"
              withDot={Boolean(pendingVersion || product.status === 'PENDING_APPROVAL')}
            >
              {pendingVersion ? 'Change Pending' : (product.status || 'APPROVED').replaceAll('_', ' ')}
            </Badge>
          );
        },
      },
      {
        id: 'units',
        header: 'Active Units',
        width: '9%',
        minWidth: '90px',
        valign: 'top',
        cell: (product) => {
          const activeUnits = product.units?.filter((u) => u.status !== 'SUPERSEDED') || [];
          const baseUnit =
            product.units?.find((u) => u.isBaseUnit && u.status !== 'SUPERSEDED')?.unitName ||
            product.units?.find((u) => u.isBaseUnit)?.unitName ||
            product.baseUnit ||
            'Units';
          return (
            <div className="text-xs font-mono text-slate-700 leading-snug">
              <span className="font-semibold text-slate-900">{baseUnit}</span>
              {activeUnits.length > 1 && (
                <div className="text-[10px] text-slate-400">
                  +{activeUnits.length - 1} pack {activeUnits.length - 1 === 1 ? 'unit' : 'units'}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'availableStock',
        header: 'Available Stock',
        width: '12%',
        minWidth: '110px',
        valign: 'top',
        cell: (product) => {
          const stock = stockByProductId.get(product.id);
          const available = Number(stock?.availableQty ?? 0);
          const min = Number(product.minQuantity ?? product.minThreshold ?? 0);
          const isOut = available <= 0;
          const isLow = min > 0 && available <= min;
          const unit =
            product.units?.find((u) => u.isBaseUnit && u.status !== 'SUPERSEDED')?.unitName ||
            product.units?.find((u) => u.isBaseUnit)?.unitName ||
            product.baseUnit ||
            stock?.unit ||
            '';

          return (
            <div className="text-xs">
              <span className={`font-mono font-bold block ${
                isOut ? 'text-slate-400' : isLow ? 'text-amber-700' : 'text-slate-900'
              }`}>
                {available} {unit}
              </span>
              <span className={`text-[10px] font-semibold block ${
                isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-emerald-700'
              }`}>
                {isOut ? 'Out of stock' : isLow ? 'Low stock' : 'In stock'}
              </span>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        width: '8%',
        minWidth: '90px',
        align: 'right',
        valign: 'top',
        cell: (product) => {
          const pendingVersion = product.versions?.find((v) => v.status === 'PENDING_APPROVAL');
          return (
            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedProductId(product.id)}
              >
                Inspect
              </Button>
              {canEdit(product) && product.status === 'APPROVED' && !pendingVersion && (
                <Link href={`/catalog/${product.id}/edit`}>
                  <Button variant="secondary" size="sm">
                    Edit
                  </Button>
                </Link>
              )}
            </div>
          );
        },
      },
    );

    return cols;
  }, [categoryById, role, user?.clientId, stockByProductId]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Product Catalogue"
        description={
          role === 'CLIENT_ADMIN'
            ? 'Manage your manufactured product definitions and categories. Stock quantities are shown in Stock & Inventory.'
            : 'Approved product definitions for stock movements. This page lists what can be stocked; current quantities are shown in Stock & Inventory.'
        }
        actions={
          canCreate ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setCategoryParentId('');
                  setShowCategoryForm((open) => !open);
                }}
              >
                {showCategoryForm ? 'Close Category Form' : '+ Add Category'}
              </Button>
              {role !== 'CLIENT_ADMIN' && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setBrandName('');
                    setBrandParentId(roots[0]?.id || '');
                    setBrandError(null);
                    setShowBrandModal(true);
                  }}
                >
                  + Add Brand
                </Button>
              )}
              {role !== 'CLIENT_ADMIN' && (
                <Link href="/catalog/new?kind=RAW_MATERIAL">
                  <Button variant="primary">+ Add Raw Material</Button>
                </Link>
              )}
              {role === 'CLIENT_ADMIN' && (
                <Link href="/catalog/new?kind=MANUFACTURED_PRODUCT">
                  <Button variant="primary">+ Add Manufactured Product</Button>
                </Link>
              )}
            </div>
          ) : (
            <Link href="/inventory">
              <Button variant="secondary">View stock levels</Button>
            </Link>
          )
        }
      />

      {notificationLoadError && (
        <ErrorState message={notificationLoadError} onRetry={() => {
          setNotificationLoadError(null);
          attemptedProductLookup.current = null;
          void refetch();
        }} />
      )}

      {/* View Mode Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('PRODUCTS')}
            className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'PRODUCTS'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>📦 All Catalog Items</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'PRODUCTS' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {filteredProducts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('TAXONOMY')}
            className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'TAXONOMY'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>🏷️ {role === 'CLIENT_ADMIN' ? 'Categories Directory' : 'Categories & Brands Directory'}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'TAXONOMY' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {role === 'CLIENT_ADMIN'
                ? `${categories.length} categories`
                : `${categories.length} categories · ${brands.length} brands`}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('UNITS')}
            className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'UNITS'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>📏 Units of Measure</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'UNITS' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {standardUnits.length} units
            </span>
          </button>
        </div>
      </div>

      {/* Category Creation Card */}
      {showCategoryForm && canCreate && (
        <Card className="max-w-2xl border-blue-200 shadow-sm animate-fade-in">
          <CardHeader>
            <CardTitle>{categoryParentId ? 'Add Subcategory' : role === 'CLIENT_ADMIN' ? 'Add Client Category' : 'Add Company Category'}</CardTitle>
            <CardDescription>
              {categoryParentId
                ? `Creating a nested subcategory under "${categoryById.get(categoryParentId)?.name}".`
                : role === 'CLIENT_ADMIN'
                ? 'Private category scoped to your client organization for manufactured goods.'
                : 'Global category available for company raw materials and inventory classification.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {categoryError}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 items-end">
              <Input
                label="Category Name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                maxLength={100}
                required
                placeholder={role === 'CLIENT_ADMIN' ? 'e.g. Diagnostic Gauges' : 'e.g. Chemical Reagents'}
              />
              <Select
                label="Parent Category (Optional)"
                value={categoryParentId}
                onChange={(e) => setCategoryParentId(e.target.value)}
              >
                <option value="">Top-level category (No parent)</option>
                {roots.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowCategoryForm(false);
                  setCategoryParentId('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={createCategory.isPending}
                disabled={!categoryName.trim()}
                onClick={() => createCategory.mutate()}
              >
                Save Category
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {errorMessage && (
        <ErrorState title="Products could not be loaded" message={errorMessage} onRetry={() => void refetch()} />
      )}

      {/* TAB 1: ALL PRODUCTS VIEW */}
      {activeTab === 'PRODUCTS' && (
        <div className="space-y-4">
          {/* Comprehensive Filter Controls */}
          <Card className="border-slate-200/90 shadow-2xs">
            <CardContent className="p-4 space-y-3">
              <div className={`grid grid-cols-2 sm:grid-cols-2 ${role === 'CLIENT_ADMIN' ? 'lg:grid-cols-4' : 'lg:grid-cols-5'} gap-2.5 sm:gap-3`}>
                {/* Search Input */}
                <div className="relative col-span-2 sm:col-span-2 lg:col-span-1">
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={role === 'CLIENT_ADMIN' ? 'Search name, SKU...' : 'Search name, brand, SKU...'}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
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
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="ALL">All Categories ({categories.length})</option>
                  {roots.map((root) => {
                    const subs = subcategoriesByParent.get(root.id) || [];
                    return (
                      <React.Fragment key={root.id}>
                        <option value={root.id} className="font-semibold text-slate-900">
                          📁 {root.name} ({productCountByCat.get(root.id) || 0})
                        </option>
                        {subs.map((sub) => (
                          <option key={sub.id} value={sub.id} className="text-slate-600">
                            &nbsp;&nbsp;&nbsp;&nbsp;↳ {sub.name} ({productCountByCat.get(sub.id) || 0})
                          </option>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </select>

                {/* Brand Filter */}
                {role !== 'CLIENT_ADMIN' && (
                  <select
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="ALL">All Brands ({brands.length})</option>
                    {brands.map((b) => (
                      <option key={b} value={b}>
                        🏢 {b}
                      </option>
                    ))}
                  </select>
                )}

                {/* Kind Filter */}
                <select
                  value={selectedKind}
                  onChange={(e) => setSelectedKind(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="ALL">All Product Kinds</option>
                  <option value="RAW_MATERIAL">Raw Materials</option>
                  <option value="MANUFACTURED_PRODUCT">Manufactured Products</option>
                </select>

                {/* Status Filter */}
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>

              {/* Active Filters Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-400 font-medium">Active Filters:</span>
                  {!hasActiveFilters && (
                    <span className="text-slate-400 italic">None (showing all items)</span>
                  )}

                  {searchTerm.trim() && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px]">
                      Search: &ldquo;{searchTerm}&rdquo;
                      <button onClick={() => setSearchTerm('')} className="hover:text-blue-900 cursor-pointer">✕</button>
                    </span>
                  )}

                  {selectedCategory !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px]">
                      Category: {categoryById.get(selectedCategory)?.name || selectedCategory}
                      <button onClick={() => setSelectedCategory('ALL')} className="hover:text-blue-900 cursor-pointer">✕</button>
                    </span>
                  )}

                  {role !== 'CLIENT_ADMIN' && selectedBrand !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px]">
                      Brand: {selectedBrand}
                      <button onClick={() => setSelectedBrand('ALL')} className="hover:text-blue-900 cursor-pointer">✕</button>
                    </span>
                  )}

                  {selectedKind !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px]">
                      Kind: {selectedKind === 'MANUFACTURED_PRODUCT' ? 'Manufactured' : 'Raw Material'}
                      <button onClick={() => setSelectedKind('ALL')} className="hover:text-blue-900 cursor-pointer">✕</button>
                    </span>
                  )}

                  {selectedStatus !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px]">
                      Status: {selectedStatus.replaceAll('_', ' ')}
                      <button onClick={() => setSelectedStatus('ALL')} className="hover:text-blue-900 cursor-pointer">✕</button>
                    </span>
                  )}

                  {hasActiveFilters && (
                    <button
                      onClick={resetFilters}
                      className="text-xs text-rose-600 hover:text-rose-800 font-medium underline ml-2 cursor-pointer"
                    >
                      Reset All
                    </button>
                  )}
                </div>

                <div className="text-slate-500 font-mono text-[11px]">
                  Showing <strong className="text-slate-900">{filteredProducts.length}</strong> of{' '}
                  <strong className="text-slate-900">{products.length}</strong> catalog items
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Full-Width Paginated Data Table */}
          <DataTable
            data={filteredProducts}
            columns={columns}
            keyExtractor={(product) => product.id}
            isLoading={isLoading}
            loadingMessage="Loading catalog inventory..."
            minWidth="min-w-[920px]"
            emptyState={{
              title: products.length ? 'No matching products' : 'Catalog is empty',
              description: products.length
                ? 'Try adjusting your search query or clearing one of the filters.'
                : 'No items recorded in the product catalog yet.',
              action: hasActiveFilters ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Clear Filters
                </Button>
              ) : undefined,
            }}
            pagination={{
              pageSize: 15,
              pageSizeOptions: [10, 25, 50],
            }}
            onRowClick={(product) => setSelectedProductId(product.id)}
          />
        </div>
      )}

      {/* TAB 2: CATEGORIES & BRANDS DIRECTORY VIEW */}
      {activeTab === 'TAXONOMY' && (
        <div className="space-y-6">
          {/* Top Overview Cards */}
          <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4`}>
            <Card className="bg-gradient-to-br from-blue-50/70 to-white border-blue-200/80 shadow-2xs">
              <CardContent className="p-3 sm:p-4">
                <div className="text-[11px] sm:text-xs font-semibold text-blue-900">Total Categories</div>
                <div className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">
                  {categories.length}{' '}
                  <span className="text-[10px] sm:text-xs font-normal text-slate-500">
                    ({roots.length} top, {categories.length - roots.length} sub)
                  </span>
                </div>
                <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-slate-500 truncate">Taxonomy hierarchy</p>
              </CardContent>
            </Card>

            {role !== 'CLIENT_ADMIN' && (
              <Card className="bg-gradient-to-br from-indigo-50/70 to-white border-indigo-200/80 shadow-2xs">
                <CardContent className="p-3 sm:p-4">
                  <div className="text-[11px] sm:text-xs font-semibold text-indigo-900">Registered Brands</div>
                  <div className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">
                    {brands.length} <span className="text-[10px] sm:text-xs font-normal text-slate-500">brands</span>
                  </div>
                  <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-slate-500 truncate">Suppliers &amp; makers</p>
                </CardContent>
              </Card>
            )}

            <Card className={`bg-gradient-to-br from-emerald-50/70 to-white border-emerald-200/80 shadow-2xs ${role !== 'CLIENT_ADMIN' ? 'col-span-2 sm:col-span-1' : ''}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="text-[11px] sm:text-xs font-semibold text-emerald-900">Catalog Coverage</div>
                <div className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">
                  {products.length} <span className="text-[10px] sm:text-xs font-normal text-slate-500">products</span>
                </div>
                <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-slate-500 truncate">Active items cataloged</p>
              </CardContent>
            </Card>
          </div>

          {/* Categories Hierarchy Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Category Hierarchy &amp; Classifications</h3>
                <p className="text-xs text-slate-500">Browse categories and drill down into their subcategories and products.</p>
              </div>

              {canCreate && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto justify-center min-h-[38px] shrink-0"
                  onClick={() => {
                    setCategoryParentId('');
                    setShowCategoryForm(true);
                  }}
                >
                  + Add Top-Level Category
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roots.map((root) => {
                const subs = subcategoriesByParent.get(root.id) || [];
                const rootProductCount = productCountByCat.get(root.id) || 0;
                const rootBrands = Array.from(brandsByCategory.get(root.id) || []);

                return (
                  <Card key={root.id} className="border-slate-200 hover:border-slate-300 transition-all">
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <CardTitle className="text-sm font-bold text-slate-900 break-words">
                              📁 {root.name}
                            </CardTitle>
                            <Badge variant={root.ownerScope === 'COMPANY' ? 'primary' : 'purple'} size="sm" className="shrink-0">
                              {root.ownerScope}
                            </Badge>
                          </div>
                          <CardDescription className="mt-0.5 text-xs">
                            {rootProductCount} {rootProductCount === 1 ? 'product' : 'products'} cataloged
                          </CardDescription>
                        </div>

                        <Button
                          variant="secondary"
                          size="sm"
                          className="shrink-0 min-h-[34px] text-xs px-3"
                          onClick={() => viewProductsInCategory(root.id)}
                        >
                          Browse →
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 pt-2 text-xs">
                      {/* Subcategories */}
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            {role === 'CLIENT_ADMIN' ? 'Subcategories' : 'Subcategories & Brands'} ({subs.length})
                          </span>
                          {canCreate && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setCategoryParentId(root.id);
                                  setShowCategoryForm(true);
                                }}
                                className="inline-flex items-center px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-[11px] font-semibold transition-colors min-h-[30px] cursor-pointer"
                              >
                                + Subcategory
                              </button>
                              {role !== 'CLIENT_ADMIN' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBrandParentId(root.id);
                                    setBrandName('');
                                    setBrandError(null);
                                    setShowBrandModal(true);
                                  }}
                                  className="inline-flex items-center px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-[11px] font-semibold transition-colors min-h-[30px] cursor-pointer"
                                >
                                  + Add Brand
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {subs.length === 0 ? (
                          <div className="text-slate-400 italic text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100">
                            No subcategories defined yet.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {subs.map((sub) => {
                              const subCount = productCountByCat.get(sub.id) || 0;
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => viewProductsInCategory(sub.id)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 hover:border-blue-200 transition-all cursor-pointer text-xs"
                                  title={`View products in ${sub.name}`}
                                >
                                  <span>↳ {sub.name}</span>
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-white text-slate-500 border border-slate-200">
                                    {subCount}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Associated Brands in this category */}
                      {role !== 'CLIENT_ADMIN' && rootBrands.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                            Associated Brands ({rootBrands.length})
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {rootBrands.map((b) => (
                              <button
                                key={b}
                                onClick={() => viewProductsInBrand(b)}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded text-[11px] transition-colors cursor-pointer border border-slate-200/60"
                              >
                                {b}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Brands Directory Section */}
          {role !== 'CLIENT_ADMIN' && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Brands &amp; Manufacturers Directory</h3>
                  <p className="text-xs text-slate-500">Every brand recognized in your warehouse inventory.</p>
                </div>
                {canCreate && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-auto justify-center min-h-[38px] shrink-0"
                    onClick={() => {
                      setBrandName('');
                      setBrandParentId(roots[0]?.id || '');
                      setBrandError(null);
                      setShowBrandModal(true);
                    }}
                  >
                    + Add Brand
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {brands.map((brandName) => {
                  const count = products.filter((p) => p.brand === brandName).length;
                  return (
                    <button
                      key={brandName}
                      onClick={() => viewProductsInBrand(brandName)}
                      className="p-3 bg-white hover:bg-slate-50/80 rounded-xl border border-slate-200/90 text-left transition-all group hover:border-blue-400 hover:shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 text-slate-400 group-hover:text-blue-600 text-xs font-semibold">
                        <span>🏢</span>
                        <span className="truncate text-slate-900 group-hover:text-blue-700 font-bold">
                          {brandName}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 font-mono">
                        {count} {count === 1 ? 'item' : 'items'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: UNITS OF MEASURE DIRECTORY */}
      {activeTab === 'UNITS' && <UnitsDirectory />}

      {/* Product Detail & Inspection Modal */}
      <Modal
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProductId(null)}
        title={selectedProduct?.name || 'Product Specifications'}
        maxWidth="2xl"
      >
        {selectedProduct && (
          <div className="space-y-4 text-xs">
            {/* Top Product Tags & Category Breadcrumb */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="space-y-0.5">
                <span className="text-[11px] text-slate-500 font-medium">Category Hierarchy:</span>
                <div className="font-semibold text-slate-900 text-xs">
                  {categoryLabel(selectedProduct)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={selectedProduct.kind === 'MANUFACTURED_PRODUCT' ? 'purple' : 'neutral'}>
                  {selectedProduct.kind === 'MANUFACTURED_PRODUCT' ? 'Manufactured Item' : 'Raw Material'}
                </Badge>
                {selectedProduct.brand && role !== 'CLIENT_ADMIN' && (
                  <span className="px-2 py-0.5 rounded bg-white text-slate-700 font-medium border border-slate-200 text-xs">
                    {selectedProduct.brand}
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {selectedProduct.description && (
              <p className="text-slate-600 leading-relaxed bg-slate-50/60 p-3 rounded-lg border border-slate-100">
                {selectedProduct.description}
              </p>
            )}

            {/* Real-time Available Stock Card */}
            {(() => {
              const stock = stockByProductId.get(selectedProduct.id);
              const available = Number(stock?.availableQty ?? 0);
              const usable = Number(stock?.usableQty ?? 0);
              const reserved = Number(stock?.reservedQty ?? 0);
              const damaged = Number(stock?.damagedQty ?? 0);
              const expired = Number(stock?.expiredQty ?? 0);
              const minThreshold = Number(selectedProduct.minQuantity ?? selectedProduct.minThreshold ?? 0);
              const isOut = available <= 0;
              const isLow = minThreshold > 0 && available <= minThreshold;
              const baseUnitName =
                selectedProduct.units?.find((u) => u.isBaseUnit && u.status !== 'SUPERSEDED')?.unitName ||
                selectedProduct.baseUnit ||
                'Units';

              return (
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    isOut
                      ? 'bg-rose-50/70 border-rose-200'
                      : isLow
                        ? 'bg-amber-50/70 border-amber-200'
                        : 'bg-emerald-50/60 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                        Warehouse Stock Availability
                      </span>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-bold font-mono text-slate-900">
                          {available}
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          {baseUnitName} available
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <Badge variant={isOut ? 'danger' : isLow ? 'warning' : 'success'}>
                        {isOut
                          ? 'Out of Stock (0 Available)'
                          : isLow
                            ? `Low Stock (${available} / min ${minThreshold})`
                            : `In Stock (${available} ${baseUnitName})`}
                      </Badge>
                      {minThreshold > 0 && (
                        <p className="text-[10px] text-slate-500 mt-1 font-mono">
                          Low stock threshold: {minThreshold} {baseUnitName}
                        </p>
                      )}
                    </div>
                  </div>

                  {(usable > 0 || reserved > 0 || damaged > 0 || expired > 0) && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-3 text-[11px] text-slate-600 font-mono">
                      <span>Usable: <strong className="text-slate-900">{usable}</strong></span>
                      {reserved > 0 && <span>Reserved: <strong className="text-amber-800">{reserved}</strong></span>}
                      {damaged > 0 && <span>Damaged: <strong className="text-rose-700">{damaged}</strong></span>}
                      {expired > 0 && <span>Expired: <strong className="text-rose-700">{expired}</strong></span>}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50/70 rounded-xl border border-slate-100 text-center">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Available Stock</div>
                <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {stockByProductId.get(selectedProduct.id)?.availableQty ?? 0}{' '}
                  <span className="text-[10px] font-normal text-slate-500">
                    {selectedProduct.units?.find((u) => u.isBaseUnit && u.status !== 'SUPERSEDED')?.unitName ||
                      selectedProduct.baseUnit}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Low Stock Threshold</div>
                <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {selectedProduct.minQuantity ?? selectedProduct.minThreshold ?? 0}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Base Unit</div>
                <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {selectedProduct.units?.find((u) => u.isBaseUnit && u.status !== 'SUPERSEDED')?.unitName ||
                    selectedProduct.baseUnit}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Tracking Mode</div>
                <div className="mt-0.5">
                  <Badge variant="neutral" size="sm">
                    {(selectedProduct.trackingMode || 'NONE').replaceAll('_', ' ')}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Specifications Attributes */}
            {!!selectedProduct.attributes?.length && (
              <div className="space-y-1.5">
                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Technical Specifications
                </h4>
                <div className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200/80 overflow-hidden">
                  {selectedProduct.attributes.map((attr, idx) => (
                    <div key={attr.id || idx} className="flex justify-between py-2 px-3 text-xs">
                      <span className="text-slate-600">{attr.attributeName}</span>
                      <span className="font-semibold text-slate-900 font-mono">
                        {attr.value}
                        {attr.unit ? ` ${attr.unit}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Configured Packaging Units & Conversions */}
            {!!selectedProduct.units?.filter((u) => u.status !== 'SUPERSEDED').length && (
              <div className="space-y-1.5">
                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Configured Packaging Units &amp; Conversion Factors
                </h4>
                <ul className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200/80 overflow-hidden">
                  {selectedProduct.units
                    .filter((u) => u.status !== 'SUPERSEDED')
                    .map((unit, idx) => (
                      <li key={unit.id || idx} className="flex justify-between items-center py-2 px-3 font-mono">
                        <span className="font-semibold text-slate-800">{unit.unitName}</span>
                        <span className="text-slate-500 text-[11px]">
                          {unit.isBaseUnit ? '(Base Stock Unit)' : `= ${unit.conversionToBase} base units`}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {/* Super Admin Approval Controls */}
            {role === 'SUPER_ADMIN' && selectedProduct.status === 'PENDING_APPROVAL' && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-amber-900">
                  This client catalog product proposal is awaiting Super Admin approval.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={review.isPending}
                    onClick={() => handleReview(selectedProduct, 'APPROVE')}
                  >
                    Approve Product
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={review.isPending}
                    onClick={() => handleReview(selectedProduct, 'REJECT')}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {/* Product Version Approvals */}
            {role === 'SUPER_ADMIN' &&
              selectedProduct.versions
                ?.filter((v) => v.status === 'PENDING_APPROVAL')
                .map((version) => (
                  <div key={version.id} className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-amber-900">
                      Product specification change proposal awaiting approval
                    </p>
                    {version.changeReason && (
                      <p className="text-xs text-slate-600 italic">&ldquo;{version.changeReason}&rdquo;</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={review.isPending}
                        onClick={() => handleReview(selectedProduct, 'APPROVE', version.id)}
                      >
                        Approve Change
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={review.isPending}
                        onClick={() => handleReview(selectedProduct, 'REJECT', version.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}

            {/* Footer with Edit and Close */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setSelectedProductId(null)}>
                Close
              </Button>

              {canEdit(selectedProduct) &&
                selectedProduct.status === 'APPROVED' &&
                !selectedProduct.versions?.some((v) => v.status === 'PENDING_APPROVAL') && (
                  <Link href={`/catalog/${selectedProduct.id}/edit`}>
                    <Button variant="primary" size="sm">
                      Edit Specifications
                    </Button>
                  </Link>
                )}
            </div>
          </div>
        )}
      </Modal>

      {/* Register New Brand Modal */}
      <Modal
        isOpen={role !== 'CLIENT_ADMIN' && showBrandModal}
        onClose={() => setShowBrandModal(false)}
        title="Register New Brand / Manufacturer"
        description="Add a recognized laboratory manufacturer, supplier, or proprietary brand to your catalog taxonomy."
      >
        <div className="space-y-4 pt-2">
          {brandError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              {brandError}
            </div>
          )}

          <Input
            label="Brand / Manufacturer Name"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. Beckman Coulter, Bio-Rad, Roche, Labco BioAssay, Merck"
            helperText="The trade brand or manufacturer name printed on product labels."
          />

          <Select
            label="Category for this Brand"
            value={brandParentId}
            onChange={(e) => setBrandParentId(e.target.value)}
            required
          >
            <option value="">Select a main category</option>
            {roots.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </Select>

          <p className="text-[11px] text-slate-500">
            Brands are registered under a primary category in the catalog taxonomy and become immediately selectable for products and directory browsing.
          </p>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowBrandModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={createBrand.isPending}
              disabled={!brandName.trim() || !brandParentId || createBrand.isPending}
              onClick={() => createBrand.mutate()}
            >
              Save Brand
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default CatalogView;
