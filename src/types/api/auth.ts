import { UserRole, UserStatus } from './common';

export interface LoginDto {
  username: string;
  password: string;
}

export interface UserSummaryDto {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  projectId?: string | null;
  assignedWarehouseIds?: string[];
}

export interface AuthResponseDto {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserSummaryDto;
  bootstrap?: AppBootstrap;
}

export interface AppBootstrap {
  user: CurrentUserProfile;
  products: Array<{
    id: string;
    name: string;
    kind: string;
    brand: string | null;
    description: string | null;
    categoryId: string;
    ownerScope: 'COMPANY' | 'PROJECT';
    projectId: string | null;
    status: 'APPROVED';
    quantityPrecision: number;
    allowFractional: boolean;
    minQuantity: string;
    minOrderQuantity: string;
    createdAt: string;
    category: { id: string; name: string; parentId: string | null; ownerScope: 'COMPANY' | 'PROJECT'; projectId: string | null };
    units: Array<{ id: string; unitName: string; isBaseUnit: boolean; conversionToBase: string | number }>;
  }>;
  categories: Array<{ id: string; name: string; parentId: string | null; ownerScope: 'COMPANY' | 'PROJECT'; projectId: string | null }>;
  locations: Array<{ id: string; name: string; locationType: 'WAREHOUSE' | 'PROJECT'; warehouseId: string | null; projectId: string | null }>;
}

export interface CurrentUserProfile {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  sessionId?: string;
  projectId?: string | null;
  assignedWarehouseIds?: string[];
}
