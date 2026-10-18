'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { departmentsService } from '../departments.service';
import { Department, DepartmentIssue } from '../departments.types';
import { DepartmentReturnsPanel } from './DepartmentReturnsPanel';
import { queryKeys } from '../../../lib/query/query-keys';
import { invalidation } from '../../../lib/query/invalidation';
import { useAuth } from '../../auth/auth.store';
import { catalogService } from '../../catalog/catalog.service';
import { inventoryService } from '../../inventory/inventory.service';

export function DepartmentsView() {
  const { role, user } = useAuth();
  const searchParams = useSearchParams();
  const departmentIdFromNotification = searchParams.get('departmentId');
  const handledNotificationId = useRef<string | null>(null);
  const attemptedDepartmentRefresh = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'DEPARTMENTS' | 'ISSUES' | 'RETURNS'>('DEPARTMENTS');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [highlightedDepartmentId, setHighlightedDepartmentId] = useState<string | null>(null);

  // New Department Form State
  const [deptName, setDeptName] = useState('');
  const [issueDepartmentId, setIssueDepartmentId] = useState('');
  const [issueProductId, setIssueProductId] = useState('');
  const [issueBalanceId, setIssueBalanceId] = useState('');
  const [issueUnitId, setIssueUnitId] = useState('');
  const [issueQuantity, setIssueQuantity] = useState('');
  const [issueNotes, setIssueNotes] = useState('');

  const {
    data: departments = [],
    isLoading: isDeptsLoading,
    error: deptsError,
    refetch: refetchDepts,
  } = useQuery({
    queryKey: queryKeys.departments.list(),
    queryFn: async () => {
      const data = await departmentsService.getDepartments();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: history = [],
    isLoading: isIssuesLoading,
    error: issuesError,
    refetch: refetchIssues,
  } = useQuery({
    queryKey: queryKeys.departments.issues(),
    queryFn: async () => {
      const data = await departmentsService.getIssues();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: manufacturingOptions,
    isLoading: isManufacturingOptionsLoading,
    error: manufacturingOptionsError,
    refetch: refetchManufacturingOptions,
  } = useQuery({
    queryKey: queryKeys.catalog.manufacturingOptions(),
    queryFn: () => catalogService.getManufacturingOptions(),
    enabled: role === 'CLIENT_ADMIN',
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: balances = [],
    isLoading: isBalancesLoading,
    error: balancesError,
    refetch: refetchBalances,
  } = useQuery({
    queryKey: queryKeys.inventory.balances(user?.id || user?.role),
    queryFn: () => inventoryService.getBalances(),
    enabled: role === 'CLIENT_ADMIN',
    staleTime: 60 * 1000,
  });

  const isLoading = isDeptsLoading || isIssuesLoading;
  const currentError = errorMsg || [deptsError, issuesError, manufacturingOptionsError, balancesError]
    .find((error): error is Error => error instanceof Error)?.message || null;
  const isIssueDataLoading = isManufacturingOptionsLoading || isBalancesLoading;
  const activeDepartments = departments.filter((department) => department.status === 'ACTIVE');
  const stockedManufacturedProducts = useMemo(() => {
    const stockedIds = new Set(balances
      .filter((balance) => Number(balance.availableQty) > 0)
      .map((balance) => balance.productId));
    return (manufacturingOptions?.manufacturedProducts || []).filter((product) => stockedIds.has(product.id));
  }, [manufacturingOptions, balances]);
  const effectiveIssueDepartmentId = issueDepartmentId || activeDepartments[0]?.id || '';
  const effectiveIssueProductId = issueProductId || stockedManufacturedProducts[0]?.id || '';
  const selectedIssueProduct = stockedManufacturedProducts.find((product) => product.id === effectiveIssueProductId);
  const issueBalances = balances.filter((balance) =>
    balance.productId === effectiveIssueProductId && Number(balance.availableQty) > 0,
  );
  const effectiveIssueBalanceId = issueBalanceId || issueBalances[0]?.id || '';
  const selectedIssueBalance = issueBalances.find((balance) => balance.id === effectiveIssueBalanceId);
  const issueUnits = selectedIssueProduct?.units?.filter((unit) => unit.status !== 'SUPERSEDED') || [];
  const effectiveIssueUnitId = issueUnitId || issueUnits.find((unit) => unit.isBaseUnit)?.id || issueUnits[0]?.id || '';
  const selectedIssueUnit = issueUnits.find((unit) => unit.id === effectiveIssueUnitId);
  const availableInSelectedUnit = selectedIssueBalance && selectedIssueUnit
    ? Number(selectedIssueBalance.availableQty) / Number(selectedIssueUnit.conversionToBase)
    : 0;

  const createMutation = useMutation({
    mutationFn: (payload: { name: string }) =>
      departmentsService.createDepartment(payload),
    onSuccess: () => {
      setIsModalOpen(false);
      setDeptName('');
      setActionSuccess('Department created successfully.');
      invalidation.afterDepartmentMutation(queryClient);
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create department');
    },
  });

  const createIssueMutation = useMutation({
    mutationFn: () => departmentsService.createIssue({
      departmentId: effectiveIssueDepartmentId,
      productId: effectiveIssueProductId,
      quantity: Number(issueQuantity),
      unitId: effectiveIssueUnitId,
      batchId: selectedIssueBalance?.batchId || undefined,
      notes: issueNotes.trim() || undefined,
    }),
    onSuccess: async () => {
      setIsIssueModalOpen(false);
      setIssueQuantity('');
      setIssueNotes('');
      setErrorMsg(null);
      setActionSuccess('Request sent for Super Admin approval. Stock updates after approval.');
      await invalidation.afterDepartmentMutation(queryClient);
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof Error ? err.message : 'Department stock request could not be sent.');
    },
  });

  const handleCreateDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    createMutation.mutate({ name: deptName });
  };

  const approveDepartment = useMutation({
    mutationFn: (id: string) => departmentsService.approveDepartment(id),
    onSuccess: async () => {
      await invalidation.afterDepartmentMutation(queryClient);
      setActionSuccess('Department approved.');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : 'Department could not be approved.'),
  });

  const rejectDepartment = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => departmentsService.rejectDepartment(id, reason),
    onSuccess: async () => {
      await invalidation.afterDepartmentMutation(queryClient);
      setActionSuccess('Department request rejected.');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : 'Department could not be rejected.'),
  });

  useEffect(() => {
    if (!departmentIdFromNotification || isDeptsLoading || handledNotificationId.current === departmentIdFromNotification) return;
    const target = departments.find((department) => department.id === departmentIdFromNotification);
    if (!target) {
      if (attemptedDepartmentRefresh.current !== departmentIdFromNotification) {
        attemptedDepartmentRefresh.current = departmentIdFromNotification;
        departmentsService.getDepartmentById(departmentIdFromNotification).then((department) => {
          queryClient.setQueryData<Department[]>(queryKeys.departments.list(), (current = []) =>
            current.some((item) => item.id === department.id) ? current : [...current, department],
          );
        }).catch((err: unknown) => {
          setErrorMsg(err instanceof Error ? err.message : 'This department request could not be opened.');
        });
      }
      return;
    }
    handledNotificationId.current = departmentIdFromNotification;
    window.requestAnimationFrame(() => {
      setActiveTab('DEPARTMENTS');
      setHighlightedDepartmentId(target.id);
      window.requestAnimationFrame(() => {
        document.getElementById(`department-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    window.setTimeout(() => setHighlightedDepartmentId(null), 5000);
  }, [departmentIdFromNotification, departments, isDeptsLoading, queryClient]);

  const handleRetry = () => {
    setErrorMsg(null);
    refetchDepts();
    refetchIssues();
    if (role === 'CLIENT_ADMIN') {
      void refetchManufacturingOptions();
      void refetchBalances();
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={activeTab === 'RETURNS' ? 'Department Returns & Write-offs' : 'Departments & Stock Issues'}
        description={activeTab === 'RETURNS' ? 'Record returned items and review condition-specific stock actions.' : 'Request approved manufactured products for internal departments. Super Admin approval is required.'}
        actions={
          activeTab !== 'RETURNS' ? <div className="flex flex-wrap gap-2">
            {role === 'CLIENT_ADMIN' && (
              <Button
                variant="primary"
                disabled={!activeDepartments.length}
                onClick={() => { setErrorMsg(null); setIsIssueModalOpen(true); }}
              >
                + Issue stock to department
              </Button>
            )}
            <Button variant={role === 'CLIENT_ADMIN' ? 'secondary' : 'primary'} onClick={() => setIsModalOpen(true)}>
              + Add Department
            </Button>
          </div> : undefined
        }
      />

      {actionSuccess && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-[#18794e] text-xs flex items-center justify-between">
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-[#18794e]">✕</button>
        </div>
      )}

      {currentError && (
        <ErrorState message={currentError} onRetry={handleRetry} />
      )}

      {role === 'CLIENT_ADMIN' && activeDepartments.length === 0 && (
        <p className="text-xs text-[#5b6678]">Add a department and wait for Super Admin approval before issuing manufactured stock to it.</p>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#dbe3ee] text-xs">
        <button
          role="tab"
          aria-selected={activeTab === 'DEPARTMENTS'}
          onClick={() => setActiveTab('DEPARTMENTS')}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeTab === 'DEPARTMENTS'
              ? 'border-[#2563eb] text-[#2563eb]'
              : 'border-transparent text-[#5b6678] hover:text-[#172033]'
          }`}
        >
          Departments ({departments.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'ISSUES'}
          onClick={() => setActiveTab('ISSUES')}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeTab === 'ISSUES'
              ? 'border-[#2563eb] text-[#2563eb]'
              : 'border-transparent text-[#5b6678] hover:text-[#172033]'
          }`}
        >
          Issue Requisitions ({history.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'RETURNS'}
          onClick={() => setActiveTab('RETURNS')}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeTab === 'RETURNS'
              ? 'border-[#2563eb] text-[#2563eb]'
              : 'border-transparent text-[#5b6678] hover:text-[#172033]'
          }`}
        >
          Returns & write-offs
        </button>
      </div>

      {isLoading ? (
        <LoadingState message="Loading department records from backend..." />
      ) : activeTab === 'RETURNS' ? (
        <DepartmentReturnsPanel issues={history} />
      ) : activeTab === 'DEPARTMENTS' ? (
        departments.length === 0 ? (
          <EmptyState
            title="No departments registered"
            description="Add internal departments (e.g. Hematology, Biochemistry) to enable local consumption requisitioning."
            action={
              <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                + Register First Department
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {departments.map((d) => (
              <div
                key={d.id}
                id={`department-${d.id}`}
                className={`bg-white border rounded-xl p-4 shadow-sm space-y-2 transition-colors ${highlightedDepartmentId === d.id ? 'border-[#2563eb] ring-2 ring-[#2563eb]/20' : 'border-[#dbe3ee]'}`}
              >
                <div className="flex justify-end">
                  <Badge variant={d.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {d.status}
                  </Badge>
                </div>
                <h3 className="font-semibold text-[#172033] text-sm leading-tight">
                  {d.name}
                </h3>
                {role === 'SUPER_ADMIN' && (d.proposedName || d.proposedStatus) && (
                  <div className="rounded-md bg-blue-50 p-2 text-[11px] text-blue-900">
                    <p className="font-semibold">Change awaiting review</p>
                    {d.proposedName && <p>Name: {d.name} → {d.proposedName}</p>}
                    {d.proposedStatus && <p>Status: {d.status} → {d.proposedStatus}</p>}
                  </div>
                )}
                <p className="text-[11px] text-[#5b6678]">
                  {d.clientName || 'Client Entity'}
                </p>
                {role === 'SUPER_ADMIN' && (d.status === 'PENDING_APPROVAL' || d.proposedName || d.proposedStatus) && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={approveDepartment.isPending || rejectDepartment.isPending}
                      onClick={() => approveDepartment.mutate(d.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={approveDepartment.isPending || rejectDepartment.isPending}
                      onClick={() => {
                        const reason = window.prompt(`Why should ${d.name} be rejected?`);
                        if (reason?.trim()) rejectDepartment.mutate({ id: d.id, reason: reason.trim() });
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <EmptyState
            title="No department issues recorded"
            description="Department stock requests will appear here after you send them for approval."
          />
        ) : (
          <Table>
            <TableHeader sticky>
              <tr>
                <TableHead>Issue #</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Product and quantity</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Issued At</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {history.map((tx: DepartmentIssue) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono font-medium text-[#172033]">
                    {tx.issueNumber || 'Department issue'}
                  </TableCell>
                  <TableCell className="font-semibold text-[#172033]">
                    {tx.department?.name || tx.departmentName || 'Department'}
                  </TableCell>
                  <TableCell>
                    <span className="block text-xs text-[#172033]">
                      {tx.quantity} {tx.unit?.unitName || tx.unitNameSnapshot || 'units'} · {tx.product?.name || tx.productName || 'Product'}
                    </span>
                  </TableCell>
                  <TableCell className="text-[#5b6678] text-xs">
                    {tx.notes || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tx.status === 'APPROVED' ? 'success' : 'warning'}>
                      {tx.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-[#5b6678]">
                    {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {/* New Department Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Internal Department"
      >
        <form onSubmit={handleCreateDepartment} className="space-y-3.5 text-xs">
          <Input
            label="Department Name"
            placeholder="e.g. Molecular Pathology Suite"
            value={deptName}
            onChange={(e) => setDeptName(e.target.value)}
            required
          />
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Register Department
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        title="Issue manufactured stock to a department"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setErrorMsg(null);
            if (!effectiveIssueDepartmentId || !effectiveIssueProductId || !effectiveIssueBalanceId ||
              !effectiveIssueUnitId || !Number(issueQuantity) || Number(issueQuantity) <= 0 ||
              Number(issueQuantity) > availableInSelectedUnit) {
              setErrorMsg('Choose a department, an in-stock manufactured product, and a quantity within available stock.');
              return;
            }
            createIssueMutation.mutate();
          }}
          className="space-y-3 text-xs"
        >
          <p className="text-[#5b6678]">This sends the issue request for approval. Client stock is deducted only after Super Admin approval.</p>
          <div>
            <label htmlFor="issue-department" className="mb-1 block font-medium text-[#172033]">Department</label>
            <select
              id="issue-department"
              value={effectiveIssueDepartmentId}
              onChange={(event) => setIssueDepartmentId(event.target.value)}
              required
              className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs text-[#172033]"
            >
              <option value="">Choose a department</option>
              {activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="issue-product" className="mb-1 block font-medium text-[#172033]">Manufactured product</label>
            <select
              id="issue-product"
              value={effectiveIssueProductId}
              onChange={(event) => {
                setIssueProductId(event.target.value);
                setIssueBalanceId('');
                setIssueUnitId('');
                setIssueQuantity('');
              }}
              required
              disabled={!stockedManufacturedProducts.length}
              className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs text-[#172033] disabled:bg-slate-100"
            >
              {!stockedManufacturedProducts.length && <option value="">No manufactured stock is available</option>}
              {stockedManufacturedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </div>

          {isIssueDataLoading ? (
            <p className="text-[#5b6678]">Loading finished products and available stock…</p>
          ) : !stockedManufacturedProducts.length ? (
            <p className="rounded-md bg-amber-50 p-2 text-amber-800">Manufacture and approve finished products first. Only products with available client stock can be issued.</p>
          ) : (
            <>
              {(issueBalances.length > 1 || selectedIssueProduct?.trackingMode === 'BATCH_ONLY' || selectedIssueProduct?.trackingMode === 'BOTH') && (
                <div>
                  <label htmlFor="issue-batch" className="mb-1 block font-medium text-[#172033]">Stock lot</label>
                  <select
                    id="issue-batch"
                    value={effectiveIssueBalanceId}
                    onChange={(event) => setIssueBalanceId(event.target.value)}
                    required
                    className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs text-[#172033]"
                  >
                    {issueBalances.map((balance) => (
                      <option key={balance.id} value={balance.id}>
                        {balance.batchNumber || 'Untracked stock'} · {balance.availableQty} {selectedIssueProduct?.baseUnit || balance.unit || 'units'} available
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Quantity"
                  type="number"
                  value={issueQuantity}
                  onChange={(event) => setIssueQuantity(event.target.value)}
                  min={selectedIssueProduct?.quantityPrecision === 0 ? 1 : 0.01}
                  max={availableInSelectedUnit}
                  step={selectedIssueProduct?.quantityPrecision === 0 ? 1 : 'any'}
                  required
                />
                <div>
                  <label htmlFor="issue-unit" className="mb-1 block font-medium text-[#172033]">Unit</label>
                  <select
                    id="issue-unit"
                    value={effectiveIssueUnitId}
                    onChange={(event) => setIssueUnitId(event.target.value)}
                    required
                    className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs text-[#172033]"
                  >
                    {issueUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.unitName}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-[#5b6678]">Available here: {availableInSelectedUnit} {selectedIssueUnit?.unitName || ''}</p>
            </>
          )}
          <Input
            label="Note (optional)"
            value={issueNotes}
            onChange={(event) => setIssueNotes(event.target.value)}
            placeholder="What is this stock needed for?"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsIssueModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={createIssueMutation.isPending || isIssueDataLoading || !stockedManufacturedProducts.length}>
              {createIssueMutation.isPending ? 'Sending…' : 'Send for approval'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default DepartmentsView;
