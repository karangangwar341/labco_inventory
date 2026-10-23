'use client';

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useAuth } from '@/features/auth/auth.store';
import { catalogService } from '../catalog.service';
import { CatalogProduct } from '../catalog.types';
import { CreateProductDto, ProductVersionSummaryDto } from '@/types/api/catalog';
import { queryKeys } from '@/lib/query/query-keys';
import { invalidation } from '@/lib/query/invalidation';

type UnitDraft = {
  unitName: string;
  conversionToBase: string;
  isBaseUnit: boolean;
};

type AttributeDraft = {
  attributeName: string;
  value: string;
  unit: string;
};

const blankUnit = (): UnitDraft => ({
  unitName: '',
  conversionToBase: '1',
  isBaseUnit: false,
});

const blankAttribute = (): AttributeDraft => ({
  attributeName: '',
  value: '',
  unit: '',
});

const COMMON_SPEC_SUGGESTIONS = [
  'Storage Temperature',
  'Purity',
  'Concentration',
  'Volume',
  'pH',
  'Grade',
  'CAS Number',
  'Physical State',
];

const STANDARD_PRESET_UNITS = [
  'Vial',
  'Ampoule',
  'Bottle',
  'Tube',
  'Box of 10',
  'Box of 20',
  'Box of 50',
  'Box of 100',
  'Kit',
  'Pack of 4',
  'Pack of 10',
  'Piece',
  'Strip of 10',
  'Carton of 500',
  'Carton of 1000',
  'Liter (L)',
  'Milliliter (ml)',
  'Kilogram (kg)',
  'Gram (g)',
  'Roll',
  'Bag',
  'Drum (200L)',
];

