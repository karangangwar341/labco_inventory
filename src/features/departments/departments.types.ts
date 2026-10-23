import {
  DepartmentDto,
  DepartmentIssueDto,
  DepartmentIssueBatchDto,
  CreateDepartmentDto,
  CreateDepartmentIssueDto,
  DepartmentStatus,
  DepartmentIssueStatus,
  DepartmentReturnDto,
  CreateDepartmentReturnDto,
} from '../../types/api';

export type Department = DepartmentDto;
export type DepartmentIssue = DepartmentIssueDto;
export type DepartmentIssueBatch = DepartmentIssueBatchDto;
export type CreateDepartmentPayload = CreateDepartmentDto;
export type CreateDepartmentIssuePayload = CreateDepartmentIssueDto;
export type DepartmentReturn = DepartmentReturnDto;
export type CreateDepartmentReturnPayload = CreateDepartmentReturnDto;
export type { DepartmentStatus, DepartmentIssueStatus };
