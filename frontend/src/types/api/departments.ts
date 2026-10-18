import { DepartmentStatus, DepartmentIssueStatus, StockCondition } from './common';

export interface DepartmentDto {
  id: string;
  name: string;
  clientId: string;
  clientName?: string;
  status: DepartmentStatus;
  proposedName?: string | null;
  proposedStatus?: DepartmentStatus | null;
  activeUserCount?: number;
  createdAt: string;
}

export interface DepartmentIssueDto {
  id: string;
  issueNumber: string;
  departmentId: string;
  departmentName?: string;
  department?: { id: string; name: string };
  productId: string;
  productName?: string;
  product?: { id: string; name: string };
  quantity: number | string;
  unitNameSnapshot?: string;
  unit?: { id: string; unitName: string };
  batchId?: string | null;
  status: DepartmentIssueStatus;
  notes?: string | null;
  createdAt: string;
  issuedAt?: string | null;
}

export interface CreateDepartmentDto {
  name: string;
  clientId?: string;
}

export interface CreateDepartmentIssueDto {
  departmentId: string;
  productId: string;
  quantity: number;
  unitId?: string;
  batchId?: string;
  notes?: string;
}

export type DepartmentReturnStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface DepartmentReturnDto {
  id: string;
  clientId: string;
  departmentId?: string | null;
  departmentIssueId?: string | null;
  department?: { id: string; name: string } | null;
  productId: string;
  product?: { id: string; name: string };
  quantity: number | string;
  unitNameSnapshot?: string;
  condition: StockCondition;
  reason: string;
  status: DepartmentReturnStatus;
  rejectionReason?: string | null;
  createdAt: string;
  approvedAt?: string | null;
}

export interface CreateDepartmentReturnDto {
  departmentIssueId: string;
  productId: string;
  batchId?: string;
  quantity: number;
  unitId?: string;
  condition: StockCondition;
  reason: string;
  notes?: string;
}
