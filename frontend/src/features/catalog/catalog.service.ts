import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { CatalogProduct, CategoryDto } from './catalog.types';

export const catalogService = {
  getProducts: async (params?: { search?: string; categoryId?: string }): Promise<CatalogProduct[]> => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.categoryId) q.set('categoryId', params.categoryId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get<CatalogProduct[]>(`${endpoints.catalog.products()}${qs}`);
  },

  getProductById: async (id: string): Promise<CatalogProduct> => {
    return apiClient.get<CatalogProduct>(endpoints.catalog.productById(id));
  },

  getCategories: async (): Promise<CategoryDto[]> => {
    return apiClient.get<CategoryDto[]>(endpoints.catalog.categories());
  },
};
