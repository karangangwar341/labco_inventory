import { DepartmentStatus, DepartmentIssueStatus } from './common';

export interface DepartmentDto {
  id: string;
  name: string;
  clientId: string;
  clientName?: string;
  status: DepartmentStatus;
  activeUserCount?: number;
  createdAt: string;
}

export interface DepartmentIssueLineDto {
  productId: string;
  productName?: string;
  quantity: number;
  unit?: string;
}

export interface DepartmentIssueDto {
  id: string;
  issueNumber: string;
  departmentId: string;
  departmentName?: string;
  status: DepartmentIssueStatus;
  items: DepartmentIssueLineDto[];
  reason: string;
  createdAt: string;
}

export interface CreateDepartmentDto {
  name: string;
  clientId?: string;
}

export interface CreateDepartmentIssueDto {
  departmentId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  reason: string;
}
