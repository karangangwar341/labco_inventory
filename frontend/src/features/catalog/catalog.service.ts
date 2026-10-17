import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { CatalogProduct, CategoryDto } from './catalog.types';
import { CreateProductDto, ProductVersionSummaryDto, ReviewProductDto } from '../../types/api/catalog';

export const catalogService = {
  getProducts: async (params?: { search?: string; categoryId?: string }): Promise<CatalogProduct[]> => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.categoryId) q.set('categoryId', params.categoryId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get<CatalogProduct[]>(`${endpoints.catalog.products()}${qs}`);
  },

  getManufacturingOptions: async (): Promise<{ rawMaterials: CatalogProduct[]; manufacturedProducts: CatalogProduct[] }> => {
    return apiClient.get<{ rawMaterials: CatalogProduct[]; manufacturedProducts: CatalogProduct[] }>(`${endpoints.catalog.products()}/manufacturing-options`);
  },

  getProductById: async (id: string): Promise<CatalogProduct> => {
    return apiClient.get<CatalogProduct>(endpoints.catalog.productById(id));
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
