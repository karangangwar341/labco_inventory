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
  clientId?: string | null;
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
    ownerScope: 'COMPANY' | 'CLIENT';
    clientId: string | null;
    status: 'APPROVED';
    quantityPrecision: number;
    allowFractional: boolean;
    minQuantity: string;
    minOrderQuantity: string;
    trackingMode: string;
    createdAt: string;
    category: { id: string; name: string; parentId: string | null; ownerScope: 'COMPANY' | 'CLIENT'; clientId: string | null };
    units: Array<{ id: string; unitName: string; isBaseUnit: boolean; conversionToBase: string | number }>;
  }>;
  categories: Array<{ id: string; name: string; parentId: string | null; ownerScope: 'COMPANY' | 'CLIENT'; clientId: string | null }>;
  locations: Array<{ id: string; name: string; locationType: 'WAREHOUSE' | 'CLIENT'; warehouseId: string | null; clientId: string | null }>;
}

export interface CurrentUserProfile {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  sessionId?: string;
  clientId?: string | null;
  assignedWarehouseIds?: string[];
}
