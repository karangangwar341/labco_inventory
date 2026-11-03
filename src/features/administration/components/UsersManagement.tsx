'use client';

import React, { useMemo, useState } from 'react';
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
import { administrationService, UserAccount } from '../administration.service';
import { queryKeys } from '../../../lib/query/query-keys';

export function UsersManagement() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('STORE_ADMIN');
  const [newFullName, setNewFullName] = useState('');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newIdImageUrl, setNewIdImageUrl] = useState('');
  const [projectId, setProjectId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editIdImageUrl, setEditIdImageUrl] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('STORE_ADMIN');
  const [editProjectId, setEditProjectId] = useState('');
  const [editWarehouseId, setEditWarehouseId] = useState('');

  // Reset Password Modal State
  const [resetTarget, setResetTarget] = useState<{ id: string; username: string } | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: queryKeys.administration.users(),
    queryFn: administrationService.getUsers,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.administration.projects(),
    queryFn: administrationService.getProjects,
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
      resetCreateForm();
      setNotice('User account created successfully.');
      setActionError(null);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Could not create the account.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof administrationService.updateUser>[1] }) =>
      administrationService.updateUser(id, payload),
    onSuccess: async () => {
      await refreshUsers();
      setEditingUser(null);
      setNotice('User profile details updated successfully.');
      setActionError(null);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Could not update user details.'),
  });

  const enableMutation = useMutation({
    mutationFn: administrationService.enableUser,
    onSuccess: async () => {
      await refreshUsers();
      setNotice('Account has been enabled successfully.');
      setActionError(null);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Could not enable the account.'),
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
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      administrationService.resetPassword(id, password),
    onSuccess: async () => {
      await refreshUsers();
      setResetTarget(null);
      setResetPassword('');
      setNotice('Password reset and active sessions revoked.');
      setActionError(null);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Could not reset the password.'),
  });

  const resetCreateForm = () => {
    setNewUsername('');
    setNewPassword('');
    setNewFullName('');
    setNewPhoneNumber('');
    setNewAddress('');
    setNewIdImageUrl('');
    setNewRole('STORE_ADMIN');
    setProjectId('');
    setWarehouseId('');
  };

  const handleImageFileChange = (file: File | undefined, setter: (val: string) => void) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setActionError('Image size should be under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setter(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const createUser = (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);
    createMutation.mutate({
      username: newUsername,
      password: newPassword,
      role: newRole,
      fullName: newFullName.trim() || undefined,
      phoneNumber: newPhoneNumber.trim() || undefined,
      address: newAddress.trim() || undefined,
      idImageUrl: newIdImageUrl || undefined,
      ...(newRole === 'STORE_ADMIN' ? { warehouseId: warehouseId || undefined } : {}),
      ...(newRole === 'PROJECT_ADMIN' ? { projectId } : {}),
    });
  };

  const openEditModal = (user: UserAccount) => {
    setEditingUser(user);
    setEditFullName(user.fullName || '');
    setEditPhoneNumber(user.phoneNumber || '');
    setEditAddress(user.address || '');
    setEditIdImageUrl(user.idImageUrl || '');
    setEditRole(user.role);
    setEditProjectId(user.projectId || '');
    setEditWarehouseId(user.warehouseId || '');
    setActionError(null);
  };

  const saveUserEdits = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;
    setActionError(null);
    updateMutation.mutate({
      id: editingUser.id,
      payload: {
        fullName: editFullName.trim() || undefined,
        phoneNumber: editPhoneNumber.trim() || undefined,
        address: editAddress.trim() || undefined,
        idImageUrl: editIdImageUrl || undefined,
        role: editRole,
        warehouseId: editRole === 'STORE_ADMIN' ? editWarehouseId || null : null,
        projectId: editRole === 'PROJECT_ADMIN' ? editProjectId || null : null,
      },
    });
  };

  const toggleUserStatus = (user: UserAccount) => {
    setActionError(null);
    if (user.status === 'DISABLED') {
      enableMutation.mutate(user.id);
    } else {
      if (!window.confirm(`Disable ${user.username}? Their active sessions will end immediately.`)) return;
      disableMutation.mutate(user.id);
    }
  };

  const rawUsers = usersQuery.data ?? [];
  const users = useMemo(() => {
    if (!searchTerm.trim()) return rawUsers;
    const q = searchTerm.toLowerCase();
    return rawUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.phoneNumber || '').toLowerCase().includes(q) ||
        (u.address || '').toLowerCase().includes(q) ||
        (u.warehouse?.name || '').toLowerCase().includes(q) ||
        (u.project?.name || '').toLowerCase().includes(q),
    );
  }, [rawUsers, searchTerm]);

  const organizationsLoading = projectsQuery.isLoading || warehousesQuery.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Accounts"
        actions={
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add User</span>
            </span>
          </Button>
        }
      />

      {notice && (
        <div role="status" className="rounded-lg border border-[#bbf7d0] bg-[#ecfdf3] p-3 text-sm text-[#18794e]">
          {notice}
        </div>
      )}
      {actionError && (
        <div role="alert" className="rounded-lg border border-[#fecdca] bg-[#fef3f2] p-3 text-sm text-[#b42318]">
          {actionError}
        </div>
      )}
      {usersQuery.error && (
        <ErrorState
          message={usersQuery.error instanceof Error ? usersQuery.error.message : 'Could not load user accounts.'}
          onRetry={() => usersQuery.refetch()}
        />
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="Search by name, username, phone, or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:max-w-md min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        />
      </div>

      {usersQuery.isLoading ? (
        <LoadingState message="Loading user accounts..." />
      ) : users.length === 0 ? (
        <EmptyState
          title={rawUsers.length === 0 ? 'No user accounts' : 'No users match your search'}
          description={
            rawUsers.length === 0
              ? 'Add an account for a warehouse operator, project administrator, or Super Admin.'
              : 'Try searching with a different name, username, or phone number.'
          }
          action={
            rawUsers.length === 0 ? (
              <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                Add first user
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Mobile View: High-density User Account Cards */}
          <div className="space-y-3 md:hidden">
            {users.map((user) => (
              <div
                key={user.id}
                className="bg-white rounded-xl border border-slate-200/90 p-4 space-y-3 shadow-2xs transition-shadow hover:shadow-xs"
              >
                {/* Header: Avatar + Name + Role & Status Badges */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {user.idImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.idImageUrl}
                        alt={user.username}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0 bg-slate-50"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 uppercase">
                        {(user.fullName || user.username).slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-xs truncate">
                        {user.fullName || user.username}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate">
                        @{user.username}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge
                      variant={user.role === 'SUPER_ADMIN' ? 'purple' : user.role === 'STORE_ADMIN' ? 'primary' : 'neutral'}
                      size="sm"
                      className="whitespace-nowrap text-[10px]"
                    >
                      {user.role.replaceAll('_', ' ')}
                    </Badge>
                    <Badge
                      variant={user.status === 'ACTIVE' ? 'success' : user.status === 'DISABLED' ? 'danger' : 'warning'}
                      size="sm"
                      className="whitespace-nowrap text-[10px]"
                    >
                      {user.status.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                </div>

                {/* Details: Contact & Assigned Facility */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      Assigned Facility / Scope
                    </span>
                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                      <span>
                        {user.role === 'SUPER_ADMIN' ? '🏢' : user.role === 'STORE_ADMIN' ? '🏭' : '📁'}
                      </span>
                      <span className="truncate">
                        {user.role === 'STORE_ADMIN'
                          ? user.managedWarehouses && user.managedWarehouses.length > 0
                            ? user.managedWarehouses.map((w) => w.name).join(', ')
                            : user.warehouse?.name ?? 'Unassigned'
                          : user.project?.name ?? (user.role === 'SUPER_ADMIN' ? 'Company-wide (All Depots)' : 'Unassigned')}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      Contact & Address
                    </span>
                    {user.phoneNumber || user.address ? (
                      <div className="space-y-0.5">
                        {user.phoneNumber && (
                          <a
                            href={`tel:${user.phoneNumber}`}
                            className="font-medium text-blue-700 hover:underline flex items-center gap-1"
                          >
                            <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span>{user.phoneNumber}</span>
                          </a>
                        )}
                        {user.address && (
                          <div className="text-[11px] text-slate-500 truncate" title={user.address}>
                            📍 {user.address}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">No contact details</span>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-center text-xs py-1.5"
                    onClick={() => openEditModal(user)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-center text-xs py-1.5"
                    onClick={() => {
                      setResetTarget({ id: user.id, username: user.username });
                      setResetPassword('');
                    }}
                  >
                    Reset PW
                  </Button>
                  {user.status === 'DISABLED' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={enableMutation.isPending}
                      onClick={() => toggleUserStatus(user)}
                      className="w-full justify-center text-xs py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Enable
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disableMutation.isPending}
                      onClick={() => toggleUserStatus(user)}
                      className="w-full justify-center text-xs py-1.5 text-rose-600 hover:bg-rose-50 border-rose-200"
                    >
                      Disable
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader sticky>
                <tr>
                  <TableHead>User / Identity</TableHead>
                  <TableHead className="whitespace-nowrap">Role</TableHead>
                  <TableHead>Contact &amp; Address</TableHead>
                  <TableHead>Assigned Facility</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {user.idImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.idImageUrl}
                            alt={user.username}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0 bg-slate-50"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 uppercase">
                            {(user.fullName || user.username).slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">
                            {user.fullName || user.username}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            @{user.username}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={user.role === 'SUPER_ADMIN' ? 'purple' : user.role === 'STORE_ADMIN' ? 'primary' : 'neutral'}>
                        {user.role.replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {user.phoneNumber || user.address ? (
                        <div className="space-y-0.5">
                          {user.phoneNumber && (
                            <div className="font-medium text-slate-800 flex items-center gap-1">
                              <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span>{user.phoneNumber}</span>
                            </div>
                          )}
                          {user.address && (
                            <div className="text-[11px] text-slate-500 truncate max-w-xs" title={user.address}>
                              {user.address}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {user.role === 'STORE_ADMIN'
                        ? user.managedWarehouses && user.managedWarehouses.length > 0
                          ? user.managedWarehouses.map((w) => w.name).join(', ')
                          : user.warehouse?.name ?? 'Unassigned'
                        : user.project?.name ?? (user.role === 'SUPER_ADMIN' ? 'Company-wide' : 'Unassigned')}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={user.status === 'ACTIVE' ? 'success' : user.status === 'DISABLED' ? 'danger' : 'warning'}>
                        {user.status.replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end items-center gap-1.5 flex-nowrap">
                        <Button variant="secondary" size="sm" onClick={() => openEditModal(user)}>
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setResetTarget({ id: user.id, username: user.username });
                            setResetPassword('');
                          }}
                        >
                          Reset Password
                        </Button>
                        {user.status === 'DISABLED' ? (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={enableMutation.isPending}
                            onClick={() => toggleUserStatus(user)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Enable User
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={disableMutation.isPending}
                            onClick={() => toggleUserStatus(user)}
                          >
                            Disable
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Add User Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add New User">
        <form onSubmit={createUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Username *"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              required
              maxLength={80}
              autoComplete="off"
              placeholder="e.g. jdoe_warehouse"
            />
            <Input
              label="Temporary Password *"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
              placeholder="At least 12 characters"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Profile &amp; Identity Details (Optional)
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Full Name"
                value={newFullName}
                onChange={(event) => setNewFullName(event.target.value)}
                maxLength={100}
                placeholder="e.g. John Doe"
              />
              <Input
                label="Phone Number"
                value={newPhoneNumber}
                onChange={(event) => setNewPhoneNumber(event.target.value)}
                maxLength={30}
                placeholder="e.g. +91 9876543210"
              />
            </div>

            <label className="block space-y-1 text-xs font-medium text-slate-700">
              <span>Address</span>
              <textarea
                value={newAddress}
                onChange={(event) => setNewAddress(event.target.value)}
                rows={2}
                maxLength={250}
                placeholder="Residential or site depot address"
                className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
            </label>

            <div>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                <span>ID Card / Photo Image</span>
                <div className="flex items-center gap-3">
                  {newIdImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={newIdImageUrl}
                      alt="Preview"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-300 shrink-0 bg-white"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageFileChange(e.target.files?.[0], setNewIdImageUrl)}
                    className="text-xs text-slate-600 file:mr-2.5 file:py-1 file:px-2.5 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-white hover:file:bg-slate-50 cursor-pointer"
                  />
                  {newIdImageUrl && (
                    <button
                      type="button"
                      onClick={() => setNewIdImageUrl('')}
                      className="text-xs text-rose-600 font-semibold hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </label>
            </div>
          </div>

          <label className="block space-y-1 text-sm font-medium text-[#172033]">
            <span>Role *</span>
            <select
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as UserRole)}
              className="min-h-11 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-sm"
            >
              <option value="STORE_ADMIN">Store Admin (Warehouse)</option>
              <option value="PROJECT_ADMIN">Project Admin (Hospital / Clinic)</option>
              <option value="SUPER_ADMIN">Super Admin (Company-wide)</option>
            </select>
          </label>

          {newRole === 'STORE_ADMIN' && (
            <label className="block space-y-1 text-sm font-medium text-[#172033]">
              <span>Initial Warehouse (Optional)</span>
              <select
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
                disabled={organizationsLoading}
                className="min-h-11 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-sm"
              >
                <option value="">Choose a warehouse (optional, can assign later)</option>
                {(warehousesQuery.data ?? [])
                  .filter((item) => !item.status || item.status === 'ACTIVE')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {newRole === 'PROJECT_ADMIN' && (
            <label className="block space-y-1 text-sm font-medium text-[#172033]">
              <span>Project Facility *</span>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                required
                disabled={organizationsLoading}
                className="min-h-11 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-sm"
              >
                <option value="">Choose a project</option>
                {(projectsQuery.data ?? [])
                  .filter((item) => !item.status || item.status === 'ACTIVE')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div className="flex justify-end gap-2 border-t border-[#dbe3ee] pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={createMutation.isPending || organizationsLoading}
            >
              {createMutation.isPending ? 'Saving...' : 'Create account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={Boolean(editingUser)} onClose={() => setEditingUser(null)} title={`Edit Details for @${editingUser?.username || ''}`}>
        <form onSubmit={saveUserEdits} className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Editable Profile &amp; Contact Details
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Full Name"
                value={editFullName}
                onChange={(event) => setEditFullName(event.target.value)}
                maxLength={100}
                placeholder="e.g. John Doe"
              />
              <Input
                label="Phone Number"
                value={editPhoneNumber}
                onChange={(event) => setEditPhoneNumber(event.target.value)}
                maxLength={30}
                placeholder="e.g. +91 9876543210"
              />
            </div>

            <label className="block space-y-1 text-xs font-medium text-slate-700">
              <span>Address</span>
              <textarea
                value={editAddress}
                onChange={(event) => setEditAddress(event.target.value)}
                rows={2}
                maxLength={250}
                placeholder="Residential or site depot address"
                className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
            </label>

            <div>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                <span>ID Card / Photo Image</span>
                <div className="flex items-center gap-3">
                  {editIdImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editIdImageUrl}
                      alt="Preview"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-300 shrink-0 bg-white"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageFileChange(e.target.files?.[0], setEditIdImageUrl)}
                    className="text-xs text-slate-600 file:mr-2.5 file:py-1 file:px-2.5 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-white hover:file:bg-slate-50 cursor-pointer"
                  />
                  {editIdImageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditIdImageUrl('')}
                      className="text-xs text-rose-600 font-semibold hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </label>
            </div>
          </div>

          <label className="block space-y-1 text-sm font-medium text-[#172033]">
            <span>Role</span>
            <select
              value={editRole}
              onChange={(event) => setEditRole(event.target.value as UserRole)}
              className="min-h-11 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-sm"
            >
              <option value="STORE_ADMIN">Store Admin</option>
              <option value="PROJECT_ADMIN">Project Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </label>

          {editRole === 'STORE_ADMIN' && (
            <label className="block space-y-1 text-sm font-medium text-[#172033]">
              <span>Assigned Warehouse</span>
              <select
                value={editWarehouseId}
                onChange={(event) => setEditWarehouseId(event.target.value)}
                disabled={organizationsLoading}
                className="min-h-11 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-sm"
              >
                <option value="">Choose a warehouse (or unassigned)</option>
                {(warehousesQuery.data ?? [])
                  .filter((item) => !item.status || item.status === 'ACTIVE')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {editRole === 'PROJECT_ADMIN' && (
            <label className="block space-y-1 text-sm font-medium text-[#172033]">
              <span>Assigned Project Facility</span>
              <select
                value={editProjectId}
                onChange={(event) => setEditProjectId(event.target.value)}
                disabled={organizationsLoading}
                className="min-h-11 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-sm"
              >
                <option value="">Choose a project</option>
                {(projectsQuery.data ?? [])
                  .filter((item) => !item.status || item.status === 'ACTIVE')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div className="flex justify-end gap-2 border-t border-[#dbe3ee] pt-4">
            <Button variant="secondary" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={updateMutation.isPending || organizationsLoading}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset password${resetTarget ? ` for ${resetTarget.username}` : ''}`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (resetTarget) resetMutation.mutate({ id: resetTarget.id, password: resetPassword });
          }}
          className="space-y-4"
        >
          <Input
            label="New password (at least 12 characters)"
            type="password"
            value={resetPassword}
            onChange={(event) => setResetPassword(event.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
          <p className="text-sm text-[#5b6678]">This ends all active sessions for the account.</p>
          <div className="flex justify-end gap-2 border-t border-[#dbe3ee] pt-4">
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={resetMutation.isPending}>
              {resetMutation.isPending ? 'Resetting...' : 'Reset password'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default UsersManagement;
