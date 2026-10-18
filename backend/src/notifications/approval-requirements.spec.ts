import { describe, expect, it } from 'vitest';
import { ImportType, RequestType } from '@prisma/client';
import {
  DEFAULT_APPROVAL_REQUIREMENTS,
  importRequiresApproval,
  mergeApprovalRequirements,
} from './approval-requirements.js';

describe('approval requirements settings', () => {
  it('requires Super Admin approval for every supported workflow by default', () => {
    const requirements = mergeApprovalRequirements(undefined);

    expect(Object.values(requirements.stockRequests)).toEqual(
      Object.values(DEFAULT_APPROVAL_REQUIREMENTS.stockRequests),
    );
    expect(requirements.shipmentReceipt).toBe(true);
    expect(requirements.manufacturing).toBe(true);
    expect(requirements.departmentIssue).toBe(true);
    expect(requirements.departmentReturn).toBe(true);
    expect(requirements.imports).toEqual({ stockIn: true, stockOut: true });
  });

  it('merges valid partial values and ignores unknown or non-boolean settings', () => {
    const requirements = mergeApprovalRequirements({
      stockRequests: { [RequestType.STOCK_OUT]: false, unexpected: false },
      departmentIssue: false,
      departmentReturn: 'false',
      imports: { stockIn: false, unknown: false },
      unexpectedWorkflow: false,
    });

    expect(requirements.stockRequests.STOCK_OUT).toBe(false);
    expect(requirements.stockRequests.STOCK_IN).toBe(true);
    expect(requirements.departmentIssue).toBe(false);
    expect(requirements.departmentReturn).toBe(true);
    expect(requirements.imports).toEqual({ stockIn: false, stockOut: true });
    expect(Object.keys(requirements.stockRequests)).not.toContain('unexpected');
  });

  it('keeps unsupported import types approval-gated even when stock imports are configured for immediate posting', () => {
    const requirements = mergeApprovalRequirements({ imports: { stockIn: false, stockOut: false } });

    expect(importRequiresApproval(ImportType.STOCK_IN, requirements)).toBe(false);
    expect(importRequiresApproval(ImportType.STOCK_OUT, requirements)).toBe(false);
    expect(importRequiresApproval(ImportType.PHYSICAL_COUNT, requirements)).toBe(true);
    expect(importRequiresApproval(ImportType.PRODUCT_CATALOG, requirements)).toBe(true);
  });
});
