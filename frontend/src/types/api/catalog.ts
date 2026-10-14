export interface ProductDto {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName?: string;
  baseUnit: string;
  minThreshold: number;
  isActive: boolean;
  createdAt: string;
}

export interface CategoryDto {
  id: string;
  name: string;
  description?: string;
}
