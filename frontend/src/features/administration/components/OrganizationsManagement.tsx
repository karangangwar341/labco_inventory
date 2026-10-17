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
import { EmptyState } from '../../../components/feedback/EmptyState';
import { administrationService, ManagedClient, ManagedWarehouse } from '../administration.service';
import { queryKeys } from '../../../lib/query/query-keys';

type OrganizationEdit = {
  kind: 'client' | 'warehouse';
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  locationDescription?: string;
};

export function OrganizationsManagement() {
  const queryClient = useQueryClient();
  const [clientName, setClientName] = useState('');
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [editing, setEditing] = useState<OrganizationEdit | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Search filters
  const [clientSearch, setClientSearch] = useState('');
  const [warehouseSearch, setWarehouseSearch] = useState('');

  const clientsQuery = useQuery({
    queryKey: queryKeys.administration.clients(),
    queryFn: administrationService.getClients,
  });

  const warehousesQuery = useQuery({
    queryKey: queryKeys.administration.warehouses(),
    queryFn: administrationService.getWarehouses,
  });

  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.administration.clients() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.administration.warehouses() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.administration.users() }),
    ]);

  const mutationOptions = {
    onSuccess: async () => {
      await refresh();
      setNotice('Organization records updated successfully.');
      setActionError(null);
      setTimeout(() => setNotice(null), 4000);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : 'Could not save organization change.');
    },
  };

  const createClient = useMutation({ mutationFn: administrationService.createClient, ...mutationOptions });
  const createWarehouse = useMutation({ mutationFn: administrationService.createWarehouse, ...mutationOptions });
  const updateClient = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; status: 'ACTIVE' | 'INACTIVE' } }) =>
      administrationService.updateClient(id, payload),
    ...mutationOptions,
  });
  const updateWarehouse = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; status: 'ACTIVE' | 'INACTIVE'; locationDescription?: string } }) =>
      administrationService.updateWarehouse(id, payload),
    ...mutationOptions,
  });
  const assignWarehouse = useMutation({
    mutationFn: ({ clientId, warehouseId }: { clientId: string; warehouseId: string }) =>
      administrationService.assignWarehouse(clientId, warehouseId),
    ...mutationOptions,
  });
  const deactivateAssignment = useMutation({
    mutationFn: ({ clientId, warehouseId }: { clientId: string; warehouseId: string }) =>
      administrationService.deactivateAssignment(clientId, warehouseId),
    ...mutationOptions,
  });

  const clients = clientsQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const busy =
    createClient.isPending ||
    createWarehouse.isPending ||
    updateClient.isPending ||
    updateWarehouse.isPending ||
    assignWarehouse.isPending ||
    deactivateAssignment.isPending;

  // Filtered lists
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const filteredWarehouses = useMemo(() => {
    if (!warehouseSearch.trim()) return warehouses;
    const q = warehouseSearch.toLowerCase();
    return warehouses.filter(
      (w) => w.name.toLowerCase().includes(q) || (w.locationDescription || '').toLowerCase().includes(q)
    );
  }, [warehouses, warehouseSearch]);

  // Total active assignments count
  const totalActiveAssignments = useMemo(() => {
    return clients.reduce((acc, c) => acc + (c.warehouseAssignments?.length || 0), 0);
  }, [clients]);

  const createNewClient = (event: FormEvent) => {
    event.preventDefault();
    if (!clientName.trim()) return;
    setActionError(null);
    createClient.mutate(clientName.trim(), {
      onSuccess: () => {
        setClientName('');
        setNotice(`Client "${clientName.trim()}" added successfully.`);
      },
    });
  };

  const createNewWarehouse = (event: FormEvent) => {
    event.preventDefault();
    if (!warehouseName.trim()) return;
    setActionError(null);
    createWarehouse.mutate(
      {
        name: warehouseName.trim(),
        locationDescription: warehouseLocation.trim() || undefined,
      },
      {
        onSuccess: () => {
          setWarehouseName('');
          setWarehouseLocation('');
          setNotice(`Warehouse "${warehouseName.trim()}" added successfully.`);
        },
      }
    );
  };

  const saveEdit = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setActionError(null);
    if (editing.kind === 'client') {
      updateClient.mutate(
        { id: editing.id, payload: { name: editing.name.trim(), status: editing.status } },
        {
          onSuccess: () => {
            setEditing(null);
            setNotice('Client organization updated.');
          },
        }
      );
      return;
    }
    updateWarehouse.mutate(
      {
        id: editing.id,
        payload: {
          name: editing.name.trim(),
          status: editing.status,
          locationDescription: editing.locationDescription?.trim(),
        },
      },
      {
        onSuccess: () => {
          setEditing(null);
          setNotice('Warehouse location updated.');
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Organizations & Consignments"
        description="Configure client lab organizations, regional distribution warehouses, and authorized dispatch supply routes."
      />

      {/* KPI Overview Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Client Accounts
              </span>
              <div className="text-xl font-bold text-slate-900 font-mono">
                {clientsQuery.isLoading ? '—' : clients.length}
              </div>
              <p className="text-[11px] text-slate-500">
                {clients.filter((c) => c.status !== 'INACTIVE').length} active organizations
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Warehouses
              </span>
              <div className="text-xl font-bold text-slate-900 font-mono">
                {warehousesQuery.isLoading ? '—' : warehouses.length}
              </div>
              <p className="text-[11px] text-slate-500">
                {warehouses.filter((w) => w.status !== 'INACTIVE').length} active storage facilities
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
                Consignment Routes
              </span>
              <div className="text-xl font-bold text-slate-900 font-mono">
                {clientsQuery.isLoading ? '—' : totalActiveAssignments}
              </div>
              <p className="text-[11px] text-slate-500">Authorized supply links</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications and Alerts */}
      {notice && (
        <div role="status" className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2.5">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">{notice}</span>
        </div>
      )}

      {actionError && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2.5">
          <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{actionError}</span>
        </div>
      )}

      {(clientsQuery.error || warehousesQuery.error) && (
        <ErrorState
          message="Could not load organization records. Check database connection."
          onRetry={() => {
            void clientsQuery.refetch();
            void warehousesQuery.refetch();
          }}
        />
      )}

      {/* Main Grid: Clients on Left, Warehouses on Right */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Clients Column */}
        <Card className="flex flex-col">
          <CardHeader
            action={
              <span className="text-xs font-mono text-slate-500 font-semibold">
                {clients.length} Total
              </span>
            }
          >
            <CardTitle>Client Organizations</CardTitle>
            <CardDescription>
              Each client lab or hospital can be consigned to one or more fulfillment warehouses.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 flex-1">
            {/* Add New Client Form */}
            <form onSubmit={createNewClient} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex gap-2 items-center">
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                maxLength={120}
                required
                aria-label="New client name"
                placeholder="Enter client name (e.g. Metro Diagnostics)..."
                className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
              <Button type="submit" variant="primary" size="sm" disabled={busy || !clientName.trim()}>
                + Add Client
              </Button>
            </form>

            {/* Client Search */}
            {clients.length > 3 && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter clients..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
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
            )}

            {/* Clients List */}
            {clientsQuery.isLoading ? (
              <LoadingState message="Loading client accounts..." />
            ) : filteredClients.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                {clients.length === 0 ? 'No clients created yet.' : 'No clients match your filter.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                {filteredClients.map((item: ManagedClient) => {
                  const activeAssignments = item.warehouseAssignments ?? [];
                  const isInactive = item.status === 'INACTIVE';

                  return (
                    <div key={item.id} className="py-3.5 space-y-2 hover:bg-slate-50/50 rounded-lg px-2 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-slate-900">{item.name}</span>
                            <Badge variant={isInactive ? 'neutral' : 'success'} size="sm">
                              {item.status ?? 'ACTIVE'}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/organizations/${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md border border-blue-200/80 transition-colors"
                          >
                            <span>Client Overview</span>
                            <span>→</span>
                          </Link>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setEditing({
                                kind: 'client',
                                id: item.id,
                                name: item.name,
                                status: item.status ?? 'ACTIVE',
                              })
                            }
                          >
                            Edit
                          </Button>
                        </div>
                      </div>

                      {/* Consigned Warehouses Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-medium text-slate-400">Consigned to:</span>
                        {activeAssignments.length > 0 ? (
                          activeAssignments.map((assignment) => (
                            <span
                              key={assignment.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200/80 text-[11px] font-mono"
                            >
                              <svg className="w-3 h-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              <span>{assignment.warehouse.name}</span>
                              <button
                                type="button"
                                aria-label={`Remove ${assignment.warehouse.name} assignment from ${item.name}`}
                                disabled={busy}
                                onClick={() =>
                                  deactivateAssignment.mutate({
                                    clientId: item.id,
                                    warehouseId: assignment.warehouseId,
                                  })
                                }
                                className="ml-1 text-slate-400 hover:text-rose-600 font-bold transition-colors"
                              >
                                ×
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No warehouse consigned</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Warehouses Column */}
        <Card className="flex flex-col">
          <CardHeader
            action={
              <span className="text-xs font-mono text-slate-500 font-semibold">
                {warehouses.length} Total
              </span>
            }
          >
            <CardTitle>Distribution Warehouses</CardTitle>
            <CardDescription>
              Fulfillment facilities where Store Admin accounts post receipts, dispatches, and transfers.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 flex-1">
            {/* Add New Warehouse Form */}
            <form onSubmit={createNewWarehouse} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={warehouseName}
                  onChange={(e) => setWarehouseName(e.target.value)}
                  maxLength={120}
                  required
                  aria-label="New warehouse name"
                  placeholder="Warehouse name (e.g. Central Depot)..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
                <input
                  value={warehouseLocation}
                  onChange={(e) => setWarehouseLocation(e.target.value)}
                  maxLength={240}
                  aria-label="Warehouse location description"
                  placeholder="Location / Address (optional)..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="sm" disabled={busy || !warehouseName.trim()}>
                  + Add Warehouse
                </Button>
              </div>
            </form>

            {/* Warehouse Search */}
            {warehouses.length > 3 && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter warehouses..."
                  value={warehouseSearch}
                  onChange={(e) => setWarehouseSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
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
            )}

            {/* Warehouses List */}
            {warehousesQuery.isLoading ? (
              <LoadingState message="Loading storage locations..." />
            ) : filteredWarehouses.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                {warehouses.length === 0 ? 'No warehouses created yet.' : 'No warehouses match your filter.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                {filteredWarehouses.map((item: ManagedWarehouse) => {
                  const isInactive = item.status === 'INACTIVE';
                  return (
                    <div key={item.id} className="py-3.5 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50/50 rounded-lg px-2 transition-colors">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-slate-900">{item.name}</span>
                          <Badge variant={isInactive ? 'neutral' : 'purple'} size="sm">
                            {item.status ?? 'ACTIVE'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                          <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{item.locationDescription || 'Location not specified'}</span>
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            kind: 'warehouse',
                            id: item.id,
                            name: item.name,
                            status: item.status ?? 'ACTIVE',
                            locationDescription: item.locationDescription ?? '',
                          })
                        }
                      >
                        Edit
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Consignment Routing Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <CardTitle>Configure Client &amp; Warehouse Consignment</CardTitle>
              <CardDescription>
                Authorizing a warehouse allows Store Admins to create dispatch stock-outs directly to that client.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedClientId || !selectedWarehouseId) return;
              assignWarehouse.mutate(
                { clientId: selectedClientId, warehouseId: selectedWarehouseId },
                {
                  onSuccess: () => {
                    setSelectedWarehouseId('');
                    setNotice('Warehouse consignment route established.');
                  },
                }
              );
            }}
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end"
          >
            <Select
              label="Select Client Lab"
              required
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              helperText="Choose the recipient client organization"
            >
              <option value="">Choose client...</option>
              {clients
                .filter((item) => item.status !== 'INACTIVE')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </Select>

            <Select
              label="Select Source Warehouse"
              required
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              helperText="Choose the fulfillment distribution warehouse"
            >
              <option value="">Choose warehouse...</option>
              {warehouses
                .filter((item) => item.status !== 'INACTIVE')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.locationDescription || 'Location unassigned'})
                  </option>
                ))}
            </Select>

            <Button
              type="submit"
              variant="primary"
              disabled={busy || !selectedClientId || !selectedWarehouseId}
              className="w-full sm:w-auto h-10"
            >
              Authorize Route
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Edit Organization Modal */}
      {editing && (
        <Modal
          isOpen={Boolean(editing)}
          onClose={() => setEditing(null)}
          title={`Edit ${editing.kind === 'client' ? 'Client Organization' : 'Distribution Warehouse'}`}
          description="Update organizational name, operational status, or location details."
        >
          <form onSubmit={saveEdit} className="space-y-4">
            <Input
              label="Organization Name"
              autoFocus
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              required
              maxLength={120}
            />

            {editing.kind === 'warehouse' && (
              <Input
                label="Location Description"
                value={editing.locationDescription ?? ''}
                onChange={(e) => setEditing({ ...editing, locationDescription: e.target.value })}
                maxLength={240}
                placeholder="e.g. Sector 4, North Depot"
              />
            )}

            <Select
              label="Operational Status"
              value={editing.status}
              onChange={(e) => setEditing({ ...editing, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
            >
              <option value="ACTIVE">Active (In Service)</option>
              <option value="INACTIVE">Inactive (Disabled)</option>
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

export default OrganizationsManagement;
