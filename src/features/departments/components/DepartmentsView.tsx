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

export interface DraftIndentGroup {
  key: string;
  indentNumber: string;
  departmentId: string;
  departmentName: string;
  items: DepartmentIssue[];
  totalRequested: number;
  totalSupplied: number;
  isFullySupplied: boolean;
}

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
    if (tabParam && (tabParam === 'ISSUES' || tabParam === 'DEPARTMENTS')) {
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

  // Indent-Wise Form State
  const [activeIndentKey, setActiveIndentKey] = useState<string>('ALL');
  const [isNewIndentBarOpen, setIsNewIndentBarOpen] = useState(false);
  const [newIndentNumber, setNewIndentNumber] = useState('');
  const [newIndentDeptId, setNewIndentDeptId] = useState('');
  const [pendingNewIndent, setPendingNewIndent] = useState<{ indentNumber: string; departmentId: string } | null>(null);

  // Rapid Inline Row Entry State
  const [indentRowProductId, setIndentRowProductId] = useState('');
  const [indentRowUnitId, setIndentRowUnitId] = useState('');
  const [indentRowRequestedQuantity, setIndentRowRequestedQuantity] = useState('');
  const [indentRowQuantity, setIndentRowQuantity] = useState('');
  const [indentRowNotes, setIndentRowNotes] = useState('');

  // Inline Row Edit State (zero modal)
  const [inlineEditingLineId, setInlineEditingLineId] = useState<string | null>(null);
  const [inlineEditReqQty, setInlineEditReqQty] = useState('');
  const [inlineEditQuantity, setInlineEditQuantity] = useState('');
  const [inlineEditUnitId, setInlineEditUnitId] = useState('');
  const [inlineEditNotes, setInlineEditNotes] = useState('');

  // Indent Header Edit State
  const [editingHeaderKey, setEditingHeaderKey] = useState<string | null>(null);
  const [headerEditIndentNumber, setHeaderEditIndentNumber] = useState('');
  const [headerEditDeptId, setHeaderEditDeptId] = useState('');

  // Legacy Modal Issue Form State
  const [issueIndentNumber, setIssueIndentNumber] = useState('');
  const [issueDepartmentId, setIssueDepartmentId] = useState('');
  const [issueProductId, setIssueProductId] = useState('');
  const [issueBalanceId, setIssueBalanceId] = useState('');
  const [issueUnitId, setIssueUnitId] = useState('');
  const [issueRequestedQuantity, setIssueRequestedQuantity] = useState('');
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

  // Product stock helper
  const getProductStockInfo = (productId: string, unitId?: string) => {
    const prod = catalogProducts.find((p) => p.id === productId);
    const bal = balances.find((b) => b.productId === productId);
    if (!prod || !bal) return { available: 0, unitName: 'units', precision: 0 };
    const unit = prod.units?.find((u) => u.id === unitId) || prod.units?.find((u) => u.isBaseUnit) || prod.units?.[0];
    const conversion = unit ? Number(unit.conversionToBase) : 1;
    const available = conversion > 0 ? Number(bal.availableQty) / conversion : 0;
    return {
      available,
      unitName: unit?.unitName || prod.units?.[0]?.unitName || 'units',
      precision: prod.quantityPrecision ?? 0,
    };
  };

  // Group issues by Indent Form Number & Department
  const draftIndentGroups = useMemo<DraftIndentGroup[]>(() => {
    const issues = issueDraftQuery.data?.issues || [];
    const groups: { [key: string]: DraftIndentGroup } = {};

    for (const line of issues) {
      const indentNum = (line.indentNumber && line.indentNumber !== 'N/A') ? line.indentNumber : 'General Issue';
      const deptId = line.departmentId;
      const key = `${indentNum}:::${deptId}`;

      if (!groups[key]) {
        const deptName = line.department?.name || line.departmentName
          || departments.find((d) => d.id === deptId)?.name
          || 'Department';
        groups[key] = {
          key,
          indentNumber: indentNum,
          departmentId: deptId,
          departmentName: deptName,
          items: [],
          totalRequested: 0,
          totalSupplied: 0,
          isFullySupplied: true,
        };
      }

      groups[key].items.push(line);
      const req = Number(line.requestedQuantity ?? line.quantity ?? 0);
      const sup = Number(line.quantity ?? 0);
      groups[key].totalRequested += req;
      groups[key].totalSupplied += sup;
    }

    if (pendingNewIndent) {
      const key = `${pendingNewIndent.indentNumber}:::${pendingNewIndent.departmentId}`;
      if (!groups[key]) {
        const deptName = departments.find((d) => d.id === pendingNewIndent.departmentId)?.name || 'Department';
        groups[key] = {
          key,
          indentNumber: pendingNewIndent.indentNumber,
          departmentId: pendingNewIndent.departmentId,
          departmentName: deptName,
          items: [],
          totalRequested: 0,
          totalSupplied: 0,
          isFullySupplied: true,
        };
      }
    }

    return Object.values(groups).map((g) => ({
      ...g,
      isFullySupplied: g.totalSupplied >= g.totalRequested,
    }));
  }, [issueDraftQuery.data?.issues, departments, pendingNewIndent]);

  const totalDraftLines = issueDraftQuery.data?.issues?.length || 0;
  const totalDraftRequested = draftIndentGroups.reduce((acc, g) => acc + g.totalRequested, 0);
  const totalDraftSupplied = draftIndentGroups.reduce((acc, g) => acc + g.totalSupplied, 0);

  // Active Rapid Entry State Calculation
  const effectiveIndentRowProductId = indentRowProductId || stockedProducts[0]?.id || '';
  const selectedIndentRowProduct = stockedProducts.find((p) => p.id === effectiveIndentRowProductId);
  const indentRowUnits = selectedIndentRowProduct?.units?.filter((u) => u.status !== 'SUPERSEDED') || [];
  const effectiveIndentRowUnitId = indentRowUnitId || indentRowUnits.find((u) => u.isBaseUnit)?.id || indentRowUnits[0]?.id || '';
  const selectedIndentRowStock = getProductStockInfo(effectiveIndentRowProductId, effectiveIndentRowUnitId);

  // Modal helpers
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

  // Handlers for Indent Tabular Operations
  const handleAddTabularLine = async (indentNumber: string, departmentId: string) => {
    setErrorMsg(null);
    const supQtyNum = Number(indentRowQuantity);
    const reqQtyNum = Number(indentRowRequestedQuantity) || supQtyNum;

    if (!effectiveIndentRowProductId) {
      setErrorMsg('Please select a manufactured product.');
      return;
    }
    if (!supQtyNum || supQtyNum <= 0) {
      setErrorMsg('Supplied quantity must be greater than 0.');
      return;
    }
    if (supQtyNum > selectedIndentRowStock.available) {
      setErrorMsg(`Supplied quantity (${supQtyNum}) exceeds available stock (${selectedIndentRowStock.available} ${selectedIndentRowStock.unitName}).`);
      return;
    }

    const draft = issueDraftQuery.data ?? (await departmentsService.getOpenIssueBatch());
    const currentLines = (draft.issues || []).map((line) => {
      const fallbackUnitId =
        catalogProducts.find((p) => p.id === line.productId)?.units?.find((u) => u.isBaseUnit)?.id ||
        catalogProducts.find((p) => p.id === line.productId)?.units?.[0]?.id ||
        '';
      return {
        departmentId: line.departmentId,
        indentNumber: line.indentNumber || 'N/A',
        productId: line.productId,
        requestedQuantity: Number(line.requestedQuantity ?? line.quantity),
        quantity: Number(line.quantity),
        unitId: line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId || fallbackUnitId,
        notes: line.notes || undefined,
      };
    });

    currentLines.push({
      departmentId,
      indentNumber: indentNumber.trim() || 'N/A',
      productId: effectiveIndentRowProductId,
      requestedQuantity: reqQtyNum,
      quantity: supQtyNum,
      unitId: effectiveIndentRowUnitId,
      notes: indentRowNotes.trim() || undefined,
    });

    try {
      const updated = await departmentsService.saveIssueBatchLines(draft.id, currentLines);
      queryClient.setQueryData(queryKeys.departments.issueDraft(user?.projectId || user?.id), updated);
      setPendingNewIndent(null);
      setIndentRowRequestedQuantity('');
      setIndentRowQuantity('');
      setIndentRowNotes('');
      setActionSuccess(`Line added to Indent #${indentNumber}`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not add line to indent');
    }
  };

  const handleStartInlineEdit = (line: DepartmentIssue) => {
    setInlineEditingLineId(line.id);
    setInlineEditReqQty(String(line.requestedQuantity ?? line.quantity));
    setInlineEditQuantity(String(line.quantity));
    setInlineEditUnitId(line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId || '');
    setInlineEditNotes(line.notes || '');
  };

  const handleSaveInlineEdit = async (lineId: string) => {
    setErrorMsg(null);
    const draft = issueDraftQuery.data;
    if (!draft) return;

    const targetLine = draft.issues.find((l) => l.id === lineId);
    if (!targetLine) return;

    const supQty = Number(inlineEditQuantity);
    const reqQty = Number(inlineEditReqQty) || supQty;
    if (!supQty || supQty <= 0) {
      setErrorMsg('Supplied quantity must be greater than 0.');
      return;
    }

    const currentLines = draft.issues.map((line) => {
      const fallbackUnitId =
        catalogProducts.find((p) => p.id === line.productId)?.units?.find((u) => u.isBaseUnit)?.id ||
        catalogProducts.find((p) => p.id === line.productId)?.units?.[0]?.id ||
        '';
      if (line.id === lineId) {
        return {
          departmentId: line.departmentId,
          indentNumber: line.indentNumber || 'N/A',
          productId: line.productId,
          requestedQuantity: reqQty,
          quantity: supQty,
          unitId: inlineEditUnitId || line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId || fallbackUnitId,
          notes: inlineEditNotes.trim() || undefined,
        };
      }
      return {
        departmentId: line.departmentId,
        indentNumber: line.indentNumber || 'N/A',
        productId: line.productId,
        requestedQuantity: Number(line.requestedQuantity ?? line.quantity),
        quantity: Number(line.quantity),
        unitId: line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId || fallbackUnitId,
        notes: line.notes || undefined,
      };
    });

    try {
      const updated = await departmentsService.saveIssueBatchLines(draft.id, currentLines);
      queryClient.setQueryData(queryKeys.departments.issueDraft(user?.projectId || user?.id), updated);
      setInlineEditingLineId(null);
      setActionSuccess('Line updated.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update line');
    }
  };

  const handleDeleteIndentGroup = async (indentNumber: string, departmentId: string) => {
    if (!window.confirm(`Are you sure you want to remove Indent Form "${indentNumber}" and all its lines from the draft?`)) return;
    setErrorMsg(null);
    const draft = issueDraftQuery.data;
    if (!draft) return;

    const remainingLines = draft.issues
      .filter((line) => !(line.indentNumber === indentNumber && line.departmentId === departmentId))
      .map((line) => {
        const fallbackUnitId =
          catalogProducts.find((p) => p.id === line.productId)?.units?.find((u) => u.isBaseUnit)?.id ||
          catalogProducts.find((p) => p.id === line.productId)?.units?.[0]?.id ||
          '';
        return {
          departmentId: line.departmentId,
          indentNumber: line.indentNumber || 'N/A',
          productId: line.productId,
          requestedQuantity: Number(line.requestedQuantity ?? line.quantity),
          quantity: Number(line.quantity),
          unitId: line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId || fallbackUnitId,
          notes: line.notes || undefined,
        };
      });

    try {
      const updated = await departmentsService.saveIssueBatchLines(draft.id, remainingLines);
      queryClient.setQueryData(queryKeys.departments.issueDraft(user?.projectId || user?.id), updated);
      if (pendingNewIndent && pendingNewIndent.indentNumber === indentNumber && pendingNewIndent.departmentId === departmentId) {
        setPendingNewIndent(null);
      }
      setActiveIndentKey('ALL');
      setActionSuccess(`Indent Form "${indentNumber}" removed.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not remove indent form');
    }
  };

  const handleSaveIndentHeader = async (
    oldIndentNum: string,
    oldDeptId: string,
    newIndentNum: string,
    newDeptId: string,
  ) => {
    setErrorMsg(null);
    if (!newIndentNum.trim() || !newDeptId) {
      setErrorMsg('Indent number and department are required.');
      return;
    }
    const draft = issueDraftQuery.data;
    if (!draft) return;

    const currentLines = draft.issues.map((line) => {
      const fallbackUnitId =
        catalogProducts.find((p) => p.id === line.productId)?.units?.find((u) => u.isBaseUnit)?.id ||
        catalogProducts.find((p) => p.id === line.productId)?.units?.[0]?.id ||
        '';
      if (line.indentNumber === oldIndentNum && line.departmentId === oldDeptId) {
        return {
          departmentId: newDeptId,
          indentNumber: newIndentNum.trim(),
          productId: line.productId,
          requestedQuantity: Number(line.requestedQuantity ?? line.quantity),
          quantity: Number(line.quantity),
          unitId: line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId || fallbackUnitId,
          notes: line.notes || undefined,
        };
      }
      return {
        departmentId: line.departmentId,
        indentNumber: line.indentNumber || 'N/A',
        productId: line.productId,
        requestedQuantity: Number(line.requestedQuantity ?? line.quantity),
        quantity: Number(line.quantity),
        unitId: line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId || fallbackUnitId,
        notes: line.notes || undefined,
      };
    });

    try {
      const updated = await departmentsService.saveIssueBatchLines(draft.id, currentLines);
      queryClient.setQueryData(queryKeys.departments.issueDraft(user?.projectId || user?.id), updated);
      setEditingHeaderKey(null);
      setActiveIndentKey(`${newIndentNum.trim()}:::${newDeptId}`);
      setActionSuccess('Indent details updated.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update indent header');
    }
  };

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
      const draft = issueDraftQuery.data ?? (await departmentsService.getOpenIssueBatch());
      const currentLines = draft.issues.map((line) => {
        const fallbackUnitId =
          catalogProducts.find((p) => p.id === line.productId)?.units?.find((u) => u.isBaseUnit)?.id ||
          catalogProducts.find((p) => p.id === line.productId)?.units?.[0]?.id ||
          '';
        return {
          departmentId: line.departmentId,
          indentNumber: line.indentNumber || 'N/A',
          productId: line.productId,
          requestedQuantity: Number(line.requestedQuantity ?? line.quantity),
          quantity: Number(line.quantity),
          unitId: line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId || fallbackUnitId,
          notes: line.notes || undefined,
        };
      });
      const nextLine = {
        departmentId: effectiveIssueDepartmentId,
        indentNumber: issueIndentNumber.trim() || 'N/A',
        productId: effectiveIssueProductId,
        requestedQuantity: Number(issueRequestedQuantity) || Number(issueQuantity),
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
      setIsIssueModalOpen(false);
      setIssueIndentNumber('');
      setIssueDepartmentId('');
      setIssueProductId('');
      setIssueBalanceId('');
      setIssueUnitId('');
      setIssueRequestedQuantity('');
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
      const lines = draft.issues.filter((line) => line.id !== lineId).map((line) => {
        const fallbackUnitId =
          catalogProducts.find((p) => p.id === line.productId)?.units?.find((u) => u.isBaseUnit)?.id ||
          catalogProducts.find((p) => p.id === line.productId)?.units?.[0]?.id ||
          '';
        return {
          departmentId: line.departmentId,
          indentNumber: line.indentNumber || 'N/A',
          productId: line.productId,
          requestedQuantity: Number(line.requestedQuantity ?? line.quantity),
          quantity: Number(line.quantity),
          unitId: line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId || fallbackUnitId,
          notes: line.notes || undefined,
        };
      });
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

  const displayedIndentGroups = activeIndentKey === 'ALL'
    ? draftIndentGroups
    : draftIndentGroups.filter((g) => g.key === activeIndentKey);

  return (
    <div className="space-y-4">
      <PageHeader
        title={activeTab === 'RETURNS' ? 'Department Returns' : activeTab === 'ISSUES' ? 'Stock Out to Departments' : 'Departments'}
        description={
          activeTab === 'RETURNS'
            ? 'Record usable returned items and review their approval status.'
            : 'Fill physical department indent sheets in a tabular form, track requested vs supplied quantities, and submit today’s stock outs.'
        }
        actions={
          activeTab !== 'RETURNS' ? (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {(role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN') && (
                <div className="flex flex-1 sm:flex-none items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="secondary"
                    className="flex-1 sm:flex-none text-xs font-semibold"
                    disabled={!activeDepartments.length || issueDraftQuery.data?.status !== 'DRAFT'}
                    onClick={() => {
                      setErrorMsg(null);
                      setIsNewIndentBarOpen(true);
                      setNewIndentDeptId(activeDepartments[0]?.id || '');
                    }}
                  >
                    + New Indent Form
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 sm:flex-none text-xs font-semibold"
                    disabled={
                      issueDraftQuery.data?.status !== 'DRAFT' ||
                      !totalDraftLines ||
                      submitIssueBatchMutation.isPending
                    }
                    onClick={() => submitIssueBatchMutation.mutate()}
                  >
                    {submitIssueBatchMutation.isPending
                      ? 'Submitting…'
                      : `Submit Stock Out (${totalDraftLines} lines)`}
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
          Daily Stock Out Draft &amp; History ({history.length})
        </button>
      </div>

      {isLoading ? (
        <LoadingState message="Loading department records from backend..." />
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
          {/* Daily Draft Section (Indent-Wise Tabular Form) */}
          {(role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN') && (
            <Card className="border-blue-200/80 shadow-xs">
              <CardHeader
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-xs font-semibold"
                      disabled={!activeDepartments.length || issueDraftQuery.data?.status !== 'DRAFT'}
                      onClick={() => {
                        setErrorMsg(null);
                        setIsNewIndentBarOpen(true);
                        setNewIndentDeptId(activeDepartments[0]?.id || '');
                      }}
                    >
                      + New Indent Form
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="text-xs font-semibold"
                      disabled={
                        issueDraftQuery.data?.status !== 'DRAFT' ||
                        !totalDraftLines ||
                        submitIssueBatchMutation.isPending
                      }
                      onClick={() => submitIssueBatchMutation.mutate()}
                    >
                      {submitIssueBatchMutation.isPending ? 'Submitting…' : `Submit Stock Out (${totalDraftLines} lines)`}
                    </Button>
                  </div>
                }
              >
                <div className="flex items-center gap-2">
                  <CardTitle>Today’s Department Issue Draft (Indent-Wise)</CardTitle>
                  <Badge variant={issueDraftQuery.data?.status === 'DRAFT' ? 'neutral' : 'success'}>
                    {issueDraftQuery.data?.status || 'DRAFT'}
                  </Badge>
                </div>
                <CardDescription>
                  Enter physical requisition slips (indents) department-by-department in tabular format. Fast inline entry without recurring popup modals.
                </CardDescription>

                {/* Status Notice if Pending Approval */}
                {issueDraftQuery.data?.status === 'PENDING_APPROVAL' && (
                  <div className="mt-3 p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl text-amber-900 flex items-start gap-2.5 text-xs">
                    <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-amber-950">Daily Batch Submitted for Super Admin Review</p>
                      <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                        Quantities are held in reservation and will deduct from usable stock once approved.
                      </p>
                    </div>
                  </div>
                )}
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Draft Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Indent Forms
                    </span>
                    <p className="text-lg font-bold font-mono text-slate-900">
                      {draftIndentGroups.length}
                    </p>
                    <span className="text-[11px] text-slate-500">active department slips</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Total Lines
                    </span>
                    <p className="text-lg font-bold font-mono text-slate-900">
                      {totalDraftLines}
                    </p>
                    <span className="text-[11px] text-slate-500">items in today's draft</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Requested Quantity
                    </span>
                    <p className="text-lg font-bold font-mono text-slate-800">
                      {totalDraftRequested.toLocaleString()}
                    </p>
                    <span className="text-[11px] text-slate-500">from indent slips</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Supplied Quantity
                    </span>
                    <p className="text-lg font-bold font-mono text-emerald-700">
                      {totalDraftSupplied.toLocaleString()}
                    </p>
                    <span className="text-[11px] text-slate-500">to issue from stock</span>
                  </div>
                </div>

                {/* Inline "New Indent Form" Creator Bar */}
                {isNewIndentBarOpen && (
                  <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-950 flex items-center gap-1.5">
                        📋 Start New Department Indent Sheet
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsNewIndentBarOpen(false)}
                        className="text-slate-400 hover:text-slate-600 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 items-end">
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Physical Indent Form Number
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 210, IND-2026-001"
                          value={newIndentNumber}
                          onChange={(e) => setNewIndentNumber(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Receiving Department
                        </label>
                        <select
                          value={newIndentDeptId || activeDepartments[0]?.id || ''}
                          onChange={(e) => setNewIndentDeptId(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {activeDepartments.map((dept) => (
                            <option key={dept.id} value={dept.id}>
                              {dept.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2 flex gap-1.5">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          className="w-full justify-center text-xs py-1.5 font-semibold"
                          onClick={() => {
                            const indentNum = newIndentNumber.trim() || 'Indent-1';
                            const deptId = newIndentDeptId || activeDepartments[0]?.id || '';
                            if (!deptId) {
                              setErrorMsg('Please select a department.');
                              return;
                            }
                            setPendingNewIndent({ indentNumber: indentNum, departmentId: deptId });
                            setActiveIndentKey(`${indentNum}:::${deptId}`);
                            setIsNewIndentBarOpen(false);
                            setNewIndentNumber('');
                          }}
                        >
                          Open Sheet
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Indent Navigation Tabs */}
                {draftIndentGroups.length > 0 && (
                  <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto whitespace-nowrap scrollbar-none text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveIndentKey('ALL')}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                        activeIndentKey === 'ALL'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      📋 All Indents ({draftIndentGroups.length})
                    </button>
                    {draftIndentGroups.map((g) => (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => setActiveIndentKey(g.key)}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                          activeIndentKey === g.key
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                        }`}
                      >
                        <span>Indent #{g.indentNumber}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${activeIndentKey === g.key ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'}`}>
                          {g.items.length}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewIndentBarOpen(true);
                        setNewIndentDeptId(activeDepartments[0]?.id || '');
                      }}
                      className="px-2.5 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-all"
                    >
                      + New Indent
                    </button>
                  </div>
                )}

                {/* Indent Sheets List */}
                {draftIndentGroups.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 space-y-2 bg-slate-50/50 rounded-xl border border-slate-200/80">
                    <p className="font-semibold text-slate-800 text-sm">No department indents started for today.</p>
                    <p className="text-slate-500 max-w-md mx-auto">
                      Each department has its own physical indent form. Start an indent sheet for a department below to begin entering items row-by-row without popup modals.
                    </p>
                    <div className="pt-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!activeDepartments.length}
                        onClick={() => {
                          setIsNewIndentBarOpen(true);
                          setNewIndentDeptId(activeDepartments[0]?.id || '');
                        }}
                      >
                        + Start First Indent Sheet
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {displayedIndentGroups.map((group) => {
                      const isEditingHeader = editingHeaderKey === group.key;

                      return (
                        <div
                          key={group.key}
                          className="border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-2xs"
                        >
                          {/* Indent Header Card */}
                          <div className="p-3 bg-slate-50/90 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                            {isEditingHeader ? (
                              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                <span className="font-bold text-slate-600">Indent #:</span>
                                <input
                                  type="text"
                                  value={headerEditIndentNumber}
                                  onChange={(e) => setHeaderEditIndentNumber(e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded font-mono font-medium text-xs w-32"
                                />
                                <span className="font-bold text-slate-600 ml-2">Dept:</span>
                                <select
                                  value={headerEditDeptId}
                                  onChange={(e) => setHeaderEditDeptId(e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                                >
                                  {activeDepartments.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                  ))}
                                </select>
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  className="text-xs px-2 py-1 h-auto"
                                  onClick={() => handleSaveIndentHeader(group.indentNumber, group.departmentId, headerEditIndentNumber, headerEditDeptId)}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="text-xs px-2 py-1 h-auto"
                                  onClick={() => setEditingHeaderKey(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                  📋 Indent #{group.indentNumber}
                                </span>
                                <span className="font-bold text-slate-900">
                                  {group.departmentName}
                                </span>
                                <Badge variant="neutral" size="sm">
                                  {group.items.length} {group.items.length === 1 ? 'line' : 'lines'}
                                </Badge>
                                <button
                                  type="button"
                                  title="Edit Indent Form Number or Receiving Department"
                                  onClick={() => {
                                    setEditingHeaderKey(group.key);
                                    setHeaderEditIndentNumber(group.indentNumber);
                                    setHeaderEditDeptId(group.departmentId);
                                  }}
                                  className="text-[11px] text-blue-600 hover:text-blue-800 underline ml-1"
                                >
                                  ✎ Edit details
                                </button>
                              </div>
                            )}

                            <div className="flex items-center gap-2.5">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-500">
                                  Req: <strong className="font-mono text-slate-800">{group.totalRequested}</strong>
                                </span>
                                <span className="text-slate-300">|</span>
                                <span className="text-slate-500">
                                  Supplied: <strong className="font-mono text-emerald-700">{group.totalSupplied}</strong>
                                </span>
                                {group.isFullySupplied ? (
                                  <Badge variant="success" size="sm">Fully Supplied</Badge>
                                ) : (
                                  <Badge variant="warning" size="sm">Partial Fulfillment</Badge>
                                )}
                              </div>

                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                className="text-[11px] px-2 py-1 h-auto"
                                onClick={() => handleDeleteIndentGroup(group.indentNumber, group.departmentId)}
                              >
                                Delete Indent
                              </Button>
                            </div>
                          </div>

                          {/* Indent Tabular Grid */}
                          <div className="overflow-x-auto">
                            <Table className="min-w-[700px] border-0 shadow-none text-xs">
                              <TableHeader>
                                <tr>
                                  <TableHead className="w-10 text-center">#</TableHead>
                                  <TableHead>Manufactured Product</TableHead>
                                  <TableHead>Available Stock</TableHead>
                                  <TableHead align="right">Requested</TableHead>
                                  <TableHead align="right">Supplied</TableHead>
                                  <TableHead>Unit</TableHead>
                                  <TableHead>Fulfillment</TableHead>
                                  <TableHead>Notes</TableHead>
                                  <TableHead align="right">Actions</TableHead>
                                </tr>
                              </TableHeader>
                              <TableBody>
                                {group.items.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={9} className="py-4 text-center text-slate-400 italic">
                                      No items added to Indent #{group.indentNumber} yet. Use the entry row below to add items from the department slip.
                                    </TableCell>
                                  </TableRow>
                                )}

                                {group.items.map((line, index) => {
                                  const isEditingLine = inlineEditingLineId === line.id;
                                  const reqQty = Number(line.requestedQuantity ?? line.quantity);
                                  const supQty = Number(line.quantity);
                                  const isFull = supQty >= reqQty;
                                  const lineProduct = catalogProducts.find((p) => p.id === line.productId);
                                  const availableStock = getProductStockInfo(line.productId, line.unit?.id || (line as DepartmentIssue & { unitId?: string }).unitId);

                                  if (isEditingLine) {
                                    return (
                                      <TableRow key={line.id} className="bg-amber-50/40">
                                        <TableCell className="font-mono text-center text-slate-400">
                                          {index + 1}
                                        </TableCell>
                                        <TableCell className="font-semibold text-slate-900">
                                          {line.product?.name || lineProduct?.name || 'Product'}
                                        </TableCell>
                                        <TableCell className="font-mono text-slate-500">
                                          {availableStock.available} {availableStock.unitName}
                                        </TableCell>
                                        <TableCell align="right">
                                          <input
                                            type="number"
                                            min="0.0001"
                                            step="any"
                                            value={inlineEditReqQty}
                                            onChange={(e) => setInlineEditReqQty(e.target.value)}
                                            className="w-16 px-1.5 py-1 bg-white border border-slate-300 rounded text-right font-mono text-xs"
                                          />
                                        </TableCell>
                                        <TableCell align="right">
                                          <input
                                            type="number"
                                            min="0.0001"
                                            step="any"
                                            value={inlineEditQuantity}
                                            onChange={(e) => setInlineEditQuantity(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleSaveInlineEdit(line.id);
                                            }}
                                            className="w-16 px-1.5 py-1 bg-white border border-slate-300 rounded text-right font-mono font-bold text-blue-700 text-xs"
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <select
                                            value={inlineEditUnitId}
                                            onChange={(e) => setInlineEditUnitId(e.target.value)}
                                            className="px-1.5 py-1 bg-white border border-slate-300 rounded text-xs"
                                          >
                                            {lineProduct?.units?.filter((u) => u.status !== 'SUPERSEDED').map((u) => (
                                              <option key={u.id} value={u.id}>{u.unitName}</option>
                                            ))}
                                          </select>
                                        </TableCell>
                                        <TableCell>
                                          <span className="text-[11px] text-slate-400 italic">Editing</span>
                                        </TableCell>
                                        <TableCell>
                                          <input
                                            type="text"
                                            value={inlineEditNotes}
                                            onChange={(e) => setInlineEditNotes(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleSaveInlineEdit(line.id);
                                            }}
                                            className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs"
                                            placeholder="Notes"
                                          />
                                        </TableCell>
                                        <TableCell align="right">
                                          <div className="flex justify-end gap-1">
                                            <Button
                                              type="button"
                                              variant="primary"
                                              size="sm"
                                              className="text-xs px-2 py-1 h-auto"
                                              onClick={() => handleSaveInlineEdit(line.id)}
                                            >
                                              Save
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="secondary"
                                              size="sm"
                                              className="text-xs px-2 py-1 h-auto"
                                              onClick={() => setInlineEditingLineId(null)}
                                            >
                                              Cancel
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  }

                                  return (
                                    <TableRow key={line.id} className="hover:bg-slate-50/60">
                                      <TableCell className="font-mono text-center text-slate-400 text-[11px]">
                                        {index + 1}
                                      </TableCell>
                                      <TableCell className="font-semibold text-slate-900">
                                        {line.product?.name || lineProduct?.name || 'Product'}
                                      </TableCell>
                                      <TableCell className="font-mono text-slate-500">
                                        {availableStock.available} {availableStock.unitName}
                                      </TableCell>
                                      <TableCell align="right" mono className="text-slate-600 font-medium">
                                        {reqQty}
                                      </TableCell>
                                      <TableCell align="right" mono className="font-bold text-blue-700">
                                        {supQty}
                                      </TableCell>
                                      <TableCell className="text-slate-600">
                                        {line.unit?.unitName || line.unitNameSnapshot || 'units'}
                                      </TableCell>
                                      <TableCell>
                                        {isFull ? (
                                          <Badge variant="success" size="sm">Full ({supQty}/{reqQty})</Badge>
                                        ) : (
                                          <Badge variant="warning" size="sm">Partial ({supQty}/{reqQty})</Badge>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-slate-500 text-[11px] truncate max-w-[140px]">
                                        {line.notes || '—'}
                                      </TableCell>
                                      <TableCell align="right">
                                        <div className="flex justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleStartInlineEdit(line)}
                                            className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                                          >
                                            Edit
                                          </button>
                                          <span className="text-slate-300">·</span>
                                          <button
                                            type="button"
                                            onClick={() => removeIssueLineMutation.mutate(line.id)}
                                            className="text-rose-600 hover:text-rose-800 font-medium text-xs"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}

                                {/* Rapid Inline Entry Row (Directly at the bottom of the table!) */}
                                {issueDraftQuery.data?.status === 'DRAFT' && stockedProducts.length > 0 && (
                                  <TableRow className="bg-blue-50/60 border-t-2 border-blue-200">
                                    <TableCell className="font-mono text-center font-bold text-blue-700 text-xs">
                                      +
                                    </TableCell>
                                    <TableCell>
                                      <select
                                        value={effectiveIndentRowProductId}
                                        onChange={(e) => {
                                          setIndentRowProductId(e.target.value);
                                          setIndentRowUnitId('');
                                        }}
                                        className="w-full px-2 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      >
                                        {stockedProducts.map((p) => {
                                          const stock = getProductStockInfo(p.id);
                                          return (
                                            <option key={p.id} value={p.id}>
                                              {p.name} ({stock.available} {stock.unitName} avail)
                                            </option>
                                          );
                                        })}
                                      </select>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs font-semibold text-blue-900">
                                      {selectedIndentRowStock.available} {selectedIndentRowStock.unitName}
                                    </TableCell>
                                    <TableCell align="right">
                                      <input
                                        type="number"
                                        min="0.0001"
                                        step="any"
                                        placeholder="Req"
                                        title="Quantity written on indent form"
                                        value={indentRowRequestedQuantity}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setIndentRowRequestedQuantity(val);
                                          if (!indentRowQuantity || indentRowQuantity === indentRowRequestedQuantity) {
                                            setIndentRowQuantity(val);
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && Number(indentRowQuantity) > 0) {
                                            e.preventDefault();
                                            handleAddTabularLine(group.indentNumber, group.departmentId);
                                          }
                                        }}
                                        className="w-16 px-1.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-mono font-medium text-slate-800 text-right shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </TableCell>
                                    <TableCell align="right">
                                      <input
                                        type="number"
                                        min="0.0001"
                                        step="any"
                                        placeholder="Supply"
                                        title="Supplied quantity to issue from stock"
                                        value={indentRowQuantity}
                                        onChange={(e) => setIndentRowQuantity(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && Number(indentRowQuantity) > 0) {
                                            e.preventDefault();
                                            handleAddTabularLine(group.indentNumber, group.departmentId);
                                          }
                                        }}
                                        className="w-16 px-1.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-slate-900 text-right shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <select
                                        value={effectiveIndentRowUnitId}
                                        onChange={(e) => setIndentRowUnitId(e.target.value)}
                                        className="px-1.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      >
                                        {indentRowUnits.map((u) => (
                                          <option key={u.id} value={u.id}>
                                            {u.unitName}
                                          </option>
                                        ))}
                                      </select>
                                    </TableCell>
                                    <TableCell>
                                      {Number(indentRowQuantity) > 0 && (
                                        Number(indentRowQuantity) >= (Number(indentRowRequestedQuantity) || Number(indentRowQuantity)) ? (
                                          <Badge variant="success" size="sm">Full</Badge>
                                        ) : (
                                          <Badge variant="warning" size="sm">Partial</Badge>
                                        )
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <input
                                        type="text"
                                        placeholder="Note (optional)"
                                        value={indentRowNotes}
                                        onChange={(e) => setIndentRowNotes(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && Number(indentRowQuantity) > 0) {
                                            e.preventDefault();
                                            handleAddTabularLine(group.indentNumber, group.departmentId);
                                          }
                                        }}
                                        className="w-full px-2 py-1.5 bg-white border border-blue-200 rounded-lg text-xs text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </TableCell>
                                    <TableCell align="right">
                                      <Button
                                        type="button"
                                        variant="primary"
                                        size="sm"
                                        disabled={!Number(indentRowQuantity) || Number(indentRowQuantity) <= 0}
                                        onClick={() => handleAddTabularLine(group.indentNumber, group.departmentId)}
                                        className="text-xs px-2.5 py-1.5 h-auto font-semibold gap-1"
                                      >
                                        <span>+</span>
                                        <span>Add</span>
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Stock Out History Section */}
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
                            <TableHead>Indent Form #</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Product &amp; Quantities</TableHead>
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
                              <TableCell className="font-mono text-xs font-semibold text-blue-700">
                                {tx.indentNumber || 'N/A'}
                              </TableCell>
                              <TableCell className="font-semibold text-[#172033]">
                                {tx.department?.name || tx.departmentName || 'Department'}
                              </TableCell>
                              <TableCell>
                                <span className="block text-xs font-semibold text-[#172033]">
                                  {tx.product?.name || tx.productName || 'Product'}
                                </span>
                                <span className="block text-[11px] text-[#5b6678]">
                                  Req: <strong className="font-mono text-slate-700">{Number(tx.requestedQuantity ?? tx.quantity)}</strong> · Supplied: <strong className="font-mono text-emerald-700">{tx.quantity} {tx.unit?.unitName || tx.unitNameSnapshot || 'units'}</strong>
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

      {/* Legacy / Direct Modal Fallback */}
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
          <p className="text-[#5b6678]">{editingIssueId ? 'Modify this item’s indent form, department, product, or quantities.' : 'Enter details from the department’s physical indent form, including requested and supplied quantities.'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="issue-indent" className="mb-1 block font-medium text-[#172033]">Physical Indent Form Number</label>
              <input
                id="issue-indent"
                type="text"
                placeholder="e.g. IND-2026-001"
                value={issueIndentNumber}
                onChange={(e) => setIssueIndentNumber(e.target.value)}
                required
                className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs text-[#172033]"
              />
            </div>
            <div>
              <label htmlFor="issue-department" className="mb-1 block font-medium text-[#172033]">Receiving Department</label>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Requested Quantity"
                  type="number"
                  placeholder="Requested on paper"
                  value={issueRequestedQuantity}
                  onChange={(event) => setIssueRequestedQuantity(event.target.value)}
                  min={selectedIssueProduct?.quantityPrecision === 0 ? 1 : 0.01}
                  step={selectedIssueProduct?.quantityPrecision === 0 ? 1 : 'any'}
                  required
                />
                <Input
                  label="Supplied Quantity"
                  type="number"
                  placeholder="To issue from stock"
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
