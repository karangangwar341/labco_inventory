import { DepartmentStatus, DepartmentIssueStatus } from './common';

export interface DepartmentDto {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
  status: DepartmentStatus;
  proposedName?: string | null;
  proposedStatus?: DepartmentStatus | null;
  activeUserCount?: number;
  createdAt: string;
}

export interface DepartmentIssueDto {
  id: string;
  issueBatchId?: string | null;
  issueNumber: string;
  indentNumber: string;
  departmentId: string;
  departmentName?: string;
  department?: { id: string; name: string };
  productId: string;
  productName?: string;
  product?: { id: string; name: string };
  requestedQuantity: number | string;
  quantity: number | string;
  unitNameSnapshot?: string;
  unit?: { id: string; unitName: string };
  status: DepartmentIssueStatus;
  notes?: string | null;
  createdAt: string;
  issuedAt?: string | null;
}

export interface DepartmentIssueBatchDto {
  id: string;
  projectId: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'POSTED' | 'REJECTED';
  createdById: string;
  createdAt: string;
  submittedAt?: string | null;
  issues: DepartmentIssueDto[];
}

export interface CreateDepartmentDto {
  name: string;
  projectId?: string;
}

export interface CreateDepartmentIssueDto {
  departmentId: string;
  indentNumber?: string;
  productId: string;
  requestedQuantity?: number;
  quantity: number;
  unitId?: string;
  unitName?: string;
  notes?: string;
}

export type DepartmentReturnStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'POSTED' | 'REJECTED';

export interface DepartmentReturnDto {
  id: string;
  projectId: string;
  departmentId?: string | null;
  departmentIssueId?: string | null;
  department?: { id: string; name: string } | null;
  productId: string;
  product?: { id: string; name: string };
  quantity: number | string;
  unitNameSnapshot?: string;
  reason: string;
  status: DepartmentReturnStatus;
  rejectionReason?: string | null;
  createdAt: string;
  approvedAt?: string | null;
}

export interface CreateDepartmentReturnDto {
  departmentIssueId: string;
  productId: string;
  quantity: number;
  unitId?: string;
  reason: string;
  notes?: string;
}
