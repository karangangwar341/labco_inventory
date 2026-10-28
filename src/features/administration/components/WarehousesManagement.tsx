'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { administrationService, ManagedWarehouse } from '../administration.service';
import { queryKeys } from '../../../lib/query/query-keys';

type WarehouseEdit = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  locationDescription?: string;
  storeAdminId?: string | null;
};

export function WarehousesManagement() {
  const queryClient = useQueryClient();
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('');
  const [createStoreAdminId, setCreateStoreAdminId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editing, setEditing] = useState<WarehouseEdit | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const warehousesQuery = useQuery({
    queryKey: queryKeys.administration.warehouses(),
    queryFn: administrationService.getWarehouses,
  });

  const projectsQuery = useQuery({
    queryKey: queryKeys.administration.projects(),
    queryFn: administrationService.getProjects,
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.administration.users(),
    queryFn: administrationService.getUsers,
  });

  const storeAdmins = useMemo(() => {
    return (usersQuery.data ?? []).filter(
      (u) => u.role === 'STORE_ADMIN' && u.status === 'ACTIVE',
    );
  }, [usersQuery.data]);

  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.administration.warehouses() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.administration.projects() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.administration.users() }),
    ]);

  const mutationOptions = {
    onSuccess: async () => {
      await refresh();
      setNotice('Warehouse record updated.');
      setActionError(null);
      setTimeout(() => setNotice(null), 4000);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : 'Could not complete warehouse update.');
    },
  };

  const createWarehouse = useMutation({
    mutationFn: administrationService.createWarehouse,
    ...mutationOptions,
  });

  const updateWarehouse = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        name: string;
        status: 'ACTIVE' | 'INACTIVE';
        locationDescription?: string;
        storeAdminId?: string | null;
      };
    }) => administrationService.updateWarehouse(id, payload),
    ...mutationOptions,
  });

  const warehouses = warehousesQuery.data ?? [];
  const busy = createWarehouse.isPending || updateWarehouse.isPending;

  const filteredWarehouses = useMemo(() => {
    if (!searchTerm.trim()) return warehouses;
    const q = searchTerm.toLowerCase();
    return warehouses.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.locationDescription || '').toLowerCase().includes(q) ||
        (w.storeAdmin?.username || '').toLowerCase().includes(q),
    );
  }, [warehouses, searchTerm]);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!warehouseName.trim()) return;
    setActionError(null);
    createWarehouse.mutate(
      {
        name: warehouseName.trim(),
        locationDescription: warehouseLocation.trim() || undefined,
        storeAdminId: createStoreAdminId || null,
      },
      {
        onSuccess: () => {
          setWarehouseName('');
          setWarehouseLocation('');
          setCreateStoreAdminId('');
          setNotice(`Warehouse "${warehouseName.trim()}" created successfully.`);
        },
      },
    );
  };

  const handleSaveEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setActionError(null);
    updateWarehouse.mutate(
      {
        id: editing.id,
        payload: {
          name: editing.name.trim(),
          status: editing.status,
          locationDescription: editing.locationDescription?.trim(),
          storeAdminId: editing.storeAdminId ?? null,
        },
      },
      {
        onSuccess: () => {
          setEditing(null);
          setNotice('Warehouse details saved.');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Distribution Warehouses"
        description="Configure central storage depots, physical location details, and assign Store Admins."
        actions={
          <Link href="/admin/projects">
            <Button variant="secondary">← Go to Projects</Button>
          </Link>
        }
      />

      {/* KPI Overview Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Total Facilities
              </span>
              <div className="text-xl font-bold font-mono text-slate-900">
                {warehousesQuery.isLoading ? '—' : warehouses.length}
              </div>
              <p className="text-[11px] text-slate-500">
                {warehouses.filter((w) => w.status !== 'INACTIVE').length} operational storage depots
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
              </svg>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Store Admin Assigned
              </span>
              <div className="text-xl font-bold font-mono text-slate-900">
                {warehousesQuery.isLoading
                  ? '—'
                  : warehouses.filter((w) => Boolean(w.storeAdminId || w.storeAdmin)).length}
              </div>
              <p className="text-[11px] text-slate-500">
                {warehouses.filter((w) => !w.storeAdminId && !w.storeAdmin).length} unassigned depot(s)
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Fulfillment Network
              </span>
              <div className="text-xl font-bold font-mono text-emerald-600">Universal</div>
              <p className="text-[11px] text-slate-500">All depots dispatch to any active project</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications */}
      {notice && (
        <div role="status" className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">{notice}</span>
        </div>
      )}

      {actionError && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{actionError}</span>
        </div>
      )}

      {warehousesQuery.error && (
        <ErrorState
          message="Could not load distribution warehouses."
          onRetry={() => void warehousesQuery.refetch()}
        />
      )}

      {/* Create Warehouse Card */}
      <Card>
        <CardHeader>
          <CardTitle>Register New Distribution Warehouse</CardTitle>
          <CardDescription>
            Add a physical warehouse location. Assign any Store Admin to manage stock operations (one Store Admin can manage multiple warehouses; each warehouse has at most one Store Admin).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Warehouse Name"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                maxLength={120}
                required
                placeholder="e.g. North Regional Logistics Depot"
              />
              <Input
                label="Physical Address / Location"
                value={warehouseLocation}
                onChange={(e) => setWarehouseLocation(e.target.value)}
                maxLength={240}
                placeholder="e.g. Industrial Sector 4, Dock 12 (optional)"
              />
              <Select
                label="Assign Store Admin (Optional)"
                value={createStoreAdminId}
                onChange={(e) => setCreateStoreAdminId(e.target.value)}
              >
                <option value="">Unassigned (No Store Admin)</option>
                {storeAdmins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.username}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary" disabled={busy || !warehouseName.trim()}>
                + Create Warehouse
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Warehouse Directory Card */}
      <Card>
        <CardHeader
          action={
            <div className="w-full sm:w-64 relative">
              <input
                type="text"
                placeholder="Search warehouses or store admins..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          }
        >
          <CardTitle>Warehouse Directory</CardTitle>
          <CardDescription>
            Operational storage facilities and fulfillment depots with their assigned Store Admin personnel.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {warehousesQuery.isLoading ? (
            <div className="p-8">
              <LoadingState message="Loading warehouses..." />
            </div>
          ) : filteredWarehouses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              {warehouses.length === 0
                ? 'No warehouses created yet.'
                : 'No warehouses match your search term.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredWarehouses.map((warehouse: ManagedWarehouse) => {
                const isInactive = warehouse.status === 'INACTIVE';
                const assignedAdmin = warehouse.storeAdmin;

                return (
                  <div
                    key={warehouse.id}
                    className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">{warehouse.name}</h4>
                          <Badge variant={isInactive ? 'neutral' : 'purple'} size="sm">
                            {warehouse.status ?? 'ACTIVE'}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                          <div className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{warehouse.locationDescription || 'Location unassigned'}</span>
                          </div>
                          <span className="text-slate-300">·</span>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">Assigned Admin:</span>
                            {assignedAdmin ? (
                              <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                                👤 {assignedAdmin.username}
                              </span>
                            ) : (
                              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs italic">
                                Unassigned
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/inventory?locationId=${warehouse.id}&view=WAREHOUSE`}>
                          <Button variant="primary" size="sm">
                            📦 View Depot Stock ➔
                          </Button>
                        </Link>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setEditing({
                              id: warehouse.id,
                              name: warehouse.name,
                              status: warehouse.status ?? 'ACTIVE',
                              locationDescription: warehouse.locationDescription ?? '',
                              storeAdminId: warehouse.storeAdminId ?? warehouse.storeAdmin?.id ?? null,
                            })
                          }
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Warehouse Modal */}
      {editing && (
        <Modal
          isOpen={Boolean(editing)}
          onClose={() => setEditing(null)}
          title="Edit Distribution Warehouse"
          description="Update storage facility name, operational address, active status, or assign Store Admin."
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <Input
              label="Warehouse Facility Name"
              autoFocus
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              required
              maxLength={120}
            />

            <Input
              label="Location Description / Address"
              value={editing.locationDescription ?? ''}
              onChange={(e) => setEditing({ ...editing, locationDescription: e.target.value })}
              maxLength={240}
              placeholder="e.g. North Gate Logistics Bay, Dock 4"
            />

            <Select
              label="Assigned Store Admin"
              value={editing.storeAdminId ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, storeAdminId: e.target.value || null })
              }
            >
              <option value="">Unassigned (No Store Admin)</option>
              {storeAdmins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.username}
                </option>
              ))}
            </Select>

            <Select
              label="Operational Status"
              value={editing.status}
              onChange={(e) =>
                setEditing({ ...editing, status: e.target.value as 'ACTIVE' | 'INACTIVE' })
              }
            >
              <option value="ACTIVE">Active (In Service)</option>
              <option value="INACTIVE">Inactive (Decommissioned)</option>
            </Select>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default WarehousesManagement;
