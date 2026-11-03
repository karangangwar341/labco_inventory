'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { catalogService } from '../catalog.service';
import { administrationService } from '@/features/administration/administration.service';
import { invalidation } from '@/lib/query/invalidation';
import type { CatalogProduct } from '../catalog.types';

interface CloneCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  onSuccess?: () => void;
}

export function CloneCatalogModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  onSuccess,
}: CloneCatalogModalProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Load all company products and categories
  const { data: allProducts = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ['catalog', 'company-products-for-clone'],
    queryFn: () => catalogService.getProducts(),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  });

  const { data: categories = [] } = useQuery({
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

  const filteredProducts = useMemo(() => {
    return companyProducts.filter((p) => {
      if (selectedCategory && p.categoryId !== selectedCategory && p.category?.parentId !== selectedCategory) {
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
  }, [companyProducts, selectedCategory, searchTerm]);

  const handleSelectAll = () => {
    if (selectedProductIds.size === filteredProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cloneMutation = useMutation({
    mutationFn: () =>
      administrationService.cloneCatalogToProject(
        projectId,
        Array.from(selectedProductIds),
      ),
    onSuccess: async (res) => {
      await invalidation.afterCatalogMutation(queryClient);
      setSuccessNotice(
        `Successfully transferred ${res.clonedCount} product(s) into ${projectName || 'project'} catalog.${
          res.skippedCount > 0 ? ` (${res.skippedCount} already existed)` : ''
        }`,
      );
      setSelectedProductIds(new Set());
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setSuccessNotice(null);
        onClose();
      }, 1800);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Catalog transfer failed.');
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Transfer Products to ${projectName || 'Project'} Catalog`}
      description="Select products from the company catalog to clone directly into this project's catalog as manufactured products so you do not have to create them from scratch."
      maxWidth="xl"
    >
      <div className="space-y-4 pt-2">
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products by name, brand, or category..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 shadow-2xs"
          >
            <option value="">All Categories ({categories.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.ownerScope === 'COMPANY' ? '(Company)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-between text-xs py-1 px-1 bg-slate-50 rounded-lg border border-slate-100">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-md shadow-2xs cursor-pointer transition-colors"
            >
              {selectedProductIds.size === filteredProducts.length && filteredProducts.length > 0
                ? 'Deselect All'
                : 'Select All Visible'}
            </button>
            <span className="text-slate-500 text-[11px]">
              Showing {filteredProducts.length} company products
            </span>
          </div>
          <span className="font-semibold text-slate-700 text-xs">
            {selectedProductIds.size} selected for transfer
          </span>
        </div>

        {/* Products List */}
        <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-2xs">
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
                  className={`flex items-center gap-3 p-3 text-xs cursor-pointer transition-colors select-none ${
                    isSelected ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleProduct(p.id)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 truncate">{p.name}</span>
                      {p.brand && (
                        <span className="text-[11px] text-slate-500 font-medium px-1.5 py-0.5 bg-slate-100 rounded">
                          {p.brand}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                      <span>Category: {p.category?.name || p.categoryName || 'General'}</span>
                      <span>•</span>
                      <span>Base Unit: {p.baseUnit}</span>
                      {p.units && p.units.length > 1 && (
                        <>
                          <span>•</span>
                          <span>{p.units.length} units configured</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant="neutral" size="sm">
                    Company
                  </Badge>
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-500">
            {selectedProductIds.size} product(s) will be created in project catalog
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={selectedProductIds.size === 0 || cloneMutation.isPending}
              isLoading={cloneMutation.isPending}
              onClick={() => cloneMutation.mutate()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Transfer {selectedProductIds.size} Products to Project
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
