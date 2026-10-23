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
import { administrationService, ManagedProject } from '../administration.service';
import { queryKeys } from '../../../lib/query/query-keys';

type ProjectEdit = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
};

export function ProjectsManagement() {
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editing, setEditing] = useState<ProjectEdit | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: queryKeys.administration.projects(),
    queryFn: administrationService.getProjects,
  });

  const warehousesQuery = useQuery({
    queryKey: queryKeys.administration.warehouses(),
    queryFn: administrationService.getWarehouses,
  });

  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.administration.projects() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.administration.warehouses() }),
    ]);

  const mutationOptions = {
    onSuccess: async () => {
      await refresh();
      setNotice('Project record updated.');
      setActionError(null);
      setTimeout(() => setNotice(null), 4000);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : 'Could not complete project update.');
    },
  };

  const createProject = useMutation({
    mutationFn: administrationService.createProject,
    ...mutationOptions,
  });

  const updateProject = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; status: 'ACTIVE' | 'INACTIVE' } }) =>
      administrationService.updateProject(id, payload),
    ...mutationOptions,
  });

  const projects = projectsQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const busy =
    createProject.isPending ||
    updateProject.isPending;

  const filteredProjects = useMemo(() => {
    if (!searchTerm.trim()) return projects;
    const q = searchTerm.toLowerCase();
    return projects.filter((c) => c.name.toLowerCase().includes(q));
  }, [projects, searchTerm]);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setActionError(null);
    createProject.mutate(projectName.trim(), {
      onSuccess: () => {
        setProjectName('');
        setNotice(`Project "${projectName.trim()}" created successfully.`);
      },
    });
  };

  const handleSaveEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setActionError(null);
    updateProject.mutate(
      { id: editing.id, payload: { name: editing.name.trim(), status: editing.status } },
      {
        onSuccess: () => {
          setEditing(null);
          setNotice('Project details saved.');
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Project Organizations"
        description="Manage healthcare lab accounts, diagnostics partners, and project lifecycles."
        actions={
          <Link href="/admin/warehouses">
            <Button variant="secondary">
              Go to Warehouses →
            </Button>
          </Link>
        }
      />

      {/* KPI Overview Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Total Projects
              </span>
              <div className="text-xl font-bold font-mono text-slate-900">
                {projectsQuery.isLoading ? '—' : projects.length}
              </div>
              <p className="text-[11px] text-slate-500">
                {projects.filter((c) => c.status !== 'INACTIVE').length} active lab organizations
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
                Supply Network
              </span>
              <div className="text-xl font-bold font-mono text-emerald-600">
                Universal
              </div>
              <p className="text-[11px] text-slate-500">Direct fulfillment from any depot</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Inactive Accounts
              </span>
              <div className="text-xl font-bold font-mono text-slate-900">
                {projectsQuery.isLoading ? '—' : projects.filter((c) => c.status === 'INACTIVE').length}
              </div>
              <p className="text-[11px] text-slate-500">Disabled or archived</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
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

      {projectsQuery.error && (
        <ErrorState
          message="Could not load project organizations."
          onRetry={() => void projectsQuery.refetch()}
        />
      )}

      {/* Create Project Card */}
      <Card>
        <CardHeader>
          <CardTitle>Register New Project Organization</CardTitle>
          <CardDescription>
            Onboard a new diagnostic lab or clinical partner account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                maxLength={120}
                required
                placeholder="Enter project lab name (e.g. Apex Diagnostics Clinic)..."
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !projectName.trim()}
              className="shrink-0"
            >
              + Create Project
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Project Directory Card */}
      <Card>
        <CardHeader
          action={
            <div className="w-full sm:w-64 relative">
              <input
                type="text"
                placeholder="Search projects..."
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
          <CardTitle>Project Directory</CardTitle>
          <CardDescription>
            Registered project accounts and diagnostic facilities. Supplies can be transferred directly from any warehouse depot.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {projectsQuery.isLoading ? (
            <div className="p-8"><LoadingState message="Loading project accounts..." /></div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              {projects.length === 0 ? 'No projects onboarded yet.' : 'No projects match your search term.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredProjects.map((project: ManagedProject) => {
                const isInactive = project.status === 'INACTIVE';

                return (
                  <div key={project.id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">{project.name}</h4>
                          <Badge variant={isInactive ? 'neutral' : 'success'} size="sm">
                            {project.status ?? 'ACTIVE'}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/projects/${project.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50/60 hover:bg-blue-50 rounded-lg border border-blue-200/80 transition-colors"
                        >
                          <span>Project Overview</span>
                          <span>→</span>
                        </Link>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditing({ id: project.id, name: project.name, status: project.status ?? 'ACTIVE' })}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>

                    {/* Fulfillment Eligibility Tag */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-medium text-xs border border-blue-200/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        Universal Fulfillment Eligible · Direct supply transfers authorized from any warehouse
                      </span>
                      <span className="text-[11px] text-slate-400">ID: {project.id.slice(0, 8)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Project Modal */}
      {editing && (
        <Modal
          isOpen={Boolean(editing)}
          onClose={() => setEditing(null)}
          title="Edit Project Organization"
          description="Update lab organization name and active operational status."
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <Input
              label="Project Name"
              autoFocus
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              required
              maxLength={120}
            />

            <Select
              label="Operational Status"
              value={editing.status}
              onChange={(e) => setEditing({ ...editing, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
            >
              <option value="ACTIVE">Active (In Service)</option>
              <option value="INACTIVE">Inactive (Archived)</option>
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

export default ProjectsManagement;
