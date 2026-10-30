import { ImportType, RequestType } from '@prisma/client';

export interface ApprovalRequirements {
  stockRequests: Record<RequestType, boolean>;
  shipmentReceipt: boolean;
  manufacturing: boolean;
  departmentIssue: boolean;
  departmentReturn: boolean;
  imports: {
    stockIn: boolean;
    stockOut: boolean;
  };
}

export const DEFAULT_APPROVAL_REQUIREMENTS: ApprovalRequirements = {
  stockRequests: {
    STOCK_IN: true,
    STOCK_OUT: true,
    DISPATCH: true,
    TRANSFER: true,
    ADJUSTMENT: true,
  },
  shipmentReceipt: true,
  manufacturing: false,
  departmentIssue: true,
  departmentReturn: true,
  imports: {
    stockIn: true,
    stockOut: true,
  },
};

export function mergeApprovalRequirements(value: unknown): ApprovalRequirements {
  const result = structuredClone(DEFAULT_APPROVAL_REQUIREMENTS);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const supplied = value as Record<string, unknown>;
  const requests = supplied.stockRequests;
  if (requests && typeof requests === 'object' && !Array.isArray(requests)) {
    for (const type of Object.keys(result.stockRequests) as RequestType[]) {
      const value = (requests as Record<string, unknown>)[type];
      if (typeof value === 'boolean') result.stockRequests[type] = value;
    }
  }
  for (const key of ['shipmentReceipt', 'manufacturing', 'departmentIssue', 'departmentReturn'] as const) {
    if (typeof supplied[key] === 'boolean') result[key] = supplied[key] as never;
  }
  const imports = supplied.imports;
  if (imports && typeof imports === 'object' && !Array.isArray(imports)) {
    for (const key of ['stockIn', 'stockOut'] as const) {
      const value = (imports as Record<string, unknown>)[key];
      if (typeof value === 'boolean') result.imports[key] = value;
    }
  }
  return result;
}

export function importRequiresApproval(
  importType: ImportType,
  requirements: ApprovalRequirements,
): boolean {
  if (importType === ImportType.STOCK_IN) return requirements.imports.stockIn;
  if (importType === ImportType.STOCK_OUT) return requirements.imports.stockOut;
  // Catalog and physical-count imports do not support configurable immediate posting.
  return true;
}
