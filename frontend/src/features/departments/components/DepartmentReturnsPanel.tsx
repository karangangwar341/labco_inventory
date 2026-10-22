'use client';

import { FormEvent, useState } from 'react';
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

type Props = { issues: DepartmentIssue[] };

export function DepartmentReturnsPanel({ issues }: Props) {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [rejectingReturn, setRejectingReturn] = useState<DepartmentReturn | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const returnsQuery = useQuery({
    queryKey: [...queryKeys.departments.all, 'returns', user?.id || 'anonymous'],
    queryFn: () => departmentsService.getReturns(),
    staleTime: 30_000,
  });
  const returnCandidates = issues.filter((issue) => issue.status === 'APPROVED');
  const selectedIssue = returnCandidates.find((issue) => issue.id === selectedIssueId);

  const refreshDepartmentData = async () => {
    await invalidation.afterDepartmentMutation(queryClient);
    await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
  };

  const createReturnMutation = useMutation({
    mutationFn: () => {
      if (!selectedIssue) throw new Error('Choose an approved department issue.');
      return departmentsService.createReturn({
        departmentIssueId: selectedIssue.id,
        productId: selectedIssue.productId,
        quantity: Number(quantity),
        unitId: selectedIssue.unit?.id,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async (ret) => {
      setSelectedIssueId(''); setQuantity(''); setReason(''); setNotes('');
      setSuccessMessage(ret.status === 'POSTED' ? 'Usable return validated and posted.' : 'Return submitted for Super Admin approval. Stock changes after approval.');
      setErrorMessage(null);
      await refreshDepartmentData();
    },
    onError: (error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Return could not be submitted.'),
  });
  const approveMutation = useMutation({
    mutationFn: (id: string) => departmentsService.approveReturn(id),
    onSuccess: async () => { setSuccessMessage('Usable return approved and posted.'); setErrorMessage(null); await refreshDepartmentData(); },
    onError: (error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Return could not be approved.'),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason: rejectReason }: { id: string; reason: string }) => departmentsService.rejectReturn(id, rejectReason),
    onSuccess: async () => { setRejectingReturn(null); setRejectionReason(''); setSuccessMessage('Return request rejected.'); setErrorMessage(null); await refreshDepartmentData(); },
    onError: (error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Return could not be rejected.'),
  });

  const submitReturn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setErrorMessage(null);
    const amount = Number(quantity);
    if (!selectedIssue || !Number.isFinite(amount) || amount <= 0 || !reason.trim()) {
      setErrorMessage('Select an issued item, enter a positive quantity, and provide the return reason.'); return;
    }
    createReturnMutation.mutate();
  };

  const returnRows = returnsQuery.data || [];
  const isPending = createReturnMutation.isPending || approveMutation.isPending || rejectMutation.isPending;

  return (
    <section className="space-y-4" aria-labelledby="department-returns-title">
      <div>
        <h2 id="department-returns-title" className="text-sm font-semibold text-[#172033]">Usable department returns</h2>
        <p className="mt-1 text-xs text-[#5b6678]">Only usable items are returned to inventory. Damaged items must be submitted as stock-out requests flagged as damaged.</p>
      </div>
      {successMessage && <div role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800">{successMessage}</div>}
      {errorMessage && <ErrorState message={errorMessage} onRetry={() => { void returnsQuery.refetch(); }} />}

      {(role === 'PROJECT_ADMIN' || isSuperAdmin) && (
        <form onSubmit={submitReturn} className="grid grid-cols-1 gap-3 rounded-lg border border-[#dbe3ee] bg-white p-4 md:grid-cols-2">
          <div>
            <label htmlFor="return-issue" className="mb-1 block text-xs font-medium text-[#172033]">Previously approved issue</label>
            <select id="return-issue" value={selectedIssueId} onChange={(event) => setSelectedIssueId(event.target.value)} required className="w-full rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-xs">
              <option value="">Choose issue and product</option>
              {returnCandidates.map((issue) => <option key={issue.id} value={issue.id}>{issue.department?.name || issue.departmentName} · {issue.product?.name || issue.productName} · {issue.quantity} {issue.unit?.unitName || issue.unitNameSnapshot}</option>)}
            </select>
          </div>
          <Input label={`Quantity${selectedIssue ? ` (${selectedIssue.unit?.unitName || selectedIssue.unitNameSnapshot || 'units'})` : ''}`} type="number" min="0.01" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          <Input label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required placeholder="Why is this usable item being returned?" />
          <div><Input label="Additional note (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} /></div>
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            {returnCandidates.length === 0 && <p className="text-xs text-amber-800">An approved department issue is needed before you can record its return.</p>}
            <span className="ml-auto"><Button type="submit" variant="primary" disabled={isPending || !returnCandidates.length}>{createReturnMutation.isPending ? 'Submitting…' : 'Submit for approval'}</Button></span>
          </div>
        </form>
      )}

      {returnsQuery.isLoading ? <LoadingState message="Loading department returns…" /> : returnsQuery.isError ? null : returnRows.length === 0 ? (
        <EmptyState title="No department returns recorded" description="Submitted usable returns and their approval status will appear here." />
      ) : (
        <Table>
          <TableHeader sticky><tr><TableHead>Department</TableHead><TableHead>Product and quantity</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead>{isSuperAdmin && <TableHead className="text-right">Review</TableHead>}</tr></TableHeader>
          <TableBody>{returnRows.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.department?.name || 'Department'}</TableCell>
              <TableCell>{item.product?.name || 'Product'} · {item.quantity} {item.unitNameSnapshot || 'units'}</TableCell>
              <TableCell className="max-w-xs truncate">{item.reason}</TableCell>
              <TableCell><Badge variant={item.status === 'APPROVED' ? 'success' : item.status === 'REJECTED' ? 'danger' : 'warning'}>{item.status}</Badge></TableCell>
              {isSuperAdmin && <TableCell className="text-right">{item.status === 'PENDING_APPROVAL' ? <div className="flex justify-end gap-2"><Button size="sm" variant="primary" disabled={isPending} onClick={() => approveMutation.mutate(item.id)}>Approve</Button><Button size="sm" variant="danger" disabled={isPending} onClick={() => { setRejectingReturn(item); setRejectionReason(''); }}>Reject</Button></div> : item.rejectionReason || '—'}</TableCell>}
            </TableRow>
          ))}</TableBody>
        </Table>
      )}

      <Modal isOpen={Boolean(rejectingReturn)} onClose={() => setRejectingReturn(null)} title="Reject department return" description="A reason is required and will be saved with the request.">
        <form onSubmit={(event) => { event.preventDefault(); if (rejectingReturn && rejectionReason.trim()) rejectMutation.mutate({ id: rejectingReturn.id, reason: rejectionReason.trim() }); }} className="space-y-4">
          <Input label="Rejection reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} required />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setRejectingReturn(null)}>Cancel</Button><Button type="submit" variant="danger" disabled={rejectMutation.isPending || !rejectionReason.trim()}>{rejectMutation.isPending ? 'Rejecting…' : 'Reject return'}</Button></div>
        </form>
      </Modal>
    </section>
  );
}
