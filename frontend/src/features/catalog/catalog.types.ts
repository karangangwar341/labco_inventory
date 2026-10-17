import { ProductDto, ProductUnitDto, CategoryDto } from '../../types/api';

export type ProductUnitConversion = ProductUnitDto;

export interface CatalogProduct extends ProductDto {
  trackingMode?: 'NONE' | 'BATCH_ONLY' | 'EXPIRY_ONLY' | 'BOTH';
  trackExpiry?: boolean;
  category?: CategoryDto;
}

export type { CategoryDto };
