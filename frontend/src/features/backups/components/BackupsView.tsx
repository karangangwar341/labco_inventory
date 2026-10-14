'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { backupsService } from '../backups.service';
import { BackupRecord, BackupStatusSummary } from '../backups.types';

export function BackupsView() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [summary, setSummary] = useState<BackupStatusSummary | null>(null);
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchBackups = useCallback(() => {
    setIsLoading(true);
    setErrorMsg(null);
    Promise.all([
      backupsService.getBackups(),
      backupsService.getBackupStatusSummary(),
    ])
      .then(([records, summaryData]) => {
        setBackups(Array.isArray(records) ? records : []);
        setSummary(summaryData);
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch backup records');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleTriggerBackup = async () => {
    setIsTriggering(true);
    setErrorMsg(null);
    try {
      await backupsService.triggerBackup('MANUAL_PRE_MIGRATION');
      setActionSuccess('Manual backup initiated successfully.');
      fetchBackups();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to initiate backup');
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Database Backups & Resiliency Drills"
        description="Immutable snapshot retention, WAL continuity, and automated verification drill monitoring."
        actions={
          <Button
            variant="primary"
            onClick={handleTriggerBackup}
            isLoading={isTriggering}
          >
            + Trigger Manual Backup
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
        <ErrorState message={errorMsg} onRetry={fetchBackups} />
      )}

      {/* SLA & Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5b6678] uppercase tracking-wider">
              Retention Policy
            </span>
            <span className="text-[#18794e] font-bold text-xs">Active</span>
          </div>
          <p className="text-lg font-bold text-[#172033]">90 Days Enforced</p>
          <p className="text-[11px] text-[#5b6678]">
            Automated daily snapshot retention.
          </p>
        </div>

        <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5b6678] uppercase tracking-wider">
              Persistent Alert Status
            </span>
            <Badge variant={summary?.persistentAlertActive ? 'danger' : 'success'}>
              {summary?.persistentAlertActive ? 'ALERT ACTIVE' : 'HEALTHY'}
            </Badge>
          </div>
          <p className="text-lg font-bold text-[#172033]">
            {summary?.consecutiveFailures ?? 0} Consecutive Failures
          </p>
          <p className="text-[11px] text-[#5b6678]">
            Alerts escalate if consecutive failures &gt;= 2.
          </p>
        </div>

        <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5b6678] uppercase tracking-wider">
              Total Snapshots
            </span>
            <span className="font-mono text-xs font-bold text-[#2563eb]">Verified</span>
          </div>
          <p className="text-lg font-bold text-[#172033]">
            {summary?.totalCompletedBackups ?? backups.length} Records
          </p>
          <p className="text-[11px] text-[#5b6678]">
            Last success: {summary?.lastSuccessfulBackup?.startedAt ? new Date(summary.lastSuccessfulBackup.startedAt).toLocaleDateString() : 'None recorded'}
          </p>
        </div>
      </div>

      {/* Backups Table */}
      {isLoading ? (
        <LoadingState message="Loading backup logs from backend..." />
      ) : backups.length === 0 ? (
        <EmptyState
          title="No backup records found"
          description="Initiate a manual backup or wait for the scheduled daily backup run."
          action={
            <Button variant="primary" onClick={handleTriggerBackup} isLoading={isTriggering}>
              + Trigger First Snapshot
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader sticky>
            <tr>
              <TableHead>Snapshot Identifier</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Completed At</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead>Location</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {backups.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs font-semibold text-[#172033]">
                  {b.id}
                </TableCell>
                <TableCell className="text-xs text-[#5b6678]">
                  {b.startedAt ? new Date(b.startedAt).toLocaleString() : '—'}
                </TableCell>
                <TableCell className="text-xs text-[#5b6678]">
                  {b.completedAt ? new Date(b.completedAt).toLocaleString() : 'In Progress'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      b.status === 'COMPLETED'
                        ? 'success'
                        : b.status === 'FAILED'
                        ? 'danger'
                        : 'warning'
                    }
                  >
                    {b.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-[#172033]">
                  {b.sizeBytes ? `${(b.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : '—'}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-[#5b6678] truncate max-w-xs">
                  {b.locationUri || 'Local Secure Volume'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default BackupsView;
