'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogService } from '../catalog.service';
import { StandardUnitDto } from '../catalog.types';
import { queryKeys } from '../../../lib/query/query-keys';
import { useAuth } from '../../auth/auth.store';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';

type CategoryFilter = 'ALL' | 'CONTAINER' | 'PACKAGING' | 'VOLUME' | 'WEIGHT' | 'COUNT' | 'OTHER';

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  ALL: 'All Units',
  CONTAINER: 'Containers',
  PACKAGING: 'Packaging & Packs',
  VOLUME: 'Volume / Liquid',
  WEIGHT: 'Weight / Mass',
  COUNT: 'Piece & Count',
  OTHER: 'Other / Specialized',
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  CONTAINER: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: '🧪' },
  PACKAGING: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: '📦' },
  VOLUME: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', icon: '💧' },
  WEIGHT: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: '⚖️' },
  COUNT: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: '🔢' },
  OTHER: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: '📏' },
};

export function UnitsDirectory() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('ALL');

  // Modal State for adding a unit
  const [showAddModal, setShowAddModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<'CONTAINER' | 'PACKAGING' | 'VOLUME' | 'WEIGHT' | 'COUNT' | 'OTHER'>('PACKAGING');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Deletion confirm modal
  const [unitToDelete, setUnitToDelete] = useState<StandardUnitDto | null>(null);

  const {
    data: units = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.catalog.units(),
    queryFn: () => catalogService.getStandardUnits(),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: catalogService.createStandardUnit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.units() });
      setShowAddModal(false);
      setNameInput('');
      setDescriptionInput('');
      setCategoryInput('PACKAGING');
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to create standard unit template');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: catalogService.deleteStandardUnit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.units() });
      setUnitToDelete(null);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      setFormError('Unit name is required');
      return;
    }
    setFormError(null);
    createMutation.mutate({
      name: nameInput.trim(),
      category: categoryInput,
      description: descriptionInput.trim() || undefined,
    });
  };

  // Filtered units
  const filteredUnits = useMemo(() => {
    return units.filter((unit) => {
      const matchesSearch =
        searchTerm.trim() === '' ||
        unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (unit.description && unit.description.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCat =
        selectedCategory === 'ALL' || unit.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [units, searchTerm, selectedCategory]);

  // Statistics
  const stats = useMemo(() => {
    const total = units.length;
    const presets = units.filter((u) => u.isPreset).length;
    const custom = units.filter((u) => !u.isPreset).length;
    const inUse = units.filter((u) => (u.productCount ?? 0) > 0).length;
    return { total, presets, custom, inUse };
  }, [units]);

  if (isLoading) return <LoadingState message="Loading standard units directory..." />;
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Could not load measurement units'} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <Card className="bg-gradient-to-br from-blue-50/70 to-white border-blue-200/80 shadow-2xs">
          <CardContent className="p-3 sm:p-4">
            <div className="text-[11px] sm:text-xs font-semibold text-blue-900">Total Units</div>
            <div className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">
              {stats.total}{' '}
              <span className="text-[10px] sm:text-xs font-normal text-slate-500">units</span>
            </div>
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-slate-500 truncate">Measurement templates</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-50/70 to-white border-indigo-200/80 shadow-2xs">
          <CardContent className="p-3 sm:p-4">
            <div className="text-[11px] sm:text-xs font-semibold text-indigo-900">Standard Presets</div>
            <div className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">
              {stats.presets}{' '}
              <span className="text-[10px] sm:text-xs font-normal text-slate-500">built-in</span>
            </div>
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-slate-500 truncate">Core warehouse units</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50/70 to-white border-purple-200/80 shadow-2xs">
          <CardContent className="p-3 sm:p-4">
            <div className="text-[11px] sm:text-xs font-semibold text-purple-900">Custom Units</div>
            <div className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">
              {stats.custom}{' '}
              <span className="text-[10px] sm:text-xs font-normal text-slate-500">custom</span>
            </div>
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-slate-500 truncate">Added by Super Admin</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50/70 to-white border-emerald-200/80 shadow-2xs">
          <CardContent className="p-3 sm:p-4">
            <div className="text-[11px] sm:text-xs font-semibold text-emerald-900">Catalog In-Use</div>
            <div className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">
              {stats.inUse}{' '}
              <span className="text-[10px] sm:text-xs font-normal text-slate-500">referenced</span>
            </div>
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-slate-500 truncate">Used in active products</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Header & Controls */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>📏 Standard Measurement Units Directory</span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                  {filteredUnits.length}
                </span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Pre-defined units available when creating and managing catalog items, stock requests, and conversions.
              </CardDescription>
            </div>

            {isSuperAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setShowAddModal(true);
                }}
                className="shrink-0 min-h-[38px] flex items-center gap-1.5 shadow-sm"
              >
                <span>➕ Add Standard Unit</span>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          {/* Search & Category Filter Chips */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="w-full md:max-w-xs">
              <Input
                placeholder="Search unit by name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((catKey) => {
                const count =
                  catKey === 'ALL'
                    ? units.length
                    : units.filter((u) => u.category === catKey).length;
                const isActive = selectedCategory === catKey;

                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setSelectedCategory(catKey)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>{CATEGORY_LABELS[catKey]}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Units Grid */}
          {filteredUnits.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <span className="text-3xl">📏</span>
              <h3 className="mt-2 text-sm font-semibold text-slate-800">No measurement units found</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                {searchTerm || selectedCategory !== 'ALL'
                  ? 'Try clearing filters or search term to see more measurement units.'
                  : 'No standard units configured yet.'}
              </p>
              {(searchTerm || selectedCategory !== 'ALL') && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 text-xs"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('ALL');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredUnits.map((unit) => {
                const catStyle = CATEGORY_COLORS[unit.category] || CATEGORY_COLORS.OTHER;
                const isPreset = Boolean(unit.isPreset);
                const count = unit.productCount ?? 0;

                return (
                  <div
                    key={unit.name}
                    className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-2xs transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                            <span>{catStyle.icon}</span>
                            <span>{unit.name}</span>
                          </h4>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
                          >
                            {unit.category}
                          </span>
                          {isPreset ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              Preset
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                              Custom
                            </span>
                          )}
                        </div>
                      </div>

                      {unit.description ? (
                        <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">
                          {unit.description}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-slate-400 italic">No description provided</p>
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <span className="font-semibold text-slate-700">{count}</span>
                        <span>{count === 1 ? 'product using this' : 'products using this'}</span>
                      </span>

                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setUnitToDelete(unit)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded transition-colors text-xs font-semibold cursor-pointer"
                          title="Remove unit template"
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Unit Modal */}
      {showAddModal && isSuperAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Standard Unit Template</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Available globally for all products, stock requests, and unit conversions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Unit Name <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g., Box of 25, Drum (50L), Syringe 5ml"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="text-xs"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">Must be unique across all measurement units.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Classification / Category
                </label>
                <select
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value as any)}
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description / Specifications (Optional)
                </label>
                <Input
                  placeholder="e.g., Standard laboratory sealed box of 25 glass vials"
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={createMutation.isPending}
                >
                  Save Unit Template
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {unitToDelete && isSuperAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-5 space-y-4 animate-fade-in">
            <div className="flex items-start gap-3">
              <span className="text-2xl p-2 bg-rose-50 text-rose-600 rounded-xl">⚠️</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Remove Unit &ldquo;{unitToDelete.name}&rdquo;?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  This will remove the unit from the standard template choices for new products.
                  {Boolean(unitToDelete.productCount) && (
                    <span className="block mt-1 font-semibold text-amber-700">
                      Note: {unitToDelete.productCount} existing product(s) currently reference this unit and will retain their unit settings.
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setUnitToDelete(null)}
              >
                Keep Unit
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(unitToDelete.name)}
              >
                Yes, Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
