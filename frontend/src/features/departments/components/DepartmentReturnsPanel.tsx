'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { useAuth } from '../../auth/auth.store';
import { departmentsService } from '../departments.service';
import { DepartmentIssue, DepartmentReturn } from '../departments.types';
import { queryKeys } from '../../../lib/query/query-keys';
import { invalidation } from '../../../lib/query/invalidation';
import { inventoryService } from '../../inventory/inventory.service';
import { StockCondition } from '../../../types/api';

type Props = { issues: DepartmentIssue[] };

export function DepartmentReturnsPanel({ issues }: Props) {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const [showWriteOffs, setShowWriteOffs] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [condition, setCondition] = useState<StockCondition>('USABLE');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedBalanceId, setSelectedBalanceId] = useState('');
  const [writeOffCondition, setWriteOffCondition] = useState<'DAMAGED' | 'EXPIRED'>('DAMAGED');
  const [writeOffQuantity, setWriteOffQuantity] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [rejectingReturn, setRejectingReturn] = useState<DepartmentReturn | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const returnsQuery = useQuery({
    queryKey: [...queryKeys.departments.all, 'returns', user?.id || 'anonymous'],
    queryFn: () => departmentsService.getReturns(),
    staleTime: 30_000,
  });
  const balancesQuery = useQuery({
    queryKey: queryKeys.inventory.balances(user?.id || user?.role),
    queryFn: () => inventoryService.getBalances(),
    enabled: isSuperAdmin,
    staleTime: 30_000,
  });

  const returnCandidates = issues.filter((issue) => issue.status === 'APPROVED');
  const selectedIssue = returnCandidates.find((issue) => issue.id === selectedIssueId);
  const eligibleWriteOffBalances = useMemo(() => (balancesQuery.data || []).filter((balance) =>
    Boolean(balance.clientId) && (writeOffCondition === 'DAMAGED'
      ? Number(balance.damagedQty) > 0
      : Number(balance.expiredQty) > 0),
  ), [balancesQuery.data, writeOffCondition]);
  const effectiveBalanceId = selectedBalanceId || eligibleWriteOffBalances[0]?.id || '';
  const selectedBalance = eligibleWriteOffBalances.find((balance) => balance.id === effectiveBalanceId);
  const writeOffAvailable = selectedBalance
    ? Number(writeOffCondition === 'DAMAGED' ? selectedBalance.damagedQty : selectedBalance.expiredQty)
    : 0;

  const refreshDepartmentData = async () => {
    await Promise.all([
      invalidation.afterDepartmentMutation(queryClient),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
    ]);
  };

  const createReturnMutation = useMutation({
    mutationFn: () => {
      if (!selectedIssue) throw new Error('Choose an approved department issue.');
      return departmentsService.createReturn({
        departmentIssueId: selectedIssue.id,
        productId: selectedIssue.productId,
        batchId: selectedIssue.batchId || undefined,
        quantity: Number(quantity),
        unitId: selectedIssue.unit?.id,
        condition,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setSelectedIssueId(''); setQuantity(''); setReason(''); setNotes(''); setCondition('USABLE');
      setSuccessMessage('Return submitted for Super Admin approval. Stock changes after approval.');
      setErrorMessage(null);
      await refreshDepartmentData();
    },
    onError: (error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Return could not be submitted.'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => departmentsService.approveReturn(id),
    onSuccess: async () => { setSuccessMessage('Return approved and posted.'); setErrorMessage(null); await refreshDepartmentData(); },
    onError: (error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Return could not be approved.'),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason: rejectReason }: { id: string; reason: string }) => departmentsService.rejectReturn(id, rejectReason),
    onSuccess: async () => { setRejectingReturn(null); setRejectionReason(''); setSuccessMessage('Return request rejected.'); setErrorMessage(null); await refreshDepartmentData(); },
    onError: (error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Return could not be rejected.'),
  });
  const writeOffMutation = useMutation({
    mutationFn: () => {
      if (!selectedBalance?.clientId) throw new Error('Choose a client stock balance.');
      return departmentsService.writeOff({
        clientId: selectedBalance.clientId,
        productId: selectedBalance.productId,
        batchId: selectedBalance.batchId || undefined,
        condition: writeOffCondition,
        quantity: Number(writeOffQuantity),
        unitName: selectedBalance.unit,
        reason: writeOffReason.trim(),
      });
    },
    onSuccess: async () => { setWriteOffQuantity(''); setWriteOffReason(''); setSuccessMessage('Write-off posted to the inventory ledger.'); setErrorMessage(null); await refreshDepartmentData(); },
    onError: (error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Write-off could not be posted.'),
  });

  const submitReturn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setErrorMessage(null);
    const amount = Number(quantity);
    if (!selectedIssue || !Number.isFinite(amount) || amount <= 0 || !reason.trim()) {
      setErrorMessage('Select an issued item, enter a positive quantity, and provide the return reason.'); return;
    }
    createReturnMutation.mutate();
  };
  const submitWriteOff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setErrorMessage(null);
    const amount = Number(writeOffQuantity);
    if (!selectedBalance || !Number.isFinite(amount) || amount <= 0 || amount > writeOffAvailable || !writeOffReason.trim()) {
      setErrorMessage('Choose eligible damaged or expired stock and enter a quantity within its recorded balance, with a reason.'); return;
    }
    writeOffMutation.mutate();
  };

  const returnRows = returnsQuery.data || [];
  const isPending = createReturnMutation.isPending || approveMutation.isPending || rejectMutation.isPending || writeOffMutation.isPending;

  return (
    <section className="space-y-4" aria-labelledby="department-returns-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="department-returns-title" className="text-sm font-semibold text-[#172033]">Department returns and condition handling</h2>
          <p className="mt-1 text-xs text-[#5b6678]">Every return waits for Super Admin approval before it changes stock.</p>
        </div>
        {isSuperAdmin && (
          <div className="flex gap-2" role="group" aria-label="Department stock actions">
            <Button variant={!showWriteOffs ? 'primary' : 'secondary'} onClick={() => setShowWriteOffs(false)}>Returns</Button>
            <Button variant={showWriteOffs ? 'primary' : 'secondary'} onClick={() => setShowWriteOffs(true)}>Write-offs</Button>
          </div>
        )}
      </div>

      {successMessage && <div role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800">{successMessage}</div>}
      {errorMessage && <ErrorState message={errorMessage} onRetry={() => { void returnsQuery.refetch(); if (isSuperAdmin) void balancesQuery.refetch(); }} />}

      {!showWriteOffs && role === 'CLIENT_ADMIN' && (
        <form onSubmit={submitReturn} className="grid grid-cols-1 gap-3 rounded-lg border border-[#dbe3ee] bg-white p-4 md:grid-cols-2">
          <div>
            <label htmlFor="return-issue" className="mb-1 block text-xs font-medium text-[#172033]">Previously approved issue</label>
            <select id="return-issue" value={selectedIssueId} onChange={(event) => setSelectedIssueId(event.target.value)} required className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs">
              <option value="">Choose issue and product</option>
              {returnCandidates.map((issue) => <option key={issue.id} value={issue.id}>{issue.department?.name || issue.departmentName} · {issue.product?.name || issue.productName} · {issue.quantity} {issue.unit?.unitName || issue.unitNameSnapshot}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="return-condition" className="mb-1 block text-xs font-medium text-[#172033]">Returned condition</label>
            <select id="return-condition" value={condition} onChange={(event) => setCondition(event.target.value as StockCondition)} className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs">
              <option value="USABLE">Usable</option><option value="DAMAGED">Damaged</option><option value="EXPIRED">Expired</option>
            </select>
          </div>
          <Input label={`Quantity${selectedIssue ? ` (${selectedIssue.unit?.unitName || selectedIssue.unitNameSnapshot || 'units'})` : ''}`} type="number" min="0.01" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          <Input label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required placeholder="Why is this item being returned?" />
          <div className="md:col-span-2"><Input label="Additional note (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} /></div>
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            {returnCandidates.length === 0 && <p className="text-xs text-amber-800">An approved department issue is needed before you can record its return.</p>}
            <span className="ml-auto"><Button type="submit" variant="primary" disabled={isPending || !returnCandidates.length}>{createReturnMutation.isPending ? 'Submitting…' : 'Submit for approval'}</Button></span>
          </div>
        </form>
      )}

      {showWriteOffs && isSuperAdmin ? (
        <form onSubmit={submitWriteOff} className="grid grid-cols-1 gap-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4 md:grid-cols-2">
          <div>
            <label htmlFor="writeoff-condition" className="mb-1 block text-xs font-medium text-[#172033]">Condition to write off</label>
            <select id="writeoff-condition" value={writeOffCondition} onChange={(event) => { setWriteOffCondition(event.target.value as 'DAMAGED' | 'EXPIRED'); setSelectedBalanceId(''); setWriteOffQuantity(''); }} className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs">
              <option value="DAMAGED">Damaged</option><option value="EXPIRED">Expired</option>
            </select>
          </div>
          <div>
            <label htmlFor="writeoff-balance" className="mb-1 block text-xs font-medium text-[#172033]">Client, product and batch</label>
            <select id="writeoff-balance" value={effectiveBalanceId} onChange={(event) => setSelectedBalanceId(event.target.value)} required disabled={balancesQuery.isLoading || eligibleWriteOffBalances.length === 0} className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs">
              <option value="">{eligibleWriteOffBalances.length ? 'Choose stock balance' : `No ${writeOffCondition.toLowerCase()} stock recorded`}</option>
              {eligibleWriteOffBalances.map((balance) => <option key={balance.id} value={balance.id}>{balance.locationName || balance.clientId} · {balance.productName || balance.productId}{balance.batchNumber ? ` · Lot ${balance.batchNumber}` : ''} · {writeOffCondition === 'DAMAGED' ? balance.damagedQty : balance.expiredQty} {balance.unit || 'units'}</option>)}
            </select>
          </div>
          <Input label={`Quantity (${selectedBalance?.unit || 'units'}), available ${writeOffAvailable}`} type="number" min="0.01" max={writeOffAvailable} step="any" value={writeOffQuantity} onChange={(event) => setWriteOffQuantity(event.target.value)} required disabled={!selectedBalance} />
          <Input label="Write-off reason" value={writeOffReason} onChange={(event) => setWriteOffReason(event.target.value)} maxLength={500} required placeholder="Document the approved disposal reason" />
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <p className="text-xs text-[#5b6678]">This action posts an adjustment immediately under your Super Admin authority.</p>
            <Button type="submit" variant="danger" disabled={isPending || !selectedBalance}>{writeOffMutation.isPending ? 'Posting…' : 'Post write-off'}</Button>
          </div>
        </form>
      ) : null}

      {!showWriteOffs && (returnsQuery.isLoading ? <LoadingState message="Loading department returns…" /> : returnsQuery.isError ? null : returnRows.length === 0 ? (
        <EmptyState title="No department returns recorded" description="Submitted returns and their approval status will appear here." />
      ) : (
        <Table>
          <TableHeader sticky><tr><TableHead>Department</TableHead><TableHead>Product and quantity</TableHead><TableHead>Condition</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead>{isSuperAdmin && <TableHead className="text-right">Review</TableHead>}</tr></TableHeader>
          <TableBody>{returnRows.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.department?.name || 'Department'}</TableCell>
              <TableCell>{item.product?.name || 'Product'} · {item.quantity} {item.unitNameSnapshot || 'units'}</TableCell>
              <TableCell><Badge variant={item.condition === 'USABLE' ? 'success' : 'warning'}>{item.condition}</Badge></TableCell>
              <TableCell className="max-w-xs truncate">{item.reason}</TableCell>
              <TableCell><Badge variant={item.status === 'APPROVED' ? 'success' : item.status === 'REJECTED' ? 'danger' : 'warning'}>{item.status}</Badge></TableCell>
              {isSuperAdmin && <TableCell className="text-right">{item.status === 'PENDING_APPROVAL' ? <div className="flex justify-end gap-2"><Button size="sm" variant="primary" disabled={isPending} onClick={() => approveMutation.mutate(item.id)}>Approve</Button><Button size="sm" variant="danger" disabled={isPending} onClick={() => { setRejectingReturn(item); setRejectionReason(''); }}>Reject</Button></div> : item.rejectionReason || '—'}</TableCell>}
            </TableRow>
          ))}</TableBody>
        </Table>
      ))}

      <Modal isOpen={Boolean(rejectingReturn)} onClose={() => setRejectingReturn(null)} title="Reject department return" description="A reason is required and will be saved with the request.">
        <form onSubmit={(event) => { event.preventDefault(); if (rejectingReturn && rejectionReason.trim()) rejectMutation.mutate({ id: rejectingReturn.id, reason: rejectionReason.trim() }); }} className="space-y-4">
          <Input label="Rejection reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} required />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setRejectingReturn(null)}>Cancel</Button><Button type="submit" variant="danger" disabled={rejectMutation.isPending || !rejectionReason.trim()}>{rejectMutation.isPending ? 'Rejecting…' : 'Reject return'}</Button></div>
        </form>
      </Modal>
    </section>
  );
}
