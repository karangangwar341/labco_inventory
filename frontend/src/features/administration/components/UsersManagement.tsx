'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { administrationService } from '../administration.service';
import { queryKeys } from '../../../lib/query/query-keys';

export function UsersManagement() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('STORE_ADMIN');
  const [clientId, setClientId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [resetTarget, setResetTarget] = useState<{ id: string; username: string } | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: queryKeys.administration.users(),
    queryFn: administrationService.getUsers,
  });
  const clientsQuery = useQuery({
    queryKey: queryKeys.administration.clients(),
    queryFn: administrationService.getClients,
  });
  const warehousesQuery = useQuery({
    queryKey: queryKeys.administration.warehouses(),
    queryFn: administrationService.getWarehouses,
  });

  const refreshUsers = async () => queryClient.invalidateQueries({ queryKey: queryKeys.administration.users() });
  const createMutation = useMutation({
    mutationFn: administrationService.createUser,
    onSuccess: async () => {
      await refreshUsers();
      setShowCreateModal(false);
      setNewUsername('');
      setNewPassword('');
      setClientId('');
      setWarehouseId('');
      setNotice('User account created.');
      setActionError(null);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Could not create the account.'),
  });
  const disableMutation = useMutation({
    mutationFn: administrationService.disableUser,
    onSuccess: async () => {
      await refreshUsers();
      setNotice('Account disabled and active sessions revoked.');
      setActionError(null);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Could not disable the account.'),
  });
  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => administrationService.resetPassword(id, password),
    onSuccess: async () => {
      await refreshUsers();
      setResetTarget(null);
      setResetPassword('');
      setNotice('Password reset and active sessions revoked.');
      setActionError(null);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Could not reset the password.'),
  });

  const createUser = (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);
    createMutation.mutate({
      username: newUsername,
      password: newPassword,
      role: newRole,
      ...(newRole === 'STORE_ADMIN' ? { warehouseId } : {}),
      ...(newRole === 'CLIENT_ADMIN' ? { clientId } : {}),
    });
  };

  const disableUser = (userId: string, username: string) => {
    if (!window.confirm(`Disable ${username}? Their active sessions will end immediately.`)) return;
    setActionError(null);
    disableMutation.mutate(userId);
  };

  const users = usersQuery.data ?? [];
  const organizationsLoading = clientsQuery.isLoading || warehousesQuery.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="User accounts"
        description="Create accounts, assign the correct organization, reset passwords, or disable access."
        actions={<Button variant="primary" onClick={() => setShowCreateModal(true)}>Add user</Button>}
      />

      {notice && <div role="status" className="rounded-lg border border-[#bbf7d0] bg-[#ecfdf3] p-3 text-sm text-[#18794e]">{notice}</div>}
      {actionError && <div role="alert" className="rounded-lg border border-[#fecdca] bg-[#fef3f2] p-3 text-sm text-[#b42318]">{actionError}</div>}
      {usersQuery.error && <ErrorState message={usersQuery.error instanceof Error ? usersQuery.error.message : 'Could not load user accounts.'} onRetry={() => usersQuery.refetch()} />}

      {usersQuery.isLoading ? <LoadingState message="Loading user accounts..." /> : users.length === 0 ? (
        <EmptyState title="No user accounts" description="Add an account for a warehouse operator, client administrator, or Super Admin." action={<Button variant="primary" onClick={() => setShowCreateModal(true)}>Add first user</Button>} />
      ) : (
        <Table>
          <TableHeader sticky><tr><TableHead>Username</TableHead><TableHead>Role</TableHead><TableHead>Organization</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></tr></TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium text-[#172033]">{user.username}</TableCell>
                <TableCell><Badge variant={user.role === 'SUPER_ADMIN' ? 'purple' : user.role === 'STORE_ADMIN' ? 'primary' : 'neutral'}>{user.role.replaceAll('_', ' ')}</Badge></TableCell>
                <TableCell className="text-[#5b6678]">{user.warehouse?.name ?? user.client?.name ?? (user.role === 'SUPER_ADMIN' ? 'Company-wide' : 'Unassigned')}</TableCell>
                <TableCell><Badge variant={user.status === 'ACTIVE' ? 'success' : 'danger'}>{user.status.replaceAll('_', ' ')}</Badge></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { setResetTarget({ id: user.id, username: user.username }); setResetPassword(''); }}>Reset password</Button>
                    <Button variant="secondary" size="sm" disabled={user.status === 'DISABLED' || disableMutation.isPending} onClick={() => disableUser(user.id, user.username)}>{user.status === 'DISABLED' ? 'Disabled' : 'Disable'}</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add user">
        <form onSubmit={createUser} className="space-y-4">
          <Input label="Username" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} required maxLength={80} autoComplete="off" />
          <Input label="Temporary password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} autoComplete="new-password" />
          <label className="block space-y-1 text-sm font-medium text-[#172033]">Role
            <select value={newRole} onChange={(event) => setNewRole(event.target.value as UserRole)} className="min-h-11 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-sm">
              <option value="STORE_ADMIN">Store Admin</option><option value="CLIENT_ADMIN">Client Admin</option><option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </label>
          {newRole === 'STORE_ADMIN' && <label className="block space-y-1 text-sm font-medium text-[#172033]">Warehouse
            <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required disabled={organizationsLoading} className="min-h-11 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-sm">
              <option value="">Choose a warehouse</option>{(warehousesQuery.data ?? []).filter((item) => !item.status || item.status === 'ACTIVE').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>}
          {newRole === 'CLIENT_ADMIN' && <label className="block space-y-1 text-sm font-medium text-[#172033]">Client
            <select value={clientId} onChange={(event) => setClientId(event.target.value)} required disabled={organizationsLoading} className="min-h-11 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-sm">
              <option value="">Choose a client</option>{(clientsQuery.data ?? []).filter((item) => !item.status || item.status === 'ACTIVE').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>}
          {(clientsQuery.error || warehousesQuery.error) && <p role="alert" className="text-sm text-[#b42318]">Could not load clients or warehouses. Close and try again.</p>}
          <div className="flex justify-end gap-2 border-t border-[#dbe3ee] pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={createMutation.isPending || organizationsLoading}>{createMutation.isPending ? 'Saving...' : 'Create account'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(resetTarget)} onClose={() => setResetTarget(null)} title={`Reset password${resetTarget ? ` for ${resetTarget.username}` : ''}`}>
        <form onSubmit={(event) => { event.preventDefault(); if (resetTarget) resetMutation.mutate({ id: resetTarget.id, password: resetPassword }); }} className="space-y-4">
          <Input label="New password (at least 12 characters)" type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} required minLength={12} autoComplete="new-password" />
          <p className="text-sm text-[#5b6678]">This ends all active sessions for the account.</p>
          <div className="flex justify-end gap-2 border-t border-[#dbe3ee] pt-4">
            <Button variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={resetMutation.isPending}>{resetMutation.isPending ? 'Resetting...' : 'Reset password'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default UsersManagement;
