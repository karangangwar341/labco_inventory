'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { UserRole } from '../../../types/common';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { administrationService, UserAccount } from '../administration.service';

export function UsersManagement() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('STORE_ADMIN');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchUsers = useCallback(() => {
    setIsLoading(true);
    setErrorMsg(null);
    administrationService
      .getUsers()
      .then((data) => {
        setUsers(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load user accounts');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await administrationService.createUser({
        username: newUsername,
        password: newPassword,
        role: newRole,
      });
      setShowCreateModal(false);
      setNewUsername('');
      setNewPassword('');
      setActionNotice(`User account [${newUsername}] created successfully.`);
      fetchUsers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create user account');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Accounts & Role Governance"
        description="Provision operators and assign strict boundary roles. Sessions are automatically revoked on role alterations."
        actions={
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            + Provision User Account
          </Button>
        }
      />

      {actionNotice && (
        <div className="p-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg text-xs text-[#2563eb] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🛡️</span>
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-[#2563eb]">✕</button>
        </div>
      )}

      {errorMsg && (
        <ErrorState message={errorMsg} onRetry={fetchUsers} />
      )}

      {isLoading ? (
        <LoadingState message="Loading user accounts from backend..." />
      ) : users.length === 0 ? (
        <EmptyState
          title="No users found"
          description="Provision operator accounts with specific role permissions."
          action={
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              + Provision First User
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader sticky>
            <tr>
              <TableHead>Account Username</TableHead>
              <TableHead>RBAC Role</TableHead>
              <TableHead>Assigned Boundary Scope</TableHead>
              <TableHead>Account Status</TableHead>
              <TableHead className="text-right">Created At</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-semibold text-[#172033]">
                  {u.username}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      u.role === 'SUPER_ADMIN'
                        ? 'purple'
                        : u.role === 'STORE_ADMIN'
                        ? 'primary'
                        : 'neutral'
                    }
                  >
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-[#5b6678] text-xs">
                  {u.warehouse?.name || u.client?.name || (u.role === 'SUPER_ADMIN' ? 'Global Platform Scope' : 'Unassigned')}
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === 'ACTIVE' ? 'success' : 'danger'}>
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-[#5b6678]">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Provision User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Provision New Operator Account"
      >
        <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
          <Input
            label="Username"
            placeholder="e.g. storeadmin_wh2"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            required
          />

          <Input
            label="Initial Password (min 12 chars)"
            type="password"
            placeholder="••••••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={12}
          />

          <div>
            <label className="block text-xs font-semibold text-[#172033] mb-1">
              Select RBAC Boundary Role
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="w-full px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-xs text-[#172033] focus:outline-none focus:border-[#2563eb]"
            >
              <option value="STORE_ADMIN">STORE_ADMIN (Warehouse &amp; Stock Movements)</option>
              <option value="CLIENT_ADMIN">CLIENT_ADMIN (Local Facility Scope &amp; Privacy)</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN (Global Authority &amp; Approvals)</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Provision Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default UsersManagement;
