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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
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
import { groupItemsByDay } from '../../../lib/utils/date-grouping';
import {
  DateQuickFilterBar,
  DateQuickFilter,
  isDateInRange,
} from '../../../components/data-display/DateQuickFilterBar';

export function DepartmentsView() {
  const { role, user } = useAuth();
  const searchParams = useSearchParams();
  const departmentIdFromNotification = searchParams.get('departmentId');
  const handledNotificationId = useRef<string | null>(null);
  const attemptedDepartmentRefresh = useRef<string | null>(null);
  const handledActionRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const tabParam = searchParams.get('tab')?.toUpperCase();
  const initialTab = (tabParam === 'ISSUES' || tabParam === 'RETURNS' || tabParam === 'DEPARTMENTS') ? tabParam : 'DEPARTMENTS';
  const [activeTab, setActiveTab] = useState<'DEPARTMENTS' | 'ISSUES' | 'RETURNS'>(initialTab);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [highlightedDepartmentId, setHighlightedDepartmentId] = useState<string | null>(null);

  useEffect(() => {
    if (tabParam && (tabParam === 'ISSUES' || tabParam === 'RETURNS' || tabParam === 'DEPARTMENTS')) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'new-issue' && handledActionRef.current !== action) {
      handledActionRef.current = action;
      setActiveTab('ISSUES');
      setIsIssueModalOpen(true);
    }
  }, [searchParams]);

  // New Department Form State
  const [deptName, setDeptName] = useState('');
  const [issueDepartmentId, setIssueDepartmentId] = useState('');
  const [issueProductId, setIssueProductId] = useState('');
  const [issueBalanceId, setIssueBalanceId] = useState('');
  const [issueUnitId, setIssueUnitId] = useState('');
  const [issueQuantity, setIssueQuantity] = useState('');
  const [issueNotes, setIssueNotes] = useState('');
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);

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

  const [historyDateFilter, setHistoryDateFilter] = useState<DateQuickFilter>('TODAY');
  const [historyCustomStart, setHistoryCustomStart] = useState<string>('');
  const [historyCustomEnd, setHistoryCustomEnd] = useState<string>('');

  const olderHistoryCount = useMemo(() => {
    return history.filter((i) => !isDateInRange(i.createdAt, 'TODAY')).length;
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter((i) => isDateInRange(i.createdAt, historyDateFilter, historyCustomStart, historyCustomEnd));
  }, [history, historyDateFilter, historyCustomStart, historyCustomEnd]);

  const historyDayGroups = useMemo(() => {
    return groupItemsByDay(
      filteredHistory,
      (tx: DepartmentIssue) => tx.createdAt,
      (tx: DepartmentIssue) => Number(tx.quantity || 0),
    );
  }, [filteredHistory]);

  const issueDraftQuery = useQuery({
    queryKey: queryKeys.departments.issueDraft(user?.projectId || user?.id),
    queryFn: () => departmentsService.getOpenIssueBatch(),
    enabled: role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN',
    staleTime: 0,
  });

  const {
    data: catalogProducts = [],
    isLoading: isCatalogProductsLoading,
    error: catalogProductsError,
    refetch: refetchCatalogProducts,
  } = useQuery({
    queryKey: queryKeys.catalog.products(`project-${user?.projectId || user?.id || 'current'}`),
    queryFn: () => catalogService.getProducts(),
    enabled: role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN',
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
    enabled: role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN',
    staleTime: 60 * 1000,
  });

  const isLoading = isDeptsLoading || isIssuesLoading;
  const currentError = errorMsg || [deptsError, issuesError, catalogProductsError, balancesError]
    .find((error): error is Error => error instanceof Error)?.message || null;
  const isIssueDataLoading = isCatalogProductsLoading || isBalancesLoading;
  const activeDepartments = departments.filter((department) => department.status === 'ACTIVE');
  const stockedProducts = useMemo(() => {
    const stockedIds = new Set(balances
      .filter((balance) => Number(balance.availableQty) > 0)
      .map((balance) => balance.productId));
    return catalogProducts.filter(
      (product) =>
        product.status === 'APPROVED' &&
        product.kind === 'MANUFACTURED_PRODUCT' &&
        stockedIds.has(product.id),
    );
  }, [catalogProducts, balances]);
  const effectiveIssueDepartmentId = issueDepartmentId || activeDepartments[0]?.id || '';
  const effectiveIssueProductId = issueProductId || stockedProducts[0]?.id || '';
  const selectedIssueProduct = stockedProducts.find((product) => product.id === effectiveIssueProductId);
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

  const saveIssueLineMutation = useMutation({
    mutationFn: async () => {
      const draft = issueDraftQuery.data ?? await departmentsService.getOpenIssueBatch();
      const currentLines = draft.issues.map((line) => ({
        departmentId: line.departmentId,
        productId: line.productId,
        quantity: Number(line.quantity),
        unitId: line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId,
        notes: line.notes || undefined,
      }));
      const nextLine = {
        departmentId: effectiveIssueDepartmentId,
        productId: effectiveIssueProductId,
        quantity: Number(issueQuantity),
        unitId: effectiveIssueUnitId,
        notes: issueNotes.trim() || undefined,
      };
      const editingIndex = editingIssueId ? draft.issues.findIndex((line) => line.id === editingIssueId) : -1;
      if (editingIndex >= 0) currentLines[editingIndex] = nextLine;
      else currentLines.push(nextLine);
      return departmentsService.saveIssueBatchLines(draft.id, currentLines);
    },
    onSuccess: async (draft) => {
      queryClient.setQueryData(queryKeys.departments.issueDraft(user?.projectId || user?.id), draft);
      setEditingIssueId(null);
      setIssueDepartmentId('');
      setIssueProductId('');
      setIssueBalanceId('');
      setIssueUnitId('');
      setIssueQuantity('');
      setIssueNotes('');
      setErrorMsg(null);
      setActionSuccess('Line saved to the daily draft.');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof Error ? err.message : 'Department stock request could not be sent.');
    },
  });

  const removeIssueLineMutation = useMutation({
    mutationFn: async (lineId: string) => {
      const draft = issueDraftQuery.data;
      if (!draft) return null;
      const lines = draft.issues.filter((line) => line.id !== lineId).map((line) => ({
        departmentId: line.departmentId,
        productId: line.productId,
        quantity: Number(line.quantity),
        unitId: (line as DepartmentIssue & { unitId?: string }).unitId || line.unit?.id,
        notes: line.notes || undefined,
      }));
      return departmentsService.saveIssueBatchLines(draft.id, lines);
    },
    onSuccess: (draft) => {
      if (draft) queryClient.setQueryData(queryKeys.departments.issueDraft(user?.projectId || user?.id), draft);
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : 'Draft line could not be removed.'),
  });

  const submitIssueBatchMutation = useMutation({
    mutationFn: async () => {
      const draft = issueDraftQuery.data;
      if (!draft) throw new Error('Open the daily draft first.');
      return departmentsService.submitIssueBatch(draft.id);
    },
    onSuccess: async (batch) => {
      queryClient.setQueryData(queryKeys.departments.issueDraft(user?.projectId || user?.id), batch);
      await invalidation.afterDepartmentMutation(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all });
      setActionSuccess(batch.status === 'POSTED' ? 'Stock out was posted.' : 'Stock out was sent for approval.');
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : 'Daily department issue could not be submitted.'),
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
    if (searchParams.get('tab') === 'ISSUES') setActiveTab('ISSUES');
  }, [searchParams]);

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
        }).catch(() => {
          // Department was not found or was already processed
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
    if (role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN') {
      void refetchCatalogProducts();
      void refetchBalances();
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={activeTab === 'RETURNS' ? 'Department Returns' : activeTab === 'ISSUES' ? 'Stock Out to Departments' : 'Departments'}
        description={activeTab === 'RETURNS' ? 'Record usable returned items and review their approval status.' : 'Add stocked products, choose a department for each line, and submit the day’s stock out together.'}
        actions={
          activeTab !== 'RETURNS' ? (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {(role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN') && (
                <div className="flex flex-1 sm:flex-none items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="secondary"
                    className="flex-1 sm:flex-none text-xs"
                    disabled={!activeDepartments.length || issueDraftQuery.data?.status !== 'DRAFT'}
                    onClick={() => { setErrorMsg(null); setIsIssueModalOpen(true); }}
                  >
                    Add product{issueDraftQuery.data?.issues.length ? ` (${issueDraftQuery.data.issues.length})` : ''}
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 sm:flex-none text-xs"
                    disabled={issueDraftQuery.data?.status !== 'DRAFT' || !issueDraftQuery.data.issues.length || submitIssueBatchMutation.isPending}
                    onClick={() => submitIssueBatchMutation.mutate()}
                  >
                    {submitIssueBatchMutation.isPending ? 'Submitting…' : 'Submit stock out'}
                  </Button>
                </div>
              )}
              <Button
                variant={role === 'PROJECT_ADMIN' ? 'secondary' : 'primary'}
                className="w-full sm:w-auto text-xs"
                onClick={() => setIsModalOpen(true)}
              >
                + Add Department
              </Button>
            </div>
          ) : undefined
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

      {role === 'PROJECT_ADMIN' && activeDepartments.length === 0 && (
        <p className="text-xs text-[#5b6678]">Add a department and wait for Super Admin approval before issuing manufactured stock to it.</p>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-xs overflow-x-auto whitespace-nowrap scrollbar-none gap-1 sm:gap-2">
        <button
          role="tab"
          aria-selected={activeTab === 'DEPARTMENTS'}
          onClick={() => setActiveTab('DEPARTMENTS')}
          className={`px-3 sm:px-4 py-2.5 font-semibold border-b-2 shrink-0 whitespace-nowrap transition-all ${
            activeTab === 'DEPARTMENTS'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Departments ({departments.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'ISSUES'}
          onClick={() => setActiveTab('ISSUES')}
          className={`px-3 sm:px-4 py-2.5 font-semibold border-b-2 shrink-0 whitespace-nowrap transition-all ${
            activeTab === 'ISSUES'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Stock Out History ({history.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'RETURNS'}
          onClick={() => setActiveTab('RETURNS')}
          className={`px-3 sm:px-4 py-2.5 font-semibold border-b-2 shrink-0 whitespace-nowrap transition-all ${
            activeTab === 'RETURNS'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Returns
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
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[#172033] text-sm leading-tight">
                    {d.name}
                  </h3>
                  <Badge variant={d.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm" className="shrink-0">
                    {d.status}
                  </Badge>
                </div>
                {role === 'SUPER_ADMIN' && (d.proposedName || d.proposedStatus) && (
                  <div className="rounded-md bg-blue-50 p-2 text-[11px] text-blue-900">
                    <p className="font-semibold">Change awaiting review</p>
                    {d.proposedName && <p>Name: {d.name} → {d.proposedName}</p>}
                    {d.proposedStatus && <p>Status: {d.status} → {d.proposedStatus}</p>}
                  </div>
                )}
                <p className="text-[11px] text-[#5b6678]">
                  {d.projectName || 'Project Entity'}
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
        <div className="space-y-6">
          {(role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN') && (
            <Card>
              <CardHeader
                action={
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full sm:w-auto justify-center min-h-[38px] text-xs font-semibold"
                      disabled={!activeDepartments.length || issueDraftQuery.data?.status !== 'DRAFT'}
                      onClick={() => {
                        setErrorMsg(null);
                        setEditingIssueId(null);
                        setIssueDepartmentId(activeDepartments[0]?.id || '');
                        setIssueProductId(stockedProducts[0]?.id || '');
                        setIssueQuantity('');
                        setIssueNotes('');
                        setIsIssueModalOpen(true);
                      }}
                    >
                      + Add Product Line
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full sm:w-auto justify-center min-h-[38px] text-xs font-semibold"
                      disabled={issueDraftQuery.data?.status !== 'DRAFT' || !issueDraftQuery.data?.issues?.length || submitIssueBatchMutation.isPending}
                      onClick={() => submitIssueBatchMutation.mutate()}
                    >
                      {submitIssueBatchMutation.isPending ? 'Submitting…' : 'Submit Today’s Stock Out'}
                    </Button>
                  </div>
                }
              >
                <div className="flex items-center gap-2">
                  <CardTitle>Today’s Daily Stock Out Draft</CardTitle>
                  <Badge variant={issueDraftQuery.data?.status === 'DRAFT' ? 'neutral' : 'success'}>
                    {issueDraftQuery.data?.status || 'DRAFT'}
                  </Badge>
                </div>
                <CardDescription>
                  Build your daily stock out list below. For each product, select which internal department receives it. When ready, submit the batch together for approval/posting.
                </CardDescription>
                {issueDraftQuery.data?.status === 'PENDING_APPROVAL' && (
                  <div className="mt-3 p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl text-amber-900 flex items-start gap-2.5 text-xs">
                    <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-amber-950">Batch Submitted for Super Admin Review</p>
                      <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                        Quantities are held in reservation and will deduct from usable stock once approved. Hospital departments can begin using reagents while ledger commits finalize.
                      </p>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {/* Responsive Fast Add Section (Zero-Modal Entry) */}
                {issueDraftQuery.data?.status === 'DRAFT' && activeDepartments.length > 0 && stockedProducts.length > 0 && (
                  <div className="p-3.5 bg-blue-50/60 border-b border-blue-100/90 text-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                        ⚡ Quick Add Reagent Line
                      </span>
                      <span className="text-[11px] text-blue-600 font-medium hidden sm:inline">
                        Fast zero-modal draft entry
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                      {/* Department Select */}
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 sm:hidden">
                          Receiving Dept
                        </label>
                        <select
                          value={effectiveIssueDepartmentId}
                          onChange={(e) => setIssueDepartmentId(e.target.value)}
                          className="w-full px-2.5 py-2 sm:py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[38px] sm:min-h-0"
                        >
                          {activeDepartments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Product Select */}
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 sm:hidden">
                          Product / Item
                        </label>
                        <select
                          value={effectiveIssueProductId}
                          onChange={(e) => {
                            setIssueProductId(e.target.value);
                            setIssueUnitId('');
                            setIssueBalanceId('');
                          }}
                          className="w-full px-2.5 py-2 sm:py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[38px] sm:min-h-0 truncate"
                        >
                          {stockedProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity & Unit Row */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 sm:hidden">
                          Quantity &amp; Unit
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0.0001"
                            placeholder="Qty"
                            value={issueQuantity}
                            onChange={(e) => setIssueQuantity(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && Number(issueQuantity) > 0) {
                                e.preventDefault();
                                saveIssueLineMutation.mutate();
                              }
                            }}
                            className="w-1/2 sm:w-20 px-2 py-2 sm:py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-right min-h-[38px] sm:min-h-0"
                          />
                          <select
                            value={effectiveIssueUnitId}
                            onChange={(e) => setIssueUnitId(e.target.value)}
                            className="w-1/2 sm:flex-1 px-2 py-2 sm:py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[38px] sm:min-h-0"
                          >
                            {issueUnits.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.unitName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Notes / Clinical Purpose */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 sm:hidden">
                          Clinical Purpose / Notes (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="Purpose / notes"
                          value={issueNotes}
                          onChange={(e) => setIssueNotes(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && Number(issueQuantity) > 0) {
                              e.preventDefault();
                              saveIssueLineMutation.mutate();
                            }
                          }}
                          className="w-full px-2.5 py-2 sm:py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[38px] sm:min-h-0"
                        />
                      </div>

                      {/* Add Button */}
                      <div className="sm:col-span-1 flex items-end">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={!Number(issueQuantity) || saveIssueLineMutation.isPending}
                          onClick={() => saveIssueLineMutation.mutate()}
                          className="w-full justify-center text-xs py-2 sm:py-1.5 min-h-[38px] sm:min-h-0 font-semibold gap-1"
                        >
                          <span>+</span>
                          <span>Add</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {issueDraftQuery.data?.issues?.length ? (
                  <>
                    {/* Mobile Card List (< md) */}
                    <div className="block md:hidden divide-y divide-slate-100">
                      {issueDraftQuery.data.issues.map((line) => (
                        <div key={line.id} className="p-3.5 space-y-2 bg-white hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-[#172033] leading-snug">
                                {line.product?.name || 'Product'}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="neutral" size="sm">
                                  {line.department?.name || 'Department'}
                                </Badge>
                                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                  {line.quantity} {line.unit?.unitName || line.unitNameSnapshot || 'units'}
                                </span>
                              </div>
                            </div>
                          </div>
                          {line.notes && (
                            <p className="text-xs text-slate-500 bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-100">
                              {line.notes}
                            </p>
                          )}
                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-50">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="flex-1 justify-center min-h-[34px] text-xs font-medium"
                              onClick={() => {
                                setEditingIssueId(line.id);
                                setIssueDepartmentId(line.departmentId);
                                setIssueProductId(line.productId);
                                setIssueUnitId(line.unit?.id || '');
                                setIssueBalanceId(balances.find((b) => b.productId === line.productId)?.id || '');
                                setIssueQuantity(String(line.quantity));
                                setIssueNotes(line.notes || '');
                                setIsIssueModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              className="flex-1 justify-center min-h-[34px] text-xs font-medium"
                              disabled={removeIssueLineMutation.isPending}
                              onClick={() => removeIssueLineMutation.mutate(line.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table (>= md) */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <tr>
                            <TableHead>Product</TableHead>
                            <TableHead>Receiving Department</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </tr>
                        </TableHeader>
                        <TableBody>
                          {issueDraftQuery.data.issues.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="font-semibold text-[#172033]">
                                {line.product?.name || 'Product'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="neutral">
                                  {line.department?.name || 'Department'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-[#172033]">
                                {line.quantity} {line.unit?.unitName || line.unitNameSnapshot || 'units'}
                              </TableCell>
                              <TableCell className="text-xs text-[#5b6678]">
                                {line.notes || '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      setEditingIssueId(line.id);
                                      setIssueDepartmentId(line.departmentId);
                                      setIssueProductId(line.productId);
                                      setIssueUnitId(line.unit?.id || '');
                                      setIssueBalanceId(balances.find((b) => b.productId === line.productId)?.id || '');
                                      setIssueQuantity(String(line.quantity));
                                      setIssueNotes(line.notes || '');
                                      setIsIssueModalOpen(true);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    disabled={removeIssueLineMutation.isPending}
                                    onClick={() => removeIssueLineMutation.mutate(line.id)}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-xs text-[#5b6678]">
                    <p className="font-medium text-[#172033]">No products in today’s stock out draft yet.</p>
                    <p className="mt-1">Add items as departments request them, assign each to its destination department, and submit when complete.</p>
                    <div className="mt-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!activeDepartments.length}
                        onClick={() => {
                          setErrorMsg(null);
                          setEditingIssueId(null);
                          setIssueDepartmentId(activeDepartments[0]?.id || '');
                          setIssueProductId(stockedProducts[0]?.id || '');
                          setIssueQuantity('');
                          setIssueNotes('');
                          setIsIssueModalOpen(true);
                        }}
                      >
                        + Add First Product Line
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#172033]">Stock Out History</h3>
                {history.length > 0 && (
                  <span className="text-xs text-slate-500 font-medium">
                    {historyDayGroups.length} {historyDayGroups.length === 1 ? 'day shown' : 'days shown'} · {filteredHistory.length} of {history.length} total entries
                  </span>
                )}
              </div>
            </div>

            {history.length > 0 && (
              <DateQuickFilterBar
                value={historyDateFilter}
                onChange={setHistoryDateFilter}
                customStart={historyCustomStart}
                customEnd={historyCustomEnd}
                onCustomStartChange={setHistoryCustomStart}
                onCustomEndChange={setHistoryCustomEnd}
                totalOlderCount={olderHistoryCount}
                onViewOlder={() => setHistoryDateFilter('ALL')}
              />
            )}

            {history.length === 0 ? (
              <EmptyState
                title="No department issues recorded"
                description="Past department stock requests will appear here after they are submitted and processed."
              />
            ) : filteredHistory.length === 0 ? (
              <EmptyState
                title="No records found for selected dates"
                description="Try switching to 'All History' or selecting a different date range."
                action={
                  <Button variant="secondary" size="sm" onClick={() => setHistoryDateFilter('ALL')}>
                    View All History ({history.length} records)
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {historyDayGroups.map((group) => (
                  <div key={group.dateKey} className="border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-2xs">
                    {/* Day Group Header */}
                    <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50/90 border-b border-slate-200/80">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                        <span className="text-xs font-bold text-slate-900 tracking-tight">{group.dayLabel}</span>
                        {group.isToday && (
                          <Badge variant="primary" size="sm">Today</Badge>
                        )}
                        {group.isYesterday && (
                          <Badge variant="neutral" size="sm">Yesterday</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <span className="font-semibold text-slate-800">{group.items.length}</span> {group.items.length === 1 ? 'line' : 'lines'}
                        <span>·</span>
                        <span className="font-semibold text-slate-800 font-mono">{group.totalUnits.toLocaleString()}</span> units
                      </div>
                    </div>

                    {/* Mobile Card List for Day Group (< md) */}
                    <div className="block md:hidden divide-y divide-slate-100">
                      {group.items.map((tx: DepartmentIssue) => (
                        <div key={tx.id} className="p-3 space-y-2 bg-white">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-800">
                              {tx.issueNumber || 'Dept Issue'}
                            </span>
                            <div className="flex items-center gap-2">
                              <Badge variant={tx.status === 'APPROVED' ? 'success' : 'warning'} size="sm">
                                {tx.status}
                              </Badge>
                              <span className="text-[11px] font-mono text-slate-400">
                                {tx.createdAt
                                  ? new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : '—'}
                              </span>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">
                              {tx.department?.name || tx.departmentName || 'Department'}
                            </p>
                            <p className="text-xs text-slate-700 mt-0.5">
                              <span className="font-semibold text-blue-700">
                                {tx.quantity} {tx.unit?.unitName || tx.unitNameSnapshot || 'units'}
                              </span>
                              {' · '}
                              <span>{tx.product?.name || tx.productName || 'Product'}</span>
                            </p>
                          </div>
                          {tx.notes && (
                            <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                              {tx.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Table of issues for this day (>= md) */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table className="min-w-[640px]">
                        <TableHeader sticky>
                          <tr>
                            <TableHead>Issue #</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Product and quantity</TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Time</TableHead>
                          </tr>
                        </TableHeader>
                        <TableBody>
                          {group.items.map((tx: DepartmentIssue) => (
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
                                {tx.createdAt
                                  ? new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
        title="Add stock out to a department"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setErrorMsg(null);
            if (!effectiveIssueDepartmentId || !effectiveIssueProductId || !effectiveIssueBalanceId ||
              !effectiveIssueUnitId || !Number(issueQuantity) || Number(issueQuantity) <= 0 ||
              Number(issueQuantity) > availableInSelectedUnit) {
              setErrorMsg('Choose a department, an in-stock product, and a quantity within available stock.');
              return;
            }
            saveIssueLineMutation.mutate();
          }}
          className="space-y-3 text-xs"
        >
          <p className="text-[#5b6678]">{editingIssueId ? 'Modify this item’s department, product, or quantity.' : 'Select a manufactured product from available stock, assign which department receives it, and specify the quantity.'}</p>
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
              disabled={!stockedProducts.length}
              className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs text-[#172033] disabled:bg-slate-100"
            >
              {!stockedProducts.length && <option value="">No manufactured project stock is available</option>}
              {stockedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </div>

          {isIssueDataLoading ? (
            <p className="text-[#5b6678]">Loading manufactured products and available stock…</p>
          ) : !stockedProducts.length ? (
            <p className="rounded-md bg-amber-50 p-2 text-amber-800">There are no approved manufactured products with available project stock to send to a department.</p>
          ) : (
            <>
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
            <Button type="button" variant="secondary" onClick={() => { setIsIssueModalOpen(false); setEditingIssueId(null); }}>Close</Button>
            <Button type="submit" variant="primary" disabled={saveIssueLineMutation.isPending || isIssueDataLoading || !stockedProducts.length}>
              {saveIssueLineMutation.isPending ? 'Saving…' : editingIssueId ? 'Update line' : 'Save line'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default DepartmentsView;
