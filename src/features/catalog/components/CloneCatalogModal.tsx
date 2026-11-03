'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { catalogService } from '../catalog.service';
import { administrationService } from '@/features/administration/administration.service';
import { invalidation } from '@/lib/query/invalidation';
import type { CatalogProduct, CategoryDto } from '../catalog.types';

interface CloneCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  initialSelectedProductIds?: string[];
  initialSelectedCategoryIds?: string[];
  onSelect?: (productIds: string[], categoryIds: string[]) => void;
  onSuccess?: () => void;
}

export function CloneCatalogModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  initialSelectedProductIds = [],
  initialSelectedCategoryIds = [],
  onSelect,
  onSuccess,
}: CloneCatalogModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'CATEGORIES' | 'PRODUCTS'>('CATEGORIES');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set(initialSelectedProductIds));
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set(initialSelectedCategoryIds));
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Sync initial selection when modal opens or initial selections change
  useEffect(() => {
    if (isOpen) {
      setSelectedProductIds(new Set(initialSelectedProductIds));
      setSelectedCategoryIds(new Set(initialSelectedCategoryIds));
      setError(null);
      setSuccessNotice(null);
    }
  }, [isOpen, initialSelectedProductIds, initialSelectedCategoryIds]);

  // Load all company products and categories
  const { data: allProducts = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ['catalog', 'company-products-for-clone'],
    queryFn: () => catalogService.getProducts(),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  });

  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ['catalog', 'categories-for-clone'],
    queryFn: () => catalogService.getCategories(),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  });

  // Filter only approved company products
  const companyProducts = useMemo(() => {
    return allProducts.filter(
      (p) => p.ownerScope === 'COMPANY' && p.status === 'APPROVED',
    );
  }, [allProducts]);

  // Map category ID to CategoryDto
  const categoryById = useMemo(() => {
    const map = new Map<string, CategoryDto>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  // Map categories to products under them (including products in their subcategories)
  const productsByCategoryId = useMemo(() => {
    const map = new Map<string, CatalogProduct[]>();
    companyProducts.forEach((p) => {
      if (p.categoryId) {
        const list = map.get(p.categoryId) || [];
        list.push(p);
        map.set(p.categoryId, list);

        const parentId = categoryById.get(p.categoryId)?.parentId;
        if (parentId) {
          const parentList = map.get(parentId) || [];
          parentList.push(p);
          map.set(parentId, parentList);
        }
      }
    });
    return map;
  }, [companyProducts, categoryById]);

  // Top level categories
  const rootCategories = useMemo(() => {
    return categories.filter((c) => !c.parentId && c.ownerScope === 'COMPANY');
  }, [categories]);

  // Subcategories grouped by parent
  const subcategoriesByParent = useMemo(() => {
    const map = new Map<string, CategoryDto[]>();
    categories.forEach((c) => {
      if (c.parentId) {
        const list = map.get(c.parentId) || [];
        list.push(c);
        map.set(c.parentId, list);
      }
    });
    return map;
  }, [categories]);

  // Filtered products for PRODUCTS tab
  const filteredProducts = useMemo(() => {
    return companyProducts.filter((p) => {
      if (selectedCategory && p.categoryId !== selectedCategory && categoryById.get(p.categoryId)?.parentId !== selectedCategory) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesBrand = p.brand?.toLowerCase().includes(q);
        const matchesCat = p.category?.name?.toLowerCase().includes(q);
        if (!matchesName && !matchesBrand && !matchesCat) return false;
      }
      return true;
    });
  }, [companyProducts, selectedCategory, searchTerm, categoryById]);

  // Count distinct categories among selected products
  const selectedCategoriesCount = useMemo(() => {
    const catIds = new Set<string>();
    companyProducts.forEach((p) => {
      if (selectedProductIds.has(p.id) && p.categoryId) {
        catIds.add(p.categoryId);
      }
    });
    return catIds.size;
  }, [selectedProductIds, companyProducts]);

  // Toggle single product selection
  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle entire category (including subcategories and any products within)
  const toggleCategory = (catId: string) => {
    const subs = subcategoriesByParent.get(catId) || [];
    const subIds = subs.map((s) => s.id);
    const allRelatedCatIds = [catId, ...subIds];
    const productsInCat = productsByCategoryId.get(catId) || [];

    const isCurrentlySelected = selectedCategoryIds.has(catId);

    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlySelected) {
        allRelatedCatIds.forEach((id) => next.delete(id));
      } else {
        allRelatedCatIds.forEach((id) => next.add(id));
      }
      return next;
    });

    if (productsInCat.length > 0) {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlySelected) {
          productsInCat.forEach((p) => next.delete(p.id));
        } else {
          productsInCat.forEach((p) => next.add(p.id));
        }
        return next;
      });
    }
  };

  // Toggle single subcategory
  const toggleSubcategory = (subId: string, parentId: string) => {
    const productsInSub = productsByCategoryId.get(subId) || [];
    const isCurrentlySelected = selectedCategoryIds.has(subId);

    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlySelected) {
        next.delete(subId);
      } else {
        next.add(subId);
        // Also ensure parent is selected for taxonomy consistency
        next.add(parentId);
      }
      return next;
    });

    if (productsInSub.length > 0) {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlySelected) {
          productsInSub.forEach((p) => next.delete(p.id));
        } else {
          productsInSub.forEach((p) => next.add(p.id));
        }
        return next;
      });
    }
  };

  const handleSelectAllVisibleProducts = () => {
    if (selectedProductIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  // Select all categories (all roots + subcategories) and all company products
  const handleSelectAllCategories = () => {
    const allCatIds = new Set<string>();
    rootCategories.forEach((root) => {
      allCatIds.add(root.id);
      const subs = subcategoriesByParent.get(root.id) || [];
      subs.forEach((sub) => allCatIds.add(sub.id));
    });
    setSelectedCategoryIds(allCatIds);
    setSelectedProductIds(new Set(companyProducts.map((p) => p.id)));
  };

  // Clear all category and product selections
  const handleClearSelection = () => {
    setSelectedCategoryIds(new Set());
    setSelectedProductIds(new Set());
  };

  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  // Clone mutation (used when transferring directly to an existing project)
  const cloneMutation = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('Project ID required for direct transfer.');
      return administrationService.cloneCatalogToProject(
        projectId,
        {
          productIds: Array.from(selectedProductIds),
          categoryIds: Array.from(selectedCategoryIds),
        },
      );
    },
    onSuccess: async (res) => {
      await invalidation.afterCatalogMutation(queryClient);
      const parts: string[] = [];
      if ((res as any).clonedCategoriesCount) {
        parts.push(`${(res as any).clonedCategoriesCount} category(s)`);
      }
      parts.push(`${res.clonedCount} product(s)`);

      setSuccessNotice(
        `Successfully transferred ${parts.join(' and ')} into ${projectName || 'project'} catalog.${
          res.skippedCount > 0 ? ` (${res.skippedCount} already existed)` : ''
        }`,
      );
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setSuccessNotice(null);
        onClose();
      }, 1600);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Catalog transfer failed.');
    },
  });

  const handleConfirm = () => {
    if (onSelect) {
      onSelect(Array.from(selectedProductIds), Array.from(selectedCategoryIds));
      onClose();
    } else if (projectId) {
      cloneMutation.mutate();
    }
  };

  const isPickerMode = Boolean(onSelect);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isPickerMode ? `Choose Products to Seed into ${projectName || 'Project'}` : `Transfer Catalog to ${projectName || 'Project'}`}
      description="Select specific categories or individual products from the company catalog to transfer into this project as manufactured products."
      maxWidth="xl"
    >
      <div className="space-y-3.5 pt-1">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
            {error}
          </div>
        )}

        {successNotice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-semibold flex items-center gap-2">
            <span>✅</span>
            <span>{successNotice}</span>
          </div>
        )}

        {/* View Mode Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('CATEGORIES')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                activeTab === 'CATEGORIES'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Select by Category ({rootCategories.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PRODUCTS')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                activeTab === 'PRODUCTS'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Select by Product ({companyProducts.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {(selectedProductIds.size > 0 || selectedCategoryIds.size > 0) && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs text-slate-500 hover:text-rose-600 font-medium cursor-pointer"
              >
                Clear All
              </button>
            )}
            <Badge variant="primary" size="sm" className="font-semibold text-xs">
              {selectedCategoryIds.size > 0 && selectedProductIds.size > 0
                ? `${selectedCategoryIds.size} Cat, ${selectedProductIds.size} Prod Selected`
                : selectedCategoryIds.size > 0
                  ? `${selectedCategoryIds.size} Selected`
                  : selectedProductIds.size > 0
                    ? `${selectedProductIds.size} Selected`
                    : '0 Selected'}
            </Badge>
          </div>
        </div>

        {/* TAB 1: CATEGORIES VIEW */}
        {activeTab === 'CATEGORIES' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs px-1 text-slate-500">
              <span>Checking a category selects all company products in that classification.</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllCategories}
                  className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                >
                  Select All Categories
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-2xs">
              {isLoadingCategories || isLoadingProducts ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading catalog taxonomy...</div>
              ) : rootCategories.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No company categories found.</div>
              ) : (
                rootCategories.map((root) => {
                  const productsInRoot = productsByCategoryId.get(root.id) || [];
                  const subs = subcategoriesByParent.get(root.id) || [];
                  const selectedInRoot = productsInRoot.filter((p) => selectedProductIds.has(p.id)).length;
                  const isCatExplicitlySelected = selectedCategoryIds.has(root.id);
                  const isAllProductsSelected = productsInRoot.length > 0 && selectedInRoot === productsInRoot.length;
                  const isChecked = isCatExplicitlySelected || isAllProductsSelected;
                  const isPartial = !isChecked && (selectedInRoot > 0 || subs.some((s) => selectedCategoryIds.has(s.id)));
                  const isExpanded = expandedCategories[root.id] ?? (selectedInRoot > 0 || subs.some((s) => selectedCategoryIds.has(s.id)));

                  return (
                    <div key={root.id} className="p-2.5 text-xs transition-colors hover:bg-slate-50/50">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            ref={(el) => {
                              if (el) el.indeterminate = isPartial;
                            }}
                            onChange={() => toggleCategory(root.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span className="text-amber-500 text-sm">📁</span>
                          <span className="font-semibold text-slate-900 truncate">{root.name}</span>
                          <span className="text-slate-400 text-[11px]">
                            ({productsInRoot.length} {productsInRoot.length === 1 ? 'item' : 'items'})
                          </span>
                        </label>

                        <div className="flex items-center gap-2 shrink-0">
                          {isChecked || selectedInRoot > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              {productsInRoot.length > 0
                                ? `${selectedInRoot} / ${productsInRoot.length} selected`
                                : 'Category Selected'}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">0 selected</span>
                          )}

                          {subs.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleCategoryExpand(root.id)}
                              className="text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                              title={isExpanded ? 'Collapse subcategories' : 'Expand subcategories'}
                            >
                              {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Subcategories (if any and expanded) */}
                      {subs.length > 0 && isExpanded && (
                        <div className="mt-2 ml-7 pl-3 border-l-2 border-slate-200 space-y-1.5 py-1">
                          {subs.map((sub) => {
                            const productsInSub = productsByCategoryId.get(sub.id) || [];
                            const selectedInSub = productsInSub.filter((p) => selectedProductIds.has(p.id)).length;
                            const isSubCatSelected = selectedCategoryIds.has(sub.id);
                            const isSubAllProducts = productsInSub.length > 0 && selectedInSub === productsInSub.length;
                            const isSubChecked = isSubCatSelected || isSubAllProducts;
                            const isSubPartial = !isSubChecked && selectedInSub > 0;

                            return (
                              <div key={sub.id} className="flex items-center justify-between text-[11px]">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={isSubChecked}
                                    ref={(el) => {
                                      if (el) el.indeterminate = isSubPartial;
                                    }}
                                    onChange={() => toggleSubcategory(sub.id, root.id)}
                                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className="text-slate-400 font-mono">↳</span>
                                  <span className="font-medium text-slate-700">{sub.name}</span>
                                  <span className="text-slate-400">({productsInSub.length})</span>
                                </label>
                                <span className="text-slate-500 font-mono text-[10px]">
                                  {isSubChecked && productsInSub.length === 0
                                    ? 'Selected'
                                    : `${selectedInSub} / ${productsInSub.length}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PRODUCTS VIEW */}
        {activeTab === 'PRODUCTS' && (
          <div className="space-y-2.5">
            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search products by name, brand, or SKU..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 shadow-2xs"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 shadow-2xs max-w-xs"
              >
                <option value="">All Categories ({categories.length})</option>
                {rootCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center justify-between text-xs py-1 px-1 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllVisibleProducts}
                  className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-md shadow-2xs cursor-pointer transition-colors"
                >
                  {selectedProductIds.size === filteredProducts.length && filteredProducts.length > 0
                    ? 'Deselect Visible'
                    : 'Select All Visible'}
                </button>
                <span className="text-slate-500 text-[11px]">
                  Showing {filteredProducts.length} of {companyProducts.length} products
                </span>
              </div>
              <span className="font-semibold text-slate-700 text-xs">
                {selectedProductIds.size} selected
              </span>
            </div>

            {/* Products List */}
            <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-2xs">
              {isLoadingProducts ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading company products...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No matching company products found.
                </div>
              ) : (
                filteredProducts.map((p: CatalogProduct) => {
                  const isSelected = selectedProductIds.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 p-2.5 text-xs cursor-pointer transition-colors select-none ${
                        isSelected ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleProduct(p.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 truncate">{p.name}</span>
                          {p.brand && (
                            <span className="text-[10px] text-slate-500 font-medium px-1.5 py-0.2 bg-slate-100 rounded">
                              {p.brand}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          <span>{p.category?.name || p.categoryName || 'General'}</span>
                          <span>•</span>
                          <span>Unit: {p.baseUnit}</span>
                          {p.units && p.units.length > 1 && (
                            <span>({p.units.length} units)</span>
                          )}
                        </div>
                      </div>
                      <Badge variant="neutral" size="sm" className="text-[10px]">
                        Company
                      </Badge>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            <span className="font-bold text-slate-800">{selectedCategoryIds.size}</span> category(s) and{' '}
            <span className="font-bold text-slate-800">{selectedProductIds.size}</span> product(s) selected
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={(selectedProductIds.size === 0 && selectedCategoryIds.size === 0) || cloneMutation.isPending}
              isLoading={cloneMutation.isPending}
              onClick={handleConfirm}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {isPickerMode
                ? `Confirm Selection (${selectedCategoryIds.size + selectedProductIds.size} items)`
                : `Transfer ${
                    selectedCategoryIds.size > 0 && selectedProductIds.size > 0
                      ? `${selectedCategoryIds.size} Categories & ${selectedProductIds.size} Products`
                      : selectedCategoryIds.size > 0
                        ? `${selectedCategoryIds.size} Categories`
                        : `${selectedProductIds.size} Products`
                  }`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
