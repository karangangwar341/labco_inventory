import { ProductDto, CategoryDto } from '../../types/api';

export interface ProductUnitConversion {
  id: string;
  unitName: string;
  conversionToBase: number;
  isBaseUnit: boolean;
}

export interface CatalogProduct extends ProductDto {
  trackingMode?: 'NONE' | 'BATCH' | 'SERIAL';
  trackExpiry?: boolean;
  units?: ProductUnitConversion[];
  category?: { id: string; name: string };
}

export type { CategoryDto };
