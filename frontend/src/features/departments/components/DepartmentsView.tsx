'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

export function DepartmentsView() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [history, setHistory] = useState<DepartmentIssue[]>([]);
  const [activeTab, setActiveTab] = useState<'DEPARTMENTS' | 'ISSUES'>('DEPARTMENTS');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New Department Form State
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');

  const fetchData = useCallback(() => {
    setIsLoading(true);
    setErrorMsg(null);
    Promise.all([
      departmentsService.getDepartments(),
      departmentsService.getIssues(),
    ])
      .then(([deptData, issueData]) => {
        setDepartments(Array.isArray(deptData) ? deptData : []);
        setHistory(Array.isArray(issueData) ? issueData : []);
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load departments');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await departmentsService.createDepartment({
        name: deptName,
        code: deptCode,
      });
      setIsModalOpen(false);
      setDeptName('');
      setDeptCode('');
      setActionSuccess('Department created successfully.');
      fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create department');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Internal Departments & Consumable Issues"
        description="Track internal consumption and departmental stock transfers with strict approval and debit ledger entries."
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            + Add Department
          </Button>
        }
      />

      {actionSuccess && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-[#18794e] text-xs flex items-center justify-between">
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-[#18794e]">✕</button>
        </div>
      )}

      {errorMsg && (
        <ErrorState message={errorMsg} onRetry={fetchData} />
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#dbe3ee] text-xs">
        <button
          onClick={() => setActiveTab('DEPARTMENTS')}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeTab === 'DEPARTMENTS'
              ? 'border-[#2563eb] text-[#2563eb]'
              : 'border-transparent text-[#5b6678] hover:text-[#172033]'
          }`}
        >
          Active Departments ({departments.length})
        </button>
        <button
          onClick={() => setActiveTab('ISSUES')}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeTab === 'ISSUES'
              ? 'border-[#2563eb] text-[#2563eb]'
              : 'border-transparent text-[#5b6678] hover:text-[#172033]'
          }`}
        >
          Issue Requisitions ({history.length})
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
                className="bg-white border border-[#dbe3ee] rounded-xl p-4 shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#2563eb]">
                    {d.code}
                  </span>
                  <Badge variant={d.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {d.status}
                  </Badge>
                </div>
                <h3 className="font-semibold text-[#172033] text-sm leading-tight">
                  {d.name}
                </h3>
                <p className="text-[11px] text-[#5b6678]">
                  {d.clientName || 'Client Entity'}
                </p>
              </div>
            ))}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <EmptyState
            title="No department issues recorded"
            description="Requisition transactions will display here once consumable items are issued to departments."
          />
        ) : (
          <Table>
            <TableHeader sticky>
              <tr>
                <TableHead>Issue #</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Issued At</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {history.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono font-medium text-[#172033]">
                    {tx.issueNumber}
                  </TableCell>
                  <TableCell className="font-semibold text-[#172033]">
                    {tx.departmentName || tx.departmentId}
                  </TableCell>
                  <TableCell>
                    {tx.items?.map((it: { quantity: number; unit?: string; productName?: string; productId: string }, idx: number) => (
                      <span key={idx} className="block text-xs text-[#172033]">
                        {it.quantity} {it.unit || 'units'} · {it.productName || it.productId}
                      </span>
                    )) || '—'}
                  </TableCell>
                  <TableCell className="text-[#5b6678] text-xs">
                    {tx.reason || 'Routine lab testing'}
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
          <Input
            label="Department Code"
            placeholder="e.g. MOL-05"
            value={deptCode}
            onChange={(e) => setDeptCode(e.target.value)}
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
    </div>
  );
}

export default DepartmentsView;
