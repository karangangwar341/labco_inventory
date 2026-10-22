import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { CatalogProduct, CategoryDto } from './catalog.types';
import { CreateProductDto, ProductVersionSummaryDto, ReviewProductDto } from '../../types/api/catalog';

function normalizeProduct(p: CatalogProduct): CatalogProduct {
  const baseUnit =
    p.units?.find((u) => u.isBaseUnit && u.status !== 'SUPERSEDED')?.unitName ||
    p.units?.find((u) => u.isBaseUnit)?.unitName ||
    p.baseUnit ||
    'Units';
  return {
    ...p,
    baseUnit,
    minThreshold: Number(p.minQuantity ?? p.minThreshold ?? 0),
  };
}

export const catalogService = {
  getProducts: async (params?: { search?: string; categoryId?: string }): Promise<CatalogProduct[]> => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.categoryId) q.set('categoryId', params.categoryId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const raw = await apiClient.get<CatalogProduct[]>(`${endpoints.catalog.products()}${qs}`);
    return (raw || []).map(normalizeProduct);
  },

  getManufacturingOptions: async (clientId?: string): Promise<{ rawMaterials: CatalogProduct[]; manufacturedProducts: CatalogProduct[] }> => {
    const qs = clientId ? `?clientId=${clientId}` : '';
    const res = await apiClient.get<{ rawMaterials: CatalogProduct[]; manufacturedProducts: CatalogProduct[] }>(`${endpoints.catalog.products()}/manufacturing-options${qs}`);
    return {
      rawMaterials: (res?.rawMaterials || []).map(normalizeProduct),
      manufacturedProducts: (res?.manufacturedProducts || []).map(normalizeProduct),
    };
  },

  getProductById: async (id: string): Promise<CatalogProduct> => {
    const p = await apiClient.get<CatalogProduct>(endpoints.catalog.productById(id));
    return normalizeProduct(p);
  },

  createProduct: async (payload: CreateProductDto): Promise<CatalogProduct> => {
    return apiClient.post<CatalogProduct>(endpoints.catalog.products(), payload);
  },

  proposeProductVersion: async (id: string, payload: CreateProductDto): Promise<ProductVersionSummaryDto> => {
    return apiClient.patch<ProductVersionSummaryDto>(endpoints.catalog.productById(id), payload);
  },

  reviewProduct: async (id: string, payload: ReviewProductDto): Promise<CatalogProduct> => {
    return apiClient.post(endpoints.catalog.reviewProduct(id), payload);
  },

  reviewProductVersion: async (id: string, versionId: string, payload: ReviewProductDto) => {
    return apiClient.post(endpoints.catalog.reviewProductVersion(id, versionId), payload);
  },

  createCategory: async (payload: { name: string; parentId?: string }): Promise<CategoryDto> => {
    return apiClient.post<CategoryDto>(endpoints.catalog.categories(), payload);
  },

  getCategories: async (): Promise<CategoryDto[]> => {
    return apiClient.get<CategoryDto[]>(endpoints.catalog.categories());
  },
};
