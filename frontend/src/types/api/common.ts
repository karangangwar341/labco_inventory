export type UserRole = 'SUPER_ADMIN' | 'STORE_ADMIN' | 'CLIENT_ADMIN';
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';
export type StockCondition = 'USABLE' | 'DAMAGED' | 'EXPIRED';

export type RequestStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type ShipmentStatus =
  | 'PENDING'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'DISCREPANCY_HOLD';

export type ProductionStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'COMPLETED'
  | 'CANCELLED';

export type DepartmentStatus =
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'REJECTED';

export type DepartmentIssueStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export type ImportBatchStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED';

export type ImportType = 'INVENTORY_COUNT' | 'STOCK_IN' | 'STOCK_OUT';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
  statusCode?: number;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  details?: Record<string, unknown>;
}
