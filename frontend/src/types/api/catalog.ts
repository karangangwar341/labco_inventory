export interface ProductDto {
  id: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  sku?: string;
  categoryId: string;
  kind: 'RAW_MATERIAL' | 'MANUFACTURED_PRODUCT';
  category?: CategoryDto;
  categoryName?: string;
  ownerScope?: 'COMPANY' | 'PROJECT';
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  baseUnit: string;
  minThreshold: number;
  minQuantity?: number | string;
  minOrderQuantity?: number | string;
  isActive: boolean;
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  quantityPrecision?: number;
  allowFractional?: boolean;
  createdAt: string;
  attributes?: ProductAttributeDto[];
  units?: ProductUnitDto[];
  versions?: ProductVersionSummaryDto[];
}

export interface CategoryDto {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  ownerScope?: 'COMPANY' | 'PROJECT';
  projectId?: string | null;
  parent?: CategoryDto | null;
  children?: CategoryDto[];
}

export interface ProductAttributeDto {
  id?: string;
  attributeName: string;
  value: string;
  unit?: string | null;
  sortOrder?: number;
}

export interface ProductUnitDto {
  id?: string;
  unitName: string;
  isBaseUnit: boolean;
  conversionToBase: number | string;
  status?: 'ACTIVE' | 'SUPERSEDED';
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

export interface ProductVersionSummaryDto {
  id: string;
  versionNumber: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  changeReason?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  effectiveFrom?: string | null;
}

export interface CreateProductDto {
  kind: 'RAW_MATERIAL' | 'MANUFACTURED_PRODUCT';
  name: string;
  brand?: string;
  categoryId: string;
  description?: string;
  quantityPrecision: number;
  allowFractional: boolean;
  minQuantity?: number;
  minOrderQuantity?: number;
  attributes?: ProductAttributeDto[];
  units: Array<Pick<ProductUnitDto, 'unitName' | 'isBaseUnit' | 'conversionToBase'>>;
  changeReason?: string;
}

export interface ReviewProductDto {
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}
