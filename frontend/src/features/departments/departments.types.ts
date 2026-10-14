import {
  DepartmentDto,
  DepartmentIssueDto,
  CreateDepartmentDto,
  CreateDepartmentIssueDto,
  DepartmentStatus,
  DepartmentIssueStatus,
} from '../../types/api';

export type Department = DepartmentDto;
export type DepartmentIssue = DepartmentIssueDto;
export type CreateDepartmentPayload = CreateDepartmentDto;
export type CreateDepartmentIssuePayload = CreateDepartmentIssueDto;
export type { DepartmentStatus, DepartmentIssueStatus };