export function CatalogProductForm({
  productId,
  initialKind = 'RAW_MATERIAL',
}: {
  productId?: string;
  initialKind?: CreateProductDto['kind'];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isEditing = Boolean(productId);
  const canManage = role === 'SUPER_ADMIN' || role === 'PROJECT_ADMIN';

  // Core Form State
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CreateProductDto['kind']>(initialKind);
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [units, setUnits] = useState<UnitDraft[]>([
    { unitName: '', conversionToBase: '1', isBaseUnit: true },
  ]);
  const [attributes, setAttributes] = useState<AttributeDraft[]>([]);
  const [allowFractional, setAllowFractional] = useState(false);
  const [quantityPrecision, setQuantityPrecision] = useState('0');
  const [minQuantity, setMinQuantity] = useState('0');
  const [minOrderQuantity, setMinOrderQuantity] = useState('1');
  const [changeReason, setChangeReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Custom standard units state
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [modalUnitName, setModalUnitName] = useState('');
  const [modalUnitCategory, setModalUnitCategory] = useState<'CONTAINER' | 'PACKAGING' | 'VOLUME' | 'WEIGHT' | 'COUNT' | 'OTHER'>('PACKAGING');
  const [saveAsSystemStandard, setSaveAsSystemStandard] = useState(true);
  const [modalUnitError, setModalUnitError] = useState<string | null>(null);

  // Quick Category Creation Modal State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [modalCategoryName, setModalCategoryName] = useState('');
  const [modalParentId, setModalParentId] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Quick Brand Creation Modal State
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [modalBrandName, setModalBrandName] = useState('');
  const [modalBrandParentId, setModalBrandParentId] = useState('');
  const [modalBrandError, setModalBrandError] = useState<string | null>(null);

  // Queries
  const {
    data: product,
    isLoading: isProductLoading,
    error: productError,
    refetch: refetchProduct,
  } = useQuery({
    queryKey: queryKeys.catalog.product(productId || 'new'),
    queryFn: () => catalogService.getProductById(productId!),
    enabled: Boolean(productId),
  });

  const { data: products = [], isLoading: isProductsLoading } = useQuery({
    queryKey: queryKeys.catalog.products(user?.projectId ? `project-${user.projectId}` : 'company'),
    queryFn: () => catalogService.getProducts(),
    staleTime: 10 * 60 * 1000,
  });

  const {
    data: categories = [],
    isLoading: isCategoriesLoading,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: queryKeys.catalog.categories(user?.projectId ? `project-${user.projectId}` : 'company'),
    queryFn: () => catalogService.getCategories(),
  });

  const { data: standardUnits = [] } = useQuery({
    queryKey: queryKeys.catalog.units(),
    queryFn: () => catalogService.getStandardUnits(),
    staleTime: 5 * 60 * 1000,
  });

  const saveStandardUnitMutation = useMutation({
    mutationFn: catalogService.createStandardUnit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.units() });
    },
  });

  // Categories scoped to current user
  const visibleCategories = useMemo(() => {
    const scoped = categories.filter((category) =>
      role === 'PROJECT_ADMIN'
        ? category.ownerScope === 'PROJECT' && category.projectId === user?.projectId
        : category.ownerScope === 'COMPANY',
    );
    if (isEditing && product?.category && !scoped.some((c) => c.id === product.categoryId)) {
      return [...scoped, product.category];
    }
    return scoped;
  }, [categories, isEditing, product, role, user?.projectId]);

  // Root categories (no parent)
  const roots = useMemo(
    () => visibleCategories.filter((category) => !category.parentId),
    [visibleCategories],
  );

  // Subcategories of selected root category
  const availableSubcategories = useMemo(
    () => visibleCategories.filter((category) => category.parentId === categoryId),
    [visibleCategories, categoryId],
  );

  // Dynamically extract all unique brands across products & registered brand categories
  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.brand?.trim()) set.add(p.brand.trim());
    });
    categories.forEach((c) => {
      if (c.parentId && c.name?.trim()) set.add(c.name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products, categories]);

  // All standard units combined with product units & custom registered units
  const allStandardUnits = useMemo(() => {
    const set = new Set<string>();
    // Priority: system standard units loaded from backend
    standardUnits.forEach((u) => {
      if (u.name?.trim()) set.add(u.name.trim());
    });
    // Fallback defaults if backend units not loaded
    if (set.size === 0) {
      STANDARD_PRESET_UNITS.forEach((u) => set.add(u));
    }
    // Units from existing products
    products.forEach((p) => {
      p.units?.forEach((u) => {
        if (u.unitName?.trim()) set.add(u.unitName.trim());
      });
    });
    // Locally added custom units in this session
    customUnits.forEach((u) => set.add(u.trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products, customUnits, standardUnits]);

  // Known units and attribute names for suggestions
  const unitNames = useMemo(
    () =>
      [...new Set(products.flatMap((item) => item.units || []).map((u) => u.unitName.trim()).filter(Boolean))].sort(),
    [products],
  );

  const selectedKind = isEditing
    ? kind
    : role === 'PROJECT_ADMIN'
    ? 'MANUFACTURED_PRODUCT'
    : 'RAW_MATERIAL';

  // Populate form when editing an existing product
  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setKind(product.kind || 'RAW_MATERIAL');
    setBrand(product.brand || '');
    setDescription(product.description || '');

    const productCategory = categories.find((c) => c.id === product.categoryId);
    if (productCategory?.parentId) {
      // Product belongs to a subcategory
      setCategoryId(productCategory.parentId);
      setSubcategoryId(productCategory.id);
    } else {
      // Product belongs directly to a root category
      setCategoryId(product.categoryId);
      setSubcategoryId('');
    }

    const activeUnits = (product.units || []).filter((u) => u.status !== 'SUPERSEDED');
    setUnits(
      activeUnits.length
        ? activeUnits.map((u) => ({
            unitName: u.unitName,
            conversionToBase: String(u.conversionToBase),
            isBaseUnit: u.isBaseUnit,
          }))
        : [{ unitName: product.baseUnit || '', conversionToBase: '1', isBaseUnit: true }],
    );

    setAttributes(
      (product.attributes || []).map((attr) => ({
        attributeName: attr.attributeName,
        value: attr.value,
        unit: attr.unit || '',
      })),
    );

    setAllowFractional(Boolean(product.allowFractional));
    setQuantityPrecision(String(product.quantityPrecision ?? 0));
    setMinQuantity(String(product.minQuantity ?? product.minThreshold ?? 0));
    setMinOrderQuantity(String(product.minOrderQuantity ?? 1));
  }, [product, categories]);

  // Save product mutation
  const saveProduct = useMutation<CatalogProduct | ProductVersionSummaryDto, Error, CreateProductDto>({
    mutationFn: (payload: CreateProductDto) =>
      isEditing
        ? catalogService.proposeProductVersion(productId!, payload)
        : catalogService.createProduct(payload),
    onSuccess: async (result) => {
      await invalidation.afterCatalogMutation(queryClient);
      if (isEditing) {
        setErrorMessage(null);
        router.push('/catalog');
      } else {
        const status = (result as CatalogProduct).status;
        router.push(`/catalog?created=${status === 'PENDING_APPROVAL' ? 'pending' : 'saved'}`);
      }
    },
    onError: (error) =>
      setErrorMessage(error instanceof Error ? error.message : 'The product could not be saved.'),
  });

  // Save quick category mutation
  const saveCategory = useMutation({
    mutationFn: () =>
      catalogService.createCategory({
        name: modalCategoryName.trim(),
        parentId: modalParentId || undefined,
      }),
    onSuccess: async (newCat) => {
      await invalidation.afterCatalogMutation(queryClient);
      await refetchCategories();
      if (newCat.parentId) {
        setCategoryId(newCat.parentId);
        setSubcategoryId(newCat.id);
      } else {
        setCategoryId(newCat.id);
        setSubcategoryId('');
      }
      setShowCategoryModal(false);
      setModalCategoryName('');
      setModalParentId('');
      setModalError(null);
    },
    onError: (error) => {
      setModalError(error instanceof Error ? error.message : 'Could not create category.');
    },
  });

  // Save quick brand mutation
  const saveBrand = useMutation({
    mutationFn: () =>
      catalogService.createCategory({
        name: modalBrandName.trim(),
        parentId: modalBrandParentId || categoryId || roots[0]?.id || undefined,
      }),
    onSuccess: async (newBrandCat) => {
      await invalidation.afterCatalogMutation(queryClient);
      await refetchCategories();
      setBrand(newBrandCat.name);
      setShowBrandModal(false);
      setModalBrandName('');
      setModalBrandParentId('');
      setModalBrandError(null);
    },
    onError: (error) => {
      setModalBrandError(error instanceof Error ? error.message : 'Could not create brand.');
    },
  });

  const setBaseUnit = (index: number) => {
    setUnits((current) =>
      current.map((u, i) => ({
        ...u,
        isBaseUnit: i === index,
        conversionToBase: i === index ? '1' : u.conversionToBase,
      })),
    );
  };

  const submitProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    // Final category ID: if subcategory is selected, use it; otherwise use the root category
    const finalCategoryId = subcategoryId || categoryId;
    if (!finalCategoryId) {
      setErrorMessage('Please select a category for the product.');
      return;
    }

    const normalizedUnits = units.map((u) => ({
      ...u,
      unitName: u.unitName.trim(),
    }));

    if (
      normalizedUnits.some(
        (u) =>
          !u.unitName ||
          !Number.isFinite(Number(u.conversionToBase)) ||
          Number(u.conversionToBase) <= 0,
      )
    ) {
      setErrorMessage('Every packaging unit must have a name and a positive conversion factor.');
      return;
    }

    const baseUnitCount = normalizedUnits.filter((u) => u.isBaseUnit).length;
    if (baseUnitCount !== 1) {
      setErrorMessage('Please specify exactly one base unit.');
      return;
    }

    const normalizedAttributes = attributes.filter(
      (a) => a.attributeName.trim() && a.value.trim(),
    );

    const payload: CreateProductDto = {
      name: name.trim(),
      kind: selectedKind,
      description: description.trim() || undefined,
      categoryId: finalCategoryId,
      brand: role === 'PROJECT_ADMIN' ? undefined : (brand.trim() || undefined),
      quantityPrecision: allowFractional ? Number(quantityPrecision) : 0,
      allowFractional,
      minQuantity: Number(minQuantity || 0),
      minOrderQuantity: Number(minOrderQuantity || 1),
      attributes: normalizedAttributes.map((attr, index) => ({
        attributeName: attr.attributeName.trim(),
        value: attr.value.trim(),
        unit: attr.unit.trim() || undefined,
        sortOrder: index,
      })),
      units: normalizedUnits.map((u) => ({
        unitName: u.unitName,
        conversionToBase: Number(u.conversionToBase),
        isBaseUnit: u.isBaseUnit,
      })),
      ...(isEditing ? { changeReason: changeReason.trim() || undefined } : {}),
    };

    saveProduct.mutate(payload);
  };

  if (isProductLoading || isProductsLoading || isCategoriesLoading) {
    return <LoadingState message="Loading catalog configuration..." />;
  }
  if (productError) {
    return (
      <ErrorState
        title="Product could not be loaded"
        message={(productError as Error).message}
        onRetry={() => void refetchProduct()}
      />
    );
  }
  if (!canManage) {
    return (
      <ErrorState
        title="Catalog editing is restricted"
        message="Only Super Admins and Project Admins can create or modify catalog items."
      />
    );
  }
  if (isEditing && !product) {
    return (
      <ErrorState
        title="Product not found"
        message="This catalog product is no longer available."
      />
    );
  }
  if (isEditing && product?.status !== 'APPROVED') {
    return (
      <ErrorState
        title="Product cannot be edited yet"
        message="Only approved products can receive a specification update. Wait for the pending review to conclude."
      />
    );
  }
  if (isEditing && role === 'SUPER_ADMIN' && product?.ownerScope !== 'COMPANY') {
    return (
      <ErrorState
        title="Project managed item"
        message="Super Admins review project product proposals in the Approvals queue. Project Admins maintain their own catalog."
      />
    );
  }

  const baseUnitObj = units.find((u) => u.isBaseUnit);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        title={
          isEditing
            ? `Propose Changes: ${product?.name}`
            : selectedKind === 'RAW_MATERIAL'
            ? 'Add New Raw Material'
            : 'Add New Manufactured Product'
        }
        description={
          isEditing
            ? 'Your specification and packaging revisions will be submitted for review before taking effect.'
            : role === 'PROJECT_ADMIN'
            ? 'Add a finished formulation to your private project catalog. Specifications and bill of materials remain strictly scoped to your organization.'
            : 'Register a chemical reagent, diagnostic component, or lab consumable into the master company catalog.'
        }
        actions={
          <Link href="/catalog">
            <Button variant="secondary" size="sm">
              ← Back to Catalog
            </Button>
          </Link>
        }
      />

      {/* Global Error Alert */}
      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-xs font-medium text-rose-800 shadow-2xs flex items-center justify-between"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700 font-bold ml-3"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={submitProduct} className="space-y-6">
        {/* Section 1: Product Classification & Identity */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>1. Identification &amp; Taxonomy</CardTitle>
                <CardDescription>
                  Define the product title, functional category, nested subcategory, and manufacturer brand.
                </CardDescription>
              </div>
              <Badge
                variant={selectedKind === 'MANUFACTURED_PRODUCT' ? 'purple' : 'neutral'}
                size="sm"
              >
                {selectedKind === 'MANUFACTURED_PRODUCT'
                  ? 'Manufactured Output'
                  : 'Company Raw Material'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Product Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={140}
                  placeholder="e.g. ALT / SGPT Liquid Diagnostic Reagent 4x100ml"
                  helperText="Full descriptive name including diagnostic target, formulation, or pack sizing."
                />
              </div>

              {/* Main Category */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700 block tracking-tight">
                    Main Category <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setModalCategoryName('');
                      setModalParentId('');
                      setModalError(null);
                      setShowCategoryModal(true);
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    + New Category
                  </button>
                </div>
                <Select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setSubcategoryId('');
                  }}
                  required
                >
                  <option value="">Choose a main category</option>
                  {roots.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Broad functional department (e.g. Clinical Chemistry, Molecular Diagnostics).
                </p>
              </div>

              {/* Subcategory */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700 block tracking-tight">
                    Subcategory (Optional)
                  </label>
                  {categoryId && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalCategoryName('');
                        setModalParentId(categoryId);
                        setModalError(null);
                        setShowCategoryModal(true);
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      + New Subcategory
                    </button>
                  )}
                </div>
                <Select
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  disabled={!categoryId}
                >
                  <option value="">
                    {categoryId
                      ? availableSubcategories.length
                        ? 'General / All (No subcategory)'
                        : 'No subcategories exist yet'
                      : 'Select a main category first'}
                  </option>
                  {availableSubcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Specialized grouping (e.g. Liquid Reagents, Extraction Kits, Calibrators).
                </p>
              </div>

              {/* Brand / Manufacturer */}
              {role !== 'PROJECT_ADMIN' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-700 block tracking-tight">
                      Brand / Manufacturer (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setModalBrandName('');
                        setModalBrandParentId(categoryId || roots[0]?.id || '');
                        setModalBrandError(null);
                        setShowBrandModal(true);
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      + Add Brand
                    </button>
                  </div>
                  <Select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  >
                    <option value="">Unbranded / Generic Reagent</option>
                    {availableBrands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Select an existing manufacturer or click + Add Brand above to register a new one.
                  </p>
                </div>
              )}

              {/* Description */}
              <div>
                <Input
                  label="Description / Catalog Notes (Optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={300}
                  placeholder="e.g. In vitro diagnostic reagent for photometric determination of SGPT."
                  helperText="Internal warehouse handling notes, usage directions, or storage hints."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Packaging Units & Multi-Unit Conversions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>2. Packaging &amp; Unit Conversions</CardTitle>
                <CardDescription>
                  Choose from standardized measurement units or packaging multiples (e.g. Vial, Box, Pack, Carton).
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {role === 'SUPER_ADMIN' && (
                  <Link
                    href="/catalog?tab=UNITS"
                    target="_blank"
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mr-1"
                  >
                    <span>📏 Manage Units Directory ↗</span>
                  </Link>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setModalUnitName('');
                    setModalUnitCategory('PACKAGING');
                    setSaveAsSystemStandard(role === 'SUPER_ADMIN');
                    setModalUnitError(null);
                    setShowUnitModal(true);
                  }}
                >
                  + Add Custom Unit
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setUnits((prev) => [...prev, blankUnit()])}
                >
                  + Add Packaging Unit
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <datalist id="known-unit-names">
              {unitNames.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 w-16 text-center">Base Unit</th>
                    <th className="py-2.5 px-3">Unit Name</th>
                    <th className="py-2.5 px-3 w-48">Conversion Factor</th>
                    <th className="py-2.5 px-3 w-56">Relationship Summary</th>
                    <th className="py-2.5 px-3 w-16 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {units.map((unit, index) => (
                    <tr key={index} className={unit.isBaseUnit ? 'bg-blue-50/40' : 'hover:bg-slate-50/50'}>
                      {/* Radio button for Base Unit */}
                      <td className="py-3 px-3 text-center align-middle">
                        <input
                          type="radio"
                          name="baseUnitSelector"
                          checked={unit.isBaseUnit}
                          onChange={() => setBaseUnit(index)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          title="Set as base unit"
                        />
                      </td>

                      {/* Unit Name Select */}
                      <td className="py-3 px-3 align-middle">
                        <Select
                          value={unit.unitName}
                          onChange={(e) =>
                            setUnits((curr) =>
                              curr.map((item, i) =>
                                i === index ? { ...item, unitName: e.target.value } : item,
                              ),
                            )
                          }
                          required
                          className="text-xs"
                        >
                          <option value="">Select standard unit</option>
                          {unit.unitName && !allStandardUnits.includes(unit.unitName) && (
                            <option value={unit.unitName}>{unit.unitName} (Existing)</option>
                          )}
                          {allStandardUnits.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </Select>
                      </td>

                      {/* Conversion to Base */}
                      <td className="py-3 px-3 align-middle">
                        <Input
                          type="number"
                          min="0.0001"
                          step="any"
                          value={unit.conversionToBase}
                          onChange={(e) =>
                            setUnits((curr) =>
                              curr.map((item, i) =>
                                i === index ? { ...item, conversionToBase: e.target.value } : item,
                              ),
                            )
                          }
                          disabled={unit.isBaseUnit}
                          required
                          className="text-xs font-mono"
                        />
                      </td>

                      {/* Live Relationship Preview */}
                      <td className="py-3 px-3 align-middle text-slate-600">
                        {unit.isBaseUnit ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✓ Primary Base Inventory Unit (1.0)
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-700">
                            1 {unit.unitName || 'Pack'} ={' '}
                            <span className="font-semibold text-blue-700">
                              {unit.conversionToBase || '—'}
                            </span>{' '}
                            {baseUnitObj?.unitName || 'Base Units'}
                          </span>
                        )}
                      </td>

                      {/* Delete button */}
                      <td className="py-3 px-3 text-right align-middle">
                        {units.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const remaining = units.filter((_, i) => i !== index);
                              if (unit.isBaseUnit && remaining.length > 0) {
                                remaining[0].isBaseUnit = true;
                                remaining[0].conversionToBase = '1';
                              }
                              setUnits(remaining);
                            }}
                            className="text-slate-400 hover:text-rose-600 font-bold px-2 py-1 text-sm rounded transition-colors"
                            title="Remove unit"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              <strong>Note:</strong> All physical stock balances and ledger movements are booked against the Base Unit. Packaging multiples are automatically calculated during inbound receiving and outbound dispatch.
            </p>
          </CardContent>
        </Card>

        {/* Section 3: Stock Thresholds */}
        <Card>
          <CardHeader>
            <CardTitle>3. Inventory Tracking &amp; Replenishment Thresholds</CardTitle>
            <CardDescription>Set minimum safety stock and replenishment thresholds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-slate-100">
              {/* Minimum Stock Alert */}
              <Input
                label="Low-Stock Safety Alert Threshold"
                type="number"
                min="0"
                step="0.01"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                placeholder="0"
                helperText={`Safety reserve in ${baseUnitObj?.unitName || 'base units'}. System fires an alert when usable warehouse stock dips below this value.`}
              />

              {/* Minimum Order Quantity (MOQ) */}
              <Input
                label="Minimum Order Quantity (MOQ)"
                type="number"
                min="0.01"
                step="any"
                value={minOrderQuantity}
                onChange={(e) => setMinOrderQuantity(e.target.value)}
                placeholder="1"
                required
                helperText={`Minimum order requirement per request line in ${baseUnitObj?.unitName || 'base units'}.`}
              />

              {/* Fractional Quantities */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700 block tracking-tight">
                  Decimal &amp; Fractional Measurement
                </label>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowFractional}
                      onChange={(e) => {
                        setAllowFractional(e.target.checked);
                        if (!e.target.checked) setQuantityPrecision('0');
                        else if (quantityPrecision === '0') setQuantityPrecision('2');
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Allow fractional / decimal quantities</span>
                  </label>
                  {allowFractional && (
                    <div className="pt-2 border-t border-slate-200/80">
                      <Select
                        label="Quantity Decimal Precision"
                        value={quantityPrecision}
                        onChange={(e) => setQuantityPrecision(e.target.value)}
                      >
                        <option value="1">1 Decimal Place (e.g. 12.5 kg)</option>
                        <option value="2">2 Decimal Places (e.g. 12.75 ml)</option>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Technical Specifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>4. Technical Specifications &amp; Formulation Properties</CardTitle>
                <CardDescription>
                  Document chemical attributes, assay methods, purity, storage temperatures, or catalog specs.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAttributes((prev) => [...prev, blankAttribute()])}
              >
                + Add Specification
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <datalist id="known-spec-names">
              {COMMON_SPEC_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>

            {attributes.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <p className="text-xs text-slate-500">
                  No technical attributes added yet. Click <strong>+ Add Specification</strong> above to record properties like Storage Temp (2-8°C), CAS Number, Assay Method, or Purity.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {attributes.map((attr, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1.5fr_1.5fr_1fr_auto] items-center gap-2 p-2 bg-slate-50/70 rounded-lg border border-slate-200"
                  >
                    <Input
                      label={index === 0 ? 'Attribute Name' : undefined}
                      list="known-spec-names"
                      value={attr.attributeName}
                      onChange={(e) =>
                        setAttributes((curr) =>
                          curr.map((item, i) =>
                            i === index ? { ...item, attributeName: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="e.g. Storage Temperature"
                      className="text-xs"
                    />
                    <Input
                      label={index === 0 ? 'Value' : undefined}
                      value={attr.value}
                      onChange={(e) =>
                        setAttributes((curr) =>
                          curr.map((item, i) =>
                            i === index ? { ...item, value: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="e.g. 2 - 8"
                      className="text-xs"
                    />
                    <Input
                      label={index === 0 ? 'Unit (Optional)' : undefined}
                      value={attr.unit}
                      onChange={(e) =>
                        setAttributes((curr) =>
                          curr.map((item, i) =>
                            i === index ? { ...item, unit: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="e.g. °C, %, ml"
                      className="text-xs"
                    />
                    <div className={index === 0 ? 'pt-5' : ''}>
                      <button
                        type="button"
                        onClick={() => setAttributes((curr) => curr.filter((_, i) => i !== index))}
                        className="text-slate-400 hover:text-rose-600 font-bold p-2 text-sm rounded transition-colors"
                        title="Remove specification"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 5: Version Proposal Reason (When Editing) */}
        {isEditing && (
          <Card className="border-amber-200 bg-amber-50/20">
            <CardHeader>
              <CardTitle>5. Reason for Version Revision</CardTitle>
              <CardDescription>
                Super Admins require an explanation of changes before approving this new product version.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                label="Change Rationale"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                maxLength={300}
                required
                placeholder="e.g. Updated primary supplier packaging from 50ml to 100ml vials with updated SDS."
                helperText="Recorded permanently in the product version audit trail."
              />
            </CardContent>
          </Card>
        )}

        {/* Form Action Footer */}
        <div className="flex flex-col-reverse gap-3 pt-4 border-t border-slate-200 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/catalog">
            <Button variant="secondary" size="md">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={saveProduct.isPending}
            disabled={saveProduct.isPending || !categoryId}
          >
            {isEditing
              ? 'Submit Version for Super Admin Approval'
              : selectedKind === 'MANUFACTURED_PRODUCT'
              ? 'Submit Manufactured Product Proposal'
              : 'Save & Publish Raw Material'}
          </Button>
        </div>
      </form>

      {/* Quick Category & Subcategory Creation Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title={modalParentId ? 'Add New Subcategory' : 'Add New Category'}
        description={
          modalParentId
            ? `Create a specialized subcategory nested under "${
                roots.find((r) => r.id === modalParentId)?.name || 'the selected parent'
              }".`
            : role === 'PROJECT_ADMIN'
            ? 'Create a private category scoped to your organization for manufactured products.'
            : 'Create a top-level category available for company raw materials and inventory.'
        }
      >
        <div className="space-y-4 pt-2">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              {modalError}
            </div>
          )}

          <Input
            label="Category Name"
            value={modalCategoryName}
            onChange={(e) => setModalCategoryName(e.target.value)}
            required
            maxLength={100}
            placeholder={modalParentId ? 'e.g. Liquid Diagnostic Reagents' : 'e.g. Clinical Chemistry & Reagents'}
          />

          <Select
            label="Parent Category"
            value={modalParentId}
            onChange={(e) => setModalParentId(e.target.value)}
          >
            <option value="">Top-Level Category (No parent)</option>
            {roots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCategoryModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={saveCategory.isPending}
              disabled={!modalCategoryName.trim() || saveCategory.isPending}
              onClick={() => saveCategory.mutate()}
            >
              Create Category
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Brand Creation Modal */}
      <Modal
        isOpen={role !== 'PROJECT_ADMIN' && showBrandModal}
        onClose={() => setShowBrandModal(false)}
        title="Register New Brand / Manufacturer"
        description="Add a recognized laboratory manufacturer, supplier, or trade brand to your catalog taxonomy."
      >
        <div className="space-y-4 pt-2">
          {modalBrandError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              {modalBrandError}
            </div>
          )}

          <Input
            label="Brand / Manufacturer Name"
            value={modalBrandName}
            onChange={(e) => setModalBrandName(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. Beckman Coulter, Bio-Rad, Roche, Labco BioAssay, Merck"
            helperText="The trade brand or manufacturer name printed on product labels."
          />

          <Select
            label="Category for this Brand"
            value={modalBrandParentId}
            onChange={(e) => setModalBrandParentId(e.target.value)}
            required
          >
            <option value="">Select a main category</option>
            {roots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>

          <p className="text-[11px] text-slate-500">
            Once saved, this brand will be immediately applied to this product and saved for future catalog items.
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
              isLoading={saveBrand.isPending}
              disabled={!modalBrandName.trim() || !modalBrandParentId || saveBrand.isPending}
              onClick={() => saveBrand.mutate()}
            >
              Save Brand
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Custom Unit Creation Modal */}
      <Modal
        isOpen={showUnitModal}
        onClose={() => setShowUnitModal(false)}
        title="Register Measurement Unit"
        description="Add a reusable standard packaging format or scientific measurement unit."
      >
        <div className="space-y-4 pt-2">
          {modalUnitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              {modalUnitError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Unit Name <span className="text-rose-500">*</span>
            </label>
            <Input
              value={modalUnitName}
              onChange={(e) => setModalUnitName(e.target.value)}
              required
              maxLength={60}
              placeholder="e.g. Box of 25, Drum of 200L, Pack of 50 Tests, Pallet"
              helperText="Unit name available across all product packaging and conversion configurations."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Classification / Category
            </label>
            <select
              value={modalUnitCategory}
              onChange={(e) => setModalUnitCategory(e.target.value as any)}
              className="w-full text-xs rounded-lg border border-slate-300 bg-white p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="PACKAGING">Packaging (Boxes, Packs, Cartons, Kits)</option>
              <option value="CONTAINER">Container (Vials, Ampoules, Bottles, Tubes)</option>
              <option value="VOLUME">Volume (Liters, Milliliters, Gallons)</option>
              <option value="WEIGHT">Weight / Mass (Kilograms, Grams, Milligrams)</option>
              <option value="COUNT">Count (Pieces, Units, Strips)</option>
              <option value="OTHER">Other / Specialized</option>
            </select>
          </div>

          {role === 'SUPER_ADMIN' && (
            <label className="flex items-start gap-2 pt-1 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsSystemStandard}
                onChange={(e) => setSaveAsSystemStandard(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <strong>Save to System Standard Units Directory</strong>
                <span className="block text-[11px] text-slate-500">
                  Persists globally so this unit is automatically available for all other products and future sessions.
                </span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowUnitModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!modalUnitName.trim() || saveStandardUnitMutation.isPending}
              isLoading={saveStandardUnitMutation.isPending}
              onClick={async () => {
                const trimmed = modalUnitName.trim();
                if (!trimmed) return;

                if (role === 'SUPER_ADMIN' && saveAsSystemStandard) {
                  try {
                    await saveStandardUnitMutation.mutateAsync({
                      name: trimmed,
                      category: modalUnitCategory,
                    });
                  } catch (err: any) {
                    // If already exists or error, display it unless it's just already in the list
                    if (!err.message?.includes('already exists')) {
                      setModalUnitError(err.message || 'Failed to save unit to system registry');
                      return;
                    }
                  }
                }

                setCustomUnits((prev) => [...prev, trimmed]);
                // Set on last unit if empty, or append new unit row
                setUnits((curr) => {
                  const last = curr[curr.length - 1];
                  if (last && !last.unitName) {
                    return curr.map((u, i) => (i === curr.length - 1 ? { ...u, unitName: trimmed } : u));
                  }
                  return [...curr, { unitName: trimmed, conversionToBase: '1', isBaseUnit: false }];
                });
                setShowUnitModal(false);
                setModalUnitName('');
                setModalUnitError(null);
              }}
            >
              Add Standard Unit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
