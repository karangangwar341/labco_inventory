export type UserRole = 'SUPER_ADMIN' | 'STORE_ADMIN' | 'CLIENT_ADMIN';

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

export type ImportBatchStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED';

export interface UserSession {
  id: string;
  username: string;
  role: UserRole;
  clientId?: string | null;
  assignedWarehouseIds?: string[];
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
