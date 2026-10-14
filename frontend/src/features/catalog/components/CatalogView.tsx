'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { catalogService } from '../catalog.service';
import { CatalogProduct } from '../catalog.types';

export function CatalogView() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchCatalog = useCallback(() => {
    setIsLoading(true);
    setErrorMsg(null);
    catalogService
      .getProducts()
      .then((data) => {
        setProducts(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load catalog');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchTerm.toLowerCase();
      const nameMatch = (p.name || '').toLowerCase().includes(q);
      const skuMatch = (p.sku || '').toLowerCase().includes(q);
      const catMatch = (p.categoryName || p.category?.name || '').toLowerCase().includes(q);
      return nameMatch || skuMatch || catMatch;
    });
  }, [products, searchTerm]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Product Catalog & Unit Conversions"
        description="Master definition of all inventoried products, tracking requirements, and fixed conversion scales."
      />

      {errorMsg && (
        <ErrorState message={errorMsg} onRetry={fetchCatalog} />
      )}

      {/* Search Bar */}
      <div className="p-3 bg-white border border-[#dbe3ee] rounded-lg flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Search by product name, SKU, or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:w-80 px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-xs text-[#172033] placeholder-[#5b6678]/60 focus:outline-none focus:border-[#2563eb]"
        />
        <span className="text-xs text-[#5b6678]">
          {filteredProducts.length} items cataloged
        </span>
      </div>

      {isLoading ? (
        <LoadingState message="Loading catalog products from backend..." />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title="No products in catalog"
          description={
            products.length === 0
              ? "The product catalog is currently empty. Define master products via the backend or import a CSV catalog."
              : "No products matched your search term."
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Table>
              <TableHeader sticky>
                <tr>
                  <TableHead>Product / SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead className="text-right">Min Threshold</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => (
                  <TableRow
                    key={p.id}
                    className={selectedProduct?.id === p.id ? 'bg-[#eff6ff]' : ''}
                  >
                    <TableCell>
                      <div className="font-semibold text-[#172033]">{p.name}</div>
                      <div className="text-[11px] font-mono text-[#5b6678]">{p.sku}</div>
                    </TableCell>
                    <TableCell className="text-[#5b6678]">
                      {p.categoryName || p.category?.name || 'General'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.trackingMode === 'BATCH' ? 'primary' : 'neutral'}>
                        {p.trackingMode || 'NONE'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[#172033]">
                      {p.minThreshold || 0} {p.baseUnit || 'units'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedProduct(p)}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            {selectedProduct ? (
              <div className="bg-white border border-[#dbe3ee] rounded-xl p-4 shadow-sm space-y-4">
                <div className="border-b border-[#dbe3ee] pb-3">
                  <span className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">
                    Product Specification
                  </span>
                  <h3 className="text-sm font-bold text-[#172033] mt-0.5">
                    {selectedProduct.name}
                  </h3>
                  <p className="text-xs font-mono text-[#5b6678]">{selectedProduct.sku}</p>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#f1f5f9]">
                    <span className="text-[#5b6678]">Base Inventory Unit</span>
                    <span className="font-semibold text-[#172033]">
                      {selectedProduct.baseUnit || 'EACH'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#f1f5f9]">
                    <span className="text-[#5b6678]">Tracking Mode</span>
                    <span className="font-mono text-[#172033]">
                      {selectedProduct.trackingMode || 'NONE'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#f1f5f9]">
                    <span className="text-[#5b6678]">Expiry Date Tracking</span>
                    <span className="font-semibold text-[#172033]">
                      {selectedProduct.trackExpiry ? 'Required' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#f1f5f9]">
                    <span className="text-[#5b6678]">Low Stock Reorder Alert</span>
                    <span className="font-semibold text-[#a15c00]">
                      ≤ {selectedProduct.minThreshold || 0}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[#172033] mb-2">
                    Unit Conversions (Fixed Ratios)
                  </h4>
                  {selectedProduct.units && selectedProduct.units.length > 0 ? (
                    <div className="space-y-1.5">
                      {selectedProduct.units.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#f8fafc] border border-[#dbe3ee] text-xs"
                        >
                          <span className="font-bold text-[#172033]">{u.unitName}</span>
                          <span className="font-mono text-[#5b6678]">
                            = {u.conversionToBase} × Base
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#5b6678]">Single base unit only (1:1 ratio).</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-[#dbe3ee] rounded-xl p-8 text-center text-xs text-[#5b6678]">
                Select a product from the catalog table to inspect its conversion definitions.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CatalogView;
