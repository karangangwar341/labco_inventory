import { ProductDto, ProductUnitDto, CategoryDto } from '../../types/api';

export type ProductUnitConversion = ProductUnitDto;

export interface CatalogProduct extends ProductDto {
  trackingMode?: 'NONE' | 'BATCH_ONLY' | 'EXPIRY_ONLY' | 'BOTH';
  trackExpiry?: boolean;
  category?: CategoryDto;
}

export interface StandardUnitDto {
  name: string;
  category: 'CONTAINER' | 'PACKAGING' | 'VOLUME' | 'WEIGHT' | 'COUNT' | 'OTHER';
  description?: string;
  isPreset?: boolean;
  productCount?: number;
  createdAt?: string;
}

export interface CreateStandardUnitPayload {
  name: string;
  category?: string;
  description?: string;
}

export type { CategoryDto };
