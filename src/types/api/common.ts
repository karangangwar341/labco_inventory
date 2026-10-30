export type UserRole = 'SUPER_ADMIN' | 'STORE_ADMIN' | 'PROJECT_ADMIN';
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';
export type StockCondition = 'USABLE' | 'DAMAGED';

export type RequestStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'POSTED'
  | 'REJECTED'
  | 'CANCELLED';

export type ShipmentStatus =
  | 'PENDING'
  | 'IN_TRANSIT'
  | 'AWAITING_RECEIPT_APPROVAL'
  | 'COMPLETED'
  | 'DISCREPANCY_HOLD';

export type ProductionStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'POSTED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'CANCELLED';

export type DepartmentStatus =
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'REJECTED';

export type DepartmentIssueStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'POSTED'
  | 'REJECTED';

export type ImportBatchStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'POSTED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED';

export type ImportType = 'STOCK_IN' | 'STOCK_OUT' | 'PRODUCT_CATALOG' | 'PHYSICAL_COUNT';

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
