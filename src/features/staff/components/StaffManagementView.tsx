'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { useAuth } from '@/features/auth/auth.store';
import { staffService } from '../staff.service';
import { administrationService } from '@/features/administration/administration.service';
import {
  ProjectStaffMember,
  ProjectStaffWorkLog,
  CreateStaffMemberPayload,
  UpdateStaffMemberPayload,
  CreateWorkLogPayload,
} from '../staff.types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';

type ActiveTab = 'STAFF' | 'LOGS';

export interface StaffManagementViewProps {
  projectId?: string;
  hideHeader?: boolean;
}

export function StaffManagementView({ projectId: propProjectId, hideHeader = false }: StaffManagementViewProps = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [selectedProjectId, setSelectedProjectId] = useState<string>(propProjectId || 'ALL');
  const [modalProjectId, setModalProjectId] = useState<string>(propProjectId || '');

  useEffect(() => {
    if (propProjectId) {
      setSelectedProjectId(propProjectId);
      setModalProjectId(propProjectId);
    }
  }, [propProjectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ['administration', 'projects'],
    queryFn: administrationService.getProjects,
    enabled: isSuperAdmin && !propProjectId,
  });

  const effectiveProjectId = propProjectId || (isSuperAdmin
    ? selectedProjectId !== 'ALL'
      ? selectedProjectId
      : undefined
    : user?.projectId);

  const [activeTab, setActiveTab] = useState<ActiveTab>('STAFF');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');

  // Pagination states for Staff Directory
  const [staffCurrentPage, setStaffCurrentPage] = useState(1);
  const [staffPageSize, setStaffPageSize] = useState(9);

  // Pagination states for Daily Work Logs
  const [logsCurrentPage, setLogsCurrentPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(10);

  // Modals state
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<ProjectStaffMember | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<ProjectStaffMember | null>(null);
  const [loggingWorkStaff, setLoggingWorkStaff] = useState<ProjectStaffMember | null>(null);
  const [viewingHistoryStaff, setViewingHistoryStaff] = useState<ProjectStaffMember | null>(null);

  // Form states for Staff Member
  const [staffNumber, setStaffNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [contact, setContact] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for Daily Work Log
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [shiftType, setShiftType] = useState('MORNING');
  const [hoursWorked, setHoursWorked] = useState('8.0');
  const [tasksCompleted, setTasksCompleted] = useState('');
  const [workNotes, setWorkNotes] = useState('');
  const [logFormError, setLogFormError] = useState<string | null>(null);

  // Reset pagination on filter / search changes
  useEffect(() => {
    setStaffCurrentPage(1);
  }, [searchQuery, statusFilter, selectedProjectId]);

  useEffect(() => {
    setLogsCurrentPage(1);
  }, [searchQuery, selectedProjectId]);

  // Fetch Staff Members
  const {
    data: staffList = [],
    isLoading: isStaffLoading,
    error: staffError,
    refetch: refetchStaff,
  } = useQuery({
    queryKey: queryKeys.staff.list(effectiveProjectId || (isSuperAdmin ? 'all-projects' : user?.id)),
    queryFn: () => staffService.listStaff(effectiveProjectId ? { projectId: effectiveProjectId } : undefined),
    staleTime: 2 * 60 * 1000,
  });

  // Fetch All Project Work Logs
  const {
    data: allWorkLogs = [],
    isLoading: isLogsLoading,
    error: logsError,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: queryKeys.staff.workLogs(effectiveProjectId || (isSuperAdmin ? 'all-projects' : user?.id)),
    queryFn: () => staffService.listProjectWorkLogs(effectiveProjectId ? { projectId: effectiveProjectId } : undefined),
    staleTime: 2 * 60 * 1000,
  });

  // Fetch individual staff member history when viewing
  const { data: staffHistoryLogs = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: queryKeys.staff.staffWorkLogs(viewingHistoryStaff?.id || ''),
    queryFn: () => (viewingHistoryStaff ? staffService.listStaffWorkLogs(viewingHistoryStaff.id) : []),
    enabled: !!viewingHistoryStaff,
  });

  // Mutations
  const createStaffMutation = useMutation({
    mutationFn: (payload: CreateStaffMemberPayload) => staffService.createStaff(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
      setIsAddStaffOpen(false);
      resetStaffForm();
    },
    onError: (err: any) => {
      setFormError(err?.message || 'Failed to create staff member');
    },
  });

  const updateStaffMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateStaffMemberPayload }) =>
      staffService.updateStaff(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
      setEditingStaff(null);
      resetStaffForm();
    },
    onError: (err: any) => {
      setFormError(err?.message || 'Failed to update staff member');
    },
  });

  const deleteStaffMutation = useMutation({
    mutationFn: (id: string) => staffService.deleteStaff(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
      setDeletingStaff(null);
    },
  });

  const createWorkLogMutation = useMutation({
    mutationFn: ({ staffId, payload }: { staffId: string; payload: CreateWorkLogPayload }) =>
      staffService.createWorkLog(staffId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
      setLoggingWorkStaff(null);
      resetLogForm();
    },
    onError: (err: any) => {
      setLogFormError(err?.message || 'Failed to submit daily work log');
    },
  });

  const resetStaffForm = () => {
    setStaffNumber('');
    setFullName('');
    setRoleTitle('');
    setContact('');
    setEditStatus('ACTIVE');
    setModalProjectId(propProjectId || '');
    setFormError(null);
  };

  const resetLogForm = () => {
    setLogDate(new Date().toISOString().split('T')[0]);
    setShiftType('MORNING');
    setHoursWorked('8.0');
    setTasksCompleted('');
    setWorkNotes('');
    setLogFormError(null);
  };

  const openEditModal = (staff: ProjectStaffMember) => {
    setEditingStaff(staff);
    setStaffNumber(staff.staffNumber);
    setFullName(staff.fullName);
    setRoleTitle(staff.roleTitle || '');
    setContact(staff.contact || '');
    setEditStatus(staff.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED');
    setFormError(null);
  };

  const openLogWorkModal = (staff: ProjectStaffMember) => {
    setLoggingWorkStaff(staff);
    resetLogForm();
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!staffNumber.trim()) {
      setFormError('Staff number/badge ID is required');
      return;
    }
    if (!fullName.trim()) {
      setFormError('Full name is required');
      return;
    }
    if (!editingStaff && isSuperAdmin && !propProjectId && !modalProjectId) {
      setFormError('Please select a project organization to assign this staff member');
      return;
    }

    if (editingStaff) {
      updateStaffMutation.mutate({
        id: editingStaff.id,
        payload: {
          staffNumber: staffNumber.trim(),
          fullName: fullName.trim(),
          roleTitle: roleTitle.trim() || undefined,
          contact: contact.trim() || undefined,
          status: editStatus,
        },
      });
    } else {
      const targetProjectId = propProjectId || (isSuperAdmin && modalProjectId ? modalProjectId : undefined);
      createStaffMutation.mutate({
        staffNumber: staffNumber.trim(),
        fullName: fullName.trim(),
        roleTitle: roleTitle.trim() || undefined,
        contact: contact.trim() || undefined,
        ...(targetProjectId ? { projectId: targetProjectId } : {}),
      });
    }
  };

  const handleSubmitWorkLog = (e: React.FormEvent) => {
    e.preventDefault();
    setLogFormError(null);

    if (!loggingWorkStaff) return;
    if (!tasksCompleted.trim()) {
      setLogFormError('Please detail the tasks and activities completed during this shift');
      return;
    }

    const hours = parseFloat(hoursWorked);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      setLogFormError('Hours worked must be a valid number between 0.25 and 24');
      return;
    }

    createWorkLogMutation.mutate({
      staffId: loggingWorkStaff.id,
      payload: {
        logDate,
        shiftType,
        hoursWorked: hours,
        tasksCompleted: tasksCompleted.trim(),
        notes: workNotes.trim() || undefined,
      },
    });
  };

  // Filter staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((m) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        m.fullName.toLowerCase().includes(q) ||
        m.staffNumber.toLowerCase().includes(q) ||
        (m.roleTitle || '').toLowerCase().includes(q) ||
        (m.contact || '').toLowerCase().includes(q) ||
        (m.projectName || '').toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && m.status === 'ACTIVE') ||
        (statusFilter === 'DISABLED' && m.status !== 'ACTIVE');

      return matchesSearch && matchesStatus;
    });
  }, [staffList, searchQuery, statusFilter]);

  // Filter logs list
  const filteredLogs = useMemo(() => {
    if (!searchQuery) return allWorkLogs;
    const q = searchQuery.toLowerCase();
    return allWorkLogs.filter((l) => {
      const memberName = l.staffMember?.fullName?.toLowerCase() || '';
      const memberNumber = l.staffMember?.staffNumber?.toLowerCase() || '';
      const projectName = (l.projectName || '').toLowerCase();
      const tasks = l.tasksCompleted.toLowerCase();
      const notes = (l.notes || '').toLowerCase();
      return (
        memberName.includes(q) ||
        memberNumber.includes(q) ||
        projectName.includes(q) ||
        tasks.includes(q) ||
        notes.includes(q)
      );
    });
  }, [allWorkLogs, searchQuery]);

  // Paginated Staff computations
  const staffTotalPages = Math.ceil(filteredStaff.length / staffPageSize) || 1;
  const staffActivePage = Math.min(staffCurrentPage, staffTotalPages);
  const staffStartItem = filteredStaff.length === 0 ? 0 : (staffActivePage - 1) * staffPageSize + 1;
  const staffEndItem = Math.min(staffActivePage * staffPageSize, filteredStaff.length);
  const paginatedStaff = useMemo(() => {
    const start = (staffActivePage - 1) * staffPageSize;
    return filteredStaff.slice(start, start + staffPageSize);
  }, [filteredStaff, staffActivePage, staffPageSize]);

  // Paginated Logs computations
  const logsTotalPages = Math.ceil(filteredLogs.length / logsPageSize) || 1;
  const logsActivePage = Math.min(logsCurrentPage, logsTotalPages);
  const logsStartItem = filteredLogs.length === 0 ? 0 : (logsActivePage - 1) * logsPageSize + 1;
  const logsEndItem = Math.min(logsActivePage * logsPageSize, filteredLogs.length);
  const paginatedLogs = useMemo(() => {
    const start = (logsActivePage - 1) * logsPageSize;
    return filteredLogs.slice(start, start + logsPageSize);
  }, [filteredLogs, logsActivePage, logsPageSize]);

  // Telemetry metrics
  const activeStaffCount = staffList.filter((m) => m.status === 'ACTIVE').length;
  const todayStr = new Date().toISOString().split('T')[0];
  const logsTodayCount = allWorkLogs.filter((l) => l.logDate.startsWith(todayStr)).length;
  const totalHoursLogged = allWorkLogs.reduce((acc, curr) => acc + Number(curr.hoursWorked || 0), 0);

  if (isStaffLoading && staffList.length === 0) {
    return <LoadingState message="Loading project staff directory and operations..." />;
  }

  if (staffError) {
    return (
      <ErrorState
        title="Failed to load staff roster"
        message={(staffError as Error).message || 'Unable to retrieve staff members'}
        onRetry={() => {
          void refetchStaff();
          void refetchLogs();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {!hideHeader ? (
        <PageHeader
          title="Staff &amp; Workforce Portal"
          description="Manage your facility personnel, assign employee badge numbers, track active shifts, and log daily work accomplishments."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  resetStaffForm();
                  setIsAddStaffOpen(true);
                }}
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Add Staff Member</span>
                </span>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex items-center justify-between pb-1">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Personnel &amp; Workforce</h2>
            <p className="text-xs text-slate-500">Facility personnel, active shifts, and daily shift work logs for this project.</p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              resetStaffForm();
              setIsAddStaffOpen(true);
            }}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Staff Member</span>
            </span>
          </Button>
        </div>
      )}

      {/* KPI Metric Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Active Team Members</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              👥
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{activeStaffCount}</span>
            <span className="text-xs text-slate-500">of {staffList.length} total staff</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Authorized personnel on active duty</p>
        </div>

        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Work Logs Today</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              📋
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{logsTodayCount}</span>
            <span className="text-xs text-slate-500">logged today</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Shift completions recorded for {todayStr}</p>
        </div>

        <div className="saas-card p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Logged Hours</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              ⏱️
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{totalHoursLogged.toFixed(1)}</span>
            <span className="text-xs text-slate-500">hours total</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Across {allWorkLogs.length} verified work log entries</p>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('STAFF')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'STAFF'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
            }`}
          >
            Staff Directory ({staffList.length})
          </button>
          <button
            onClick={() => setActiveTab('LOGS')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'LOGS'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
            }`}
          >
            Daily Work Activity Logs ({allWorkLogs.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isSuperAdmin && !propProjectId && (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-purple-200 bg-purple-50/60 text-purple-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
            >
              <option value="ALL">🏢 All Project Organizations</option>
              {projects.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <div className="relative w-64">
            <input
              type="text"
              placeholder={activeTab === 'STAFF' ? 'Search by name, ID, role...' : 'Search activity logs...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <svg
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {activeTab === 'STAFF' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="DISABLED">Disabled Only</option>
            </select>
          )}
        </div>
      </div>

      {/* TAB 1: STAFF ROSTER */}
      {activeTab === 'STAFF' && (
        <>
          {filteredStaff.length === 0 ? (
            <EmptyState
              title={searchQuery ? 'No matching staff members' : 'No staff members registered yet'}
              description={
                searchQuery
                  ? 'Try broadening your search query or reset the filter.'
                  : 'Start building your facility roster by adding your first staff member.'
              }
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    resetStaffForm();
                    setIsAddStaffOpen(true);
                  }}
                >
                  + Add First Staff Member
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedStaff.map((staff) => (
                  <div
                    key={staff.id}
                    className="saas-card p-5 flex flex-col justify-between hover:border-slate-300 transition-all duration-150"
                  >
                    <div>
                      {/* Header: Badge & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {staff.staffNumber}
                          </span>
                          {isSuperAdmin && staff.projectName && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                              🏢 {staff.projectName}
                            </span>
                          )}
                          <Badge variant={staff.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {staff.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(staff)}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                            title="Edit staff member"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeletingStaff(staff)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete staff member"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Member details */}
                      <div className="mt-3">
                        <h4 className="text-sm font-semibold text-slate-900">{staff.fullName}</h4>
                        <p className="text-xs font-medium text-blue-600 mt-0.5">
                          {staff.roleTitle || 'Operations Associate'}
                        </p>
                        {staff.contact && (
                          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                            <span>📞</span>
                            <span>{staff.contact}</span>
                          </p>
                        )}
                      </div>

                      {/* Latest log preview */}
                      <div className="mt-3.5 pt-3 border-t border-slate-100 text-xs">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                          <span>Daily Log Activity</span>
                          <span className="font-semibold text-slate-700">{staff.totalLogsCount || 0} entries</span>
                        </div>
                        {staff.latestLog ? (
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px] text-slate-600">
                            <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 mb-0.5">
                              <span>{new Date(staff.latestLog.logDate).toLocaleDateString()}</span>
                              <span>{staff.latestLog.shiftType || 'GENERAL'}</span>
                            </div>
                            <p className="line-clamp-2 italic">&ldquo;{staff.latestLog.tasksCompleted}&rdquo;</p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">No work logs submitted yet.</p>
                        )}
                      </div>
                    </div>

                    {/* Actions Footer */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => openLogWorkModal(staff)}
                      >
                        + Submit Daily Work
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs px-2.5"
                        onClick={() => setViewingHistoryStaff(staff)}
                        title="View all past work log history"
                      >
                        History
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Staff Roster Pagination Footer */}
              {filteredStaff.length > 0 && (
                <div className="py-2.5 px-4 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-3">
                    <div>
                      Showing <span className="font-semibold text-slate-700">{staffStartItem}</span> to{' '}
                      <span className="font-semibold text-slate-700">{staffEndItem}</span> of{' '}
                      <span className="font-semibold text-slate-700">{filteredStaff.length}</span> staff members
                    </div>

                    <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                      <span className="text-slate-500">Per page:</span>
                      <select
                        value={staffPageSize}
                        onChange={(e) => {
                          setStaffPageSize(Number(e.target.value));
                          setStaffCurrentPage(1);
                        }}
                        className="px-2 py-0.5 rounded border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
                      >
                        {[6, 9, 18, 36].map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {staffTotalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setStaffCurrentPage(1)}
                        disabled={staffActivePage <= 1}
                        className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium cursor-pointer"
                        title="First Page"
                      >
                        «
                      </button>
                      <button
                        onClick={() => setStaffCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={staffActivePage <= 1}
                        className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium cursor-pointer"
                      >
                        Previous
                      </button>
                      <span className="px-2 text-slate-600 font-medium">
                        Page {staffActivePage} of {staffTotalPages}
                      </span>
                      <button
                        onClick={() => setStaffCurrentPage((p) => Math.min(staffTotalPages, p + 1))}
                        disabled={staffActivePage >= staffTotalPages}
                        className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium cursor-pointer"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setStaffCurrentPage(staffTotalPages)}
                        disabled={staffActivePage >= staffTotalPages}
                        className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium cursor-pointer"
                        title="Last Page"
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* TAB 2: ACTIVITY WORK LOGS */}
      {activeTab === 'LOGS' && (
        <div className="space-y-4">
          {filteredLogs.length === 0 ? (
            <EmptyState
              title="No work logs found"
              description="No daily tasks or shift activities have been submitted yet."
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50/80 border-b border-slate-200 font-semibold text-slate-700 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Date &amp; Shift</th>
                      <th className="py-3 px-4">Staff Member</th>
                      <th className="py-3 px-4">Hours</th>
                      <th className="py-3 px-4">Tasks &amp; Activities Completed</th>
                      <th className="py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-slate-900">
                            {new Date(log.logDate).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            {log.shiftType || 'GENERAL'}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">
                            {log.staffMember?.fullName || 'Staff Member'}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] font-mono text-slate-400">
                              {log.staffMember?.staffNumber}
                            </span>
                            {isSuperAdmin && log.projectName && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                🏢 {log.projectName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-800">
                            {Number(log.hoursWorked || 8).toFixed(1)} hrs
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-md">
                          <p className="text-slate-700 font-sans leading-relaxed break-words">
                            {log.tasksCompleted}
                          </p>
                        </td>
                        <td className="py-3 px-4 max-w-xs text-slate-500 italic">
                          {log.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Logs Pagination Toolbar */}
              {filteredLogs.length > 0 && (
                <div className="py-2.5 px-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-3">
                    <div>
                      Showing <span className="font-semibold text-slate-700">{logsStartItem}</span> to{' '}
                      <span className="font-semibold text-slate-700">{logsEndItem}</span> of{' '}
                      <span className="font-semibold text-slate-700">{filteredLogs.length}</span> entries
                    </div>

                    <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                      <span className="text-slate-500">Rows per page:</span>
                      <select
                        value={logsPageSize}
                        onChange={(e) => {
                          setLogsPageSize(Number(e.target.value));
                          setLogsCurrentPage(1);
                        }}
                        className="px-2 py-0.5 rounded border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
                      >
                        {[10, 25, 50, 100].map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {logsTotalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setLogsCurrentPage(1)}
                        disabled={logsActivePage <= 1}
                        className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium cursor-pointer"
                        title="First Page"
                      >
                        «
                      </button>
                      <button
                        onClick={() => setLogsCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={logsActivePage <= 1}
                        className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium cursor-pointer"
                      >
                        Previous
                      </button>
                      <span className="px-2 text-slate-600 font-medium">
                        Page {logsActivePage} of {logsTotalPages}
                      </span>
                      <button
                        onClick={() => setLogsCurrentPage((p) => Math.min(logsTotalPages, p + 1))}
                        disabled={logsActivePage >= logsTotalPages}
                        className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium cursor-pointer"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setLogsCurrentPage(logsTotalPages)}
                        disabled={logsActivePage >= logsTotalPages}
                        className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium cursor-pointer"
                        title="Last Page"
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: ADD / EDIT STAFF MEMBER */}
      <Modal
        isOpen={isAddStaffOpen || !!editingStaff}
        onClose={() => {
          setIsAddStaffOpen(false);
          setEditingStaff(null);
          resetStaffForm();
        }}
        title={editingStaff ? `Edit Staff Member (${editingStaff.staffNumber})` : 'Register New Staff Member'}
        description="Add employee details to enable shift assignments and daily work activity submissions."
        maxWidth="md"
      >
        <form onSubmit={handleSaveStaff} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {formError}
            </div>
          )}

          {isSuperAdmin && !editingStaff && !propProjectId && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Project Organization <span className="text-rose-500">*</span>
              </label>
              <select
                value={modalProjectId}
                onChange={(e) => setModalProjectId(e.target.value)}
                required
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">-- Select Project Organization --</option>
                {projects.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Assign this workforce profile to a project facility
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Staff Number / Badge ID <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. EMP-101"
                value={staffNumber}
                onChange={(e) => setStaffNumber(e.target.value)}
                required
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Unique within your project organization</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. Sarah Jenkins"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Job Title / Role</label>
              <Input
                type="text"
                placeholder="e.g. Assay Technician"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone / Email</label>
              <Input
                type="text"
                placeholder="e.g. +1 (555) 234-5678"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
          </div>

          {editingStaff && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Employment Status</label>
              <Select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as any)}
                options={[
                  { value: 'ACTIVE', label: 'Active - Authorized to work' },
                  { value: 'DISABLED', label: 'Disabled - Inactive / Suspended' },
                ]}
              />
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsAddStaffOpen(false);
                setEditingStaff(null);
                resetStaffForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createStaffMutation.isPending || updateStaffMutation.isPending}
            >
              {createStaffMutation.isPending || updateStaffMutation.isPending
                ? 'Saving...'
                : editingStaff
                ? 'Update Profile'
                : 'Register Staff'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: SUBMIT DAILY WORK LOG */}
      <Modal
        isOpen={!!loggingWorkStaff}
        onClose={() => {
          setLoggingWorkStaff(null);
          resetLogForm();
        }}
        title={`Submit Daily Work - ${loggingWorkStaff?.fullName || ''} (${loggingWorkStaff?.staffNumber || ''})`}
        description="Log tasks completed, shift designation, and total hours worked for today."
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitWorkLog} className="space-y-4">
          {logFormError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {logFormError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Date <span className="text-rose-500">*</span>
              </label>
              <Input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Shift</label>
              <Select
                value={shiftType}
                onChange={(e) => setShiftType(e.target.value)}
                options={[
                  { value: 'MORNING', label: 'Morning Shift' },
                  { value: 'AFTERNOON', label: 'Afternoon / Evening Shift' },
                  { value: 'NIGHT', label: 'Night Shift' },
                  { value: 'GENERAL', label: 'General Full Day' },
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hours Worked</label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tasks &amp; Activities Completed <span className="text-rose-500">*</span>
            </label>
            <Textarea
              rows={4}
              placeholder="e.g. Calibrated and cleaned reagent station #2; assembled 15 units of Rapid Antigen Diagnostic Kits; completed the quality check..."
              value={tasksCompleted}
              onChange={(e) => setTasksCompleted(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Supervisor Notes / Remarks</label>
            <Input
              type="text"
              placeholder="Optional notes, handovers, or incident comments"
              value={workNotes}
              onChange={(e) => setWorkNotes(e.target.value)}
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoggingWorkStaff(null);
                resetLogForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createWorkLogMutation.isPending}
            >
              {createWorkLogMutation.isPending ? 'Submitting...' : 'Save Work Log'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: WORK LOG HISTORY DRAWER */}
      <Modal
        isOpen={!!viewingHistoryStaff}
        onClose={() => setViewingHistoryStaff(null)}
        title={`Work Activity History: ${viewingHistoryStaff?.fullName || ''}`}
        description={`Badge: ${viewingHistoryStaff?.staffNumber || ''} | Role: ${viewingHistoryStaff?.roleTitle || 'Associate'}`}
        maxWidth="xl"
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {isHistoryLoading ? (
            <div className="py-8 text-center text-slate-400">Loading history...</div>
          ) : staffHistoryLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              No historical work logs recorded for this staff member yet.
            </div>
          ) : (
            <div className="space-y-3">
              {staffHistoryLogs.map((log) => (
                <div key={log.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {new Date(log.logDate).toLocaleDateString(undefined, {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white border border-slate-200">
                        {log.shiftType || 'GENERAL'}
                      </span>
                    </div>
                    <span className="font-bold text-slate-700">{Number(log.hoursWorked || 8).toFixed(1)} hrs</span>
                  </div>
                  <p className="text-slate-800 leading-relaxed font-sans mt-1">{log.tasksCompleted}</p>
                  {log.notes && (
                    <p className="text-[11px] text-slate-500 mt-1 italic border-t border-slate-200/50 pt-1">
                      Note: {log.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <Button variant="secondary" onClick={() => setViewingHistoryStaff(null)}>
            Close
          </Button>
        </div>
      </Modal>

      {/* MODAL 4: DELETE CONFIRMATION */}
      <Modal
        isOpen={!!deletingStaff}
        onClose={() => setDeletingStaff(null)}
        title="Confirm Staff Removal"
        description="Are you sure you want to remove this staff member?"
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs text-slate-600">
          <p>
            You are about to delete <strong>{deletingStaff?.fullName}</strong> ({deletingStaff?.staffNumber}).
            This will permanently remove their profile and all associated daily work logs.
          </p>
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">
            ⚠️ This action cannot be undone.
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeletingStaff(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteStaffMutation.isPending}
              onClick={() => {
                if (deletingStaff) deleteStaffMutation.mutate(deletingStaff.id);
              }}
            >
              {deleteStaffMutation.isPending ? 'Deleting...' : 'Delete Staff Member'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
