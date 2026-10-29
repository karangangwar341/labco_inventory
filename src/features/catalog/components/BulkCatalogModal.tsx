'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { catalogService } from '../catalog.service';
import { administrationService } from '@/features/administration/administration.service';
import { queryKeys } from '@/lib/query/query-keys';
import { invalidation } from '@/lib/query/invalidation';
import { useAuth } from '@/features/auth/auth.store';

interface BulkCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProjectId?: string;
}

type BulkTab = 'PRODUCTS' | 'CATEGORIES' | 'BRANDS';

interface ParsedProductRow {
  name: string;
  categoryName?: string;
  subcategoryName?: string;
  brand?: string;
  unitName?: string;
  kind?: 'RAW_MATERIAL' | 'MANUFACTURED_PRODUCT';
  minQuantity?: number;
  description?: string;
}

export function BulkCatalogModal({ isOpen, onClose, initialProjectId }: BulkCatalogModalProps) {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<BulkTab>('PRODUCTS');
  const [targetScope, setTargetScope] = useState<'COMPANY' | 'PROJECT'>(
    initialProjectId || role === 'PROJECT_ADMIN' ? 'PROJECT' : 'COMPANY'
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialProjectId || user?.projectId || ''
  );

  // Tab 1: Products State
  const [productInputMode, setProductInputMode] = useState<'PASTE' | 'FILE'>('FILE');
  const [productPasteText, setProductPasteText] = useState('');
  const [parsedProducts, setParsedProducts] = useState<ParsedProductRow[]>([]);
  const [productFileName, setProductFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 2: Categories State
  const [categoriesText, setCategoriesText] = useState(
    `Laboratory Reagents > Analytical Acids\nLaboratory Reagents > Organic Solvents\nGeneral Consumables > Pipettes & Tips\nDiagnostic Kits > Serology Assays`
  );

  // Tab 3: Brands State
  const [brandsText, setBrandsText] = useState(
    `Labco Precision, Merck, Sigma-Aldrich, BD Biosciences, Bio-Rad, Eppendorf, Thermo Fisher`
  );

  // Feedback State
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load Projects for Super Admin project-scope selection
  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.administration.projects(),
    queryFn: administrationService.getProjects,
    enabled: isSuperAdmin && isOpen,
  });

  // Set default project if needed
  React.useEffect(() => {
    if (initialProjectId) {
      setTargetScope('PROJECT');
      setSelectedProjectId(initialProjectId);
    } else if (projects.length > 0 && !selectedProjectId && isSuperAdmin) {
      setSelectedProjectId(projects[0].id);
    }
  }, [initialProjectId, projects, isSuperAdmin, selectedProjectId]);

  // Bulk Product Mutation
  const bulkProductMutation = useMutation({
    mutationFn: catalogService.createBulkProducts,
    onSuccess: async (res) => {
      await invalidation.afterCatalogMutation(queryClient);
      setStatusMessage(
        `Bulk creation successful! ${res.totalCreated} products registered into database. ${
          res.totalSkipped > 0 ? `(${res.totalSkipped} duplicates skipped)` : ''
        }`
      );
      setParsedProducts([]);
      setProductPasteText('');
      setProductFileName(null);
    },
    onError: (err: unknown) => {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to bulk create products.');
    },
  });

  // Bulk Category Mutation
  const bulkCategoryMutation = useMutation({
    mutationFn: catalogService.createBulkCategories,
    onSuccess: async (res) => {
      await invalidation.afterCatalogMutation(queryClient);
      setStatusMessage(
        `Successfully created ${res.totalCreated} categories & subcategories into catalog! ${
          res.totalSkipped > 0 ? `(${res.totalSkipped} already existed)` : ''
        }`
      );
    },
    onError: (err: unknown) => {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to bulk create categories.');
    },
  });

  // Parse direct paste text for products
  const handleParsePasteText = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!productPasteText.trim()) {
      setErrorMessage('Please enter or paste tabular product rows first.');
      return;
    }

    const lines = productPasteText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    const rows: ParsedProductRow[] = [];

    lines.forEach((line) => {
      const sep = line.includes('\t') ? '\t' : ',';
      const cols = line.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length === 0 || !cols[0]) return;

      // Skip header if line matches headers
      if (['name', 'product', 'productname', 'product name'].includes(cols[0].toLowerCase())) {
        return;
      }

      rows.push({
        name: cols[0],
        categoryName: cols[1] || undefined,
        subcategoryName: cols[2] || undefined,
        brand: cols[3] || undefined,
        unitName: cols[4] || 'PIECE',
        kind: cols[5]?.toUpperCase() === 'MANUFACTURED_PRODUCT' ? 'MANUFACTURED_PRODUCT' : 'RAW_MATERIAL',
        minQuantity: cols[6] ? Number(cols[6]) : 0,
        description: cols[7] || undefined,
      });
    });

    if (rows.length === 0) {
      setErrorMessage('No valid product records found. Check format.');
      return;
    }

    setParsedProducts(rows);
    setStatusMessage(`Parsed ${rows.length} product records ready for database import.`);
  };

  // Parse Excel / CSV file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setStatusMessage(null);
    setProductFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet);

      if (!rawData || rawData.length === 0) {
        throw new Error('Spreadsheet contains no data rows.');
      }

      const rows: ParsedProductRow[] = rawData.map((r) => {
        const name = (r.name || r.productName || r.Product || r.product || '').toString().trim();
        const categoryName = (r.category || r.categoryName || r.Category || '').toString().trim();
        const subcategoryName = (r.subcategory || r.subcategoryName || r.Subcategory || '').toString().trim();
        const brand = (r.brand || r.Brand || r.manufacturer || '').toString().trim();
        const unitName = (r.unit || r.unitName || r.Unit || 'PIECE').toString().trim().toUpperCase();
        const kindRaw = (r.kind || r.productKind || r.Kind || '').toString().trim().toUpperCase();
        const kind: 'RAW_MATERIAL' | 'MANUFACTURED_PRODUCT' = kindRaw === 'MANUFACTURED_PRODUCT' ? 'MANUFACTURED_PRODUCT' : 'RAW_MATERIAL';
        const minQuantity = r.minQuantity || r.minQty || r.minStock || 0;
        const description = (r.description || r.Description || '').toString().trim();

        return {
          name,
          categoryName: categoryName || undefined,
          subcategoryName: subcategoryName || undefined,
          brand: brand || undefined,
          unitName: unitName || 'PIECE',
          kind,
          minQuantity: Number(minQuantity) || 0,
          description: description || undefined,
        };
      }).filter((r) => Boolean(r.name));

      if (rows.length === 0) {
        throw new Error('No valid products with a name found in spreadsheet.');
      }

      setParsedProducts(rows);
      setStatusMessage(`Loaded ${rows.length} product rows from ${file.name}.`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to parse file.');
      setParsedProducts([]);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Download Sample Template
  const handleDownloadSample = () => {
    const headers = [
      'productName',
      'category',
      'subcategory',
      'brand',
      'unitName',
      'kind',
      'minQuantity',
      'description',
    ];
    const sampleRows = [
      [
        'Hydrochloric Acid 37% AR',
        'Laboratory Reagents',
        'Acids',
        'Merck',
        'BOTTLE',
        'RAW_MATERIAL',
        15,
        'Analytical reagent grade 500ml',
      ],
      [
        'Latex Gloves Powder-Free Medium',
        'General Consumables',
        'Gloves',
        'SafeTouch',
        'BOX',
        'RAW_MATERIAL',
        50,
        'Box of 100 powder-free nitrile examination gloves',
      ],
      [
        'Cardiac Biomarker Tri-Pack (Trop-I / CK-MB)',
        'Diagnostic Assays',
        'Rapid Tests',
        'Labco Precision',
        'KIT',
        'MANUFACTURED_PRODUCT',
        25,
        'Triage emergency cardiac diagnostic cassette kit',
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
    XLSX.utils.book_append_sheet(wb, ws, 'ProductsTemplate');
    XLSX.writeFile(wb, 'bulk_products_template.xlsx');
  };

  // Submit Bulk Products
  const handleSubmitProducts = () => {
    if (parsedProducts.length === 0) return;
    setErrorMessage(null);
    setStatusMessage(null);

    const isProj = targetScope === 'PROJECT';
    const projectId = isProj ? selectedProjectId : undefined;

    if (isProj && !projectId) {
      setErrorMessage('Please select a target project for project-scoped products.');
      return;
    }

    const items = parsedProducts.map((p) => ({
      name: p.name,
      categoryName: p.categoryName,
      subcategoryName: p.subcategoryName,
      brand: p.brand,
      unitName: p.unitName,
      kind: p.kind,
      minQuantity: p.minQuantity,
      description: p.description,
      ownerScope: isProj ? ('PROJECT' as const) : ('COMPANY' as const),
      projectId,
    }));

    bulkProductMutation.mutate(items);
  };

  // Parse Categories & Subcategories
  const parsedCategories = useMemo(() => {
    const lines = categoriesText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    const items: Array<{ name: string; parentName?: string }> = [];

    lines.forEach((line) => {
      if (line.includes('>')) {
        const parts = line.split('>').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          items.push({ parentName: parts[0], name: parts[1] });
        } else if (parts.length === 1) {
          items.push({ name: parts[0] });
        }
      } else if (line.includes(',')) {
        const parts = line.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          items.push({ parentName: parts[0], name: parts[1] });
        } else if (parts.length === 1) {
          items.push({ name: parts[0] });
        }
      } else {
        items.push({ name: line.trim() });
      }
    });

    return items;
  }, [categoriesText]);

  // Submit Categories
  const handleSubmitCategories = () => {
    if (parsedCategories.length === 0) return;
    setErrorMessage(null);
    setStatusMessage(null);

    const isProj = targetScope === 'PROJECT';
    const projectId = isProj ? selectedProjectId : undefined;

    const items = parsedCategories.map((c) => ({
      name: c.name,
      parentName: c.parentName,
      ownerScope: isProj ? ('PROJECT' as const) : ('COMPANY' as const),
      projectId,
    }));

    bulkCategoryMutation.mutate(items);
  };

  // Parse Brands
  const parsedBrands = useMemo(() => {
    return brandsText
      .split(/[\n,]+/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  }, [brandsText]);

  // Submit Brands (Registers them into taxonomy)
  const handleSubmitBrands = () => {
    if (parsedBrands.length === 0) return;
    setErrorMessage(null);
    setStatusMessage(null);

    const isProj = targetScope === 'PROJECT';
    const projectId = isProj ? selectedProjectId : undefined;

    // Registers each brand under "Brands & Manufacturers" parent category
    const items = parsedBrands.map((brandName) => ({
      name: brandName,
      parentName: 'Brands & Manufacturers',
      ownerScope: isProj ? ('PROJECT' as const) : ('COMPANY' as const),
      projectId,
    }));

    bulkCategoryMutation.mutate(items);
  };

  const isBusy = bulkProductMutation.isPending || bulkCategoryMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="⚡ Bulk Catalog & Taxonomy Manager"
      description="Quickly register multiple products, categories, subcategories, brands, and project products directly into the database."
      
    >
      <div className="space-y-5">
        {/* Scope Selector Header */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Target Database Scope:</span>
            {isSuperAdmin ? (
              <div className="inline-flex rounded-md shadow-sm">
                <button
                  type="button"
                  onClick={() => setTargetScope('COMPANY')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-l-md border ${
                    targetScope === 'COMPANY'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  🌐 Global Company Catalog
                </button>
                <button
                  type="button"
                  onClick={() => setTargetScope('PROJECT')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-r-md border-t border-b border-r ${
                    targetScope === 'PROJECT'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  🏢 Project-Specific Products
                </button>
              </div>
            ) : (
              <Badge variant="purple">🏢 Project: {'Assigned Project'}</Badge>
            )}
          </div>

          {targetScope === 'PROJECT' && isSuperAdmin && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-600">Project:</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="text-xs rounded border-slate-300 py-1 px-2.5 font-medium text-slate-800 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('PRODUCTS')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'PRODUCTS'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📦 Bulk Products & Project Items
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CATEGORIES')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'CATEGORIES'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📁 Bulk Categories & Subcategories
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('BRANDS')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'BRANDS'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            🏷️ Bulk Brands / Manufacturers
          </button>
        </div>

        {/* Alerts / Status Messages */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 font-medium">
            ✓ {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 font-medium">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* TAB 1: PRODUCTS */}
        {activeTab === 'PRODUCTS' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-md shadow-sm">
                <button
                  type="button"
                  onClick={() => setProductInputMode('FILE')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-l border ${
                    productInputMode === 'FILE'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  📁 Upload Excel / CSV
                </button>
                <button
                  type="button"
                  onClick={() => setProductInputMode('PASTE')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-r border-t border-b border-r ${
                    productInputMode === 'PASTE'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  📝 Fast Paste / Multi-Line
                </button>
              </div>

              <Button variant="secondary" size="sm" onClick={handleDownloadSample}>
                📥 Download Excel Template
              </Button>
            </div>

            {productInputMode === 'FILE' ? (
              <div className="p-6 border-2 border-dashed border-slate-300 rounded-lg text-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="bulk-product-file-input"
                />
                <label htmlFor="bulk-product-file-input" className="cursor-pointer block space-y-2">
                  <div className="text-3xl">📊</div>
                  <div className="text-sm font-semibold text-slate-700">
                    {productFileName ? productFileName : 'Click to select Excel (.xlsx) or CSV file'}
                  </div>
                  <div className="text-xs text-slate-500">
                    Supports automatic column mapping for: Name, Category, Subcategory, Brand, Unit, Min Stock
                  </div>
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Columns: Name, Category, Subcategory, Brand, Unit, Kind, Min Stock</span>
                  <span className="font-mono">Comma or Tab delimited</span>
                </div>
                <textarea
                  rows={5}
                  value={productPasteText}
                  onChange={(e) => setProductPasteText(e.target.value)}
                  placeholder={`Ethanol Absolute 99.9%, Laboratory Reagents, Solvents, Merck, BOTTLE, RAW_MATERIAL, 10\nSodium Hydroxide Pellets, Laboratory Reagents, Bases, Sigma, BOTTLE, RAW_MATERIAL, 20\nMicrocentrifuge Tubes 1.5ml, Consumables, Plasticware, Eppendorf, PACK, RAW_MATERIAL, 100`}
                  className="w-full text-xs font-mono p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
                <Button variant="secondary" size="sm" onClick={handleParsePasteText}>
                  Parse & Preview Records ({parsedProducts.length})
                </Button>
              </div>
            )}

            {/* Preview Table */}
            {parsedProducts.length > 0 && (
              <div className="space-y-2 border border-slate-200 rounded-lg overflow-hidden bg-white">
                <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    Preview: {parsedProducts.length} Items Ready to Create
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Immediate database insertion on submit
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 font-medium">
                      <tr>
                        <th className="py-1.5 px-3">#</th>
                        <th className="py-1.5 px-3">Product Name</th>
                        <th className="py-1.5 px-3">Category</th>
                        <th className="py-1.5 px-3">Subcategory</th>
                        <th className="py-1.5 px-3">Brand</th>
                        <th className="py-1.5 px-3">Unit</th>
                        <th className="py-1.5 px-3">Min Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {parsedProducts.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-1.5 px-3 text-slate-400">{idx + 1}</td>
                          <td className="py-1.5 px-3 font-semibold text-slate-900 font-sans">{p.name}</td>
                          <td className="py-1.5 px-3 text-slate-600">{p.categoryName || '—'}</td>
                          <td className="py-1.5 px-3 text-slate-600">{p.subcategoryName || '—'}</td>
                          <td className="py-1.5 px-3 text-slate-600">{p.brand || '—'}</td>
                          <td className="py-1.5 px-3 text-blue-700 font-semibold">{p.unitName || 'PIECE'}</td>
                          <td className="py-1.5 px-3 text-slate-700">{p.minQuantity ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="secondary" onClick={onClose} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmitProducts}
                disabled={parsedProducts.length === 0 || isBusy}
              >
                {isBusy ? 'Creating Products...' : `⚡ Create ${parsedProducts.length} Products`}
              </Button>
            </div>
          </div>
        )}

        {/* TAB 2: CATEGORIES & SUBCATEGORIES */}
        {activeTab === 'CATEGORIES' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 leading-relaxed">
              💡 <strong>Format:</strong> Enter one category hierarchy per line using <code>&gt;</code> or comma separation.
              <br />
              Example: <code>Laboratory Reagents &gt; Analytical Acids</code> automatically creates the main category and nests the subcategory beneath it.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Enter Categories / Subcategories:</label>
                <textarea
                  rows={8}
                  value={categoriesText}
                  onChange={(e) => setCategoriesText(e.target.value)}
                  className="w-full text-xs font-mono p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Hierarchy Preview ({parsedCategories.length} items):
                </label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md max-h-52 overflow-y-auto font-mono text-xs space-y-1.5">
                  {parsedCategories.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {c.parentName ? (
                        <>
                          <span className="text-slate-500">{c.parentName}</span>
                          <span className="text-blue-500">→</span>
                          <span className="font-semibold text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded">
                            {c.name}
                          </span>
                        </>
                      ) : (
                        <span className="font-semibold text-slate-900 bg-slate-200 px-1.5 py-0.5 rounded">
                          📁 {c.name} (Root)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="secondary" onClick={onClose} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmitCategories}
                disabled={parsedCategories.length === 0 || isBusy}
              >
                {isBusy ? 'Creating Categories...' : `⚡ Create ${parsedCategories.length} Categories`}
              </Button>
            </div>
          </div>
        )}

        {/* TAB 3: BRANDS */}
        {activeTab === 'BRANDS' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 leading-relaxed">
              💡 <strong>Bulk Brand Registration:</strong> Enter recognized manufacturers and brand suppliers below. They will be registered directly into the catalog taxonomy and become available immediately across all product filters and creation dropdowns.
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Brands / Manufacturers (Comma or line separated):
              </label>
              <textarea
                rows={5}
                value={brandsText}
                onChange={(e) => setBrandsText(e.target.value)}
                className="w-full text-xs font-mono p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Parsed Brands ({parsedBrands.length}):
              </label>
              <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 border border-slate-200 rounded-md max-h-40 overflow-y-auto">
                {parsedBrands.map((b, i) => (
                  <Badge key={i} variant="neutral" size="sm">
                    🏷️ {b}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="secondary" onClick={onClose} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmitBrands}
                disabled={parsedBrands.length === 0 || isBusy}
              >
                {isBusy ? 'Registering Brands...' : `⚡ Register ${parsedBrands.length} Brands`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
