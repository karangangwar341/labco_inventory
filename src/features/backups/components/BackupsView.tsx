'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { backupsService } from '../backups.service';
import { BackupRecord, BackupStatusSummary } from '../backups.types';
import { queryKeys } from '../../../lib/query/query-keys';
import { invalidation } from '../../../lib/query/invalidation';

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function BackupsView() {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isDownloadingJson, setIsDownloadingJson] = useState(false);
  const [downloadingRowId, setDownloadingRowId] = useState<string | null>(null);

  const {
    data: backups = [],
    isLoading: isBackupsLoading,
    error: backupsError,
    refetch: refetchBackups,
  } = useQuery({
    queryKey: queryKeys.backups.list(),
    queryFn: async () => {
      const data = await backupsService.getBackups();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: summary = null,
    isLoading: isSummaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: queryKeys.backups.summary(),
    queryFn: () => backupsService.getBackupStatusSummary(),
    staleTime: 2 * 60 * 1000,
  });

  const isLoading = isBackupsLoading || isSummaryLoading;
  const currentError = errorMsg || (backupsError instanceof Error ? backupsError.message : summaryError instanceof Error ? summaryError.message : null);

  const triggerMutation = useMutation({
    mutationFn: (triggerType: string) => backupsService.triggerBackup(triggerType),
    onSuccess: () => {
      setActionSuccess('Manual backup snapshot initiated successfully.');
      invalidation.afterBackupTrigger(queryClient);
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to initiate backup');
    },
  });

  const handleTriggerBackup = () => {
    setErrorMsg(null);
    triggerMutation.mutate('MANUAL_PRE_MIGRATION');
  };

  const handleDownloadAllReportsZip = async () => {
    setErrorMsg(null);
    setIsDownloadingZip(true);
    try {
      const blob = await backupsService.downloadAllReportsZip();
      const dateStr = new Date().toISOString().slice(0, 10);
      triggerBrowserDownload(blob, `labco_complete_backup_${dateStr}.zip`);
      setActionSuccess('Complete system ZIP archive (Excel reports + database dump) downloaded successfully.');
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to download ZIP backup archive.');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleDownloadDatabaseJson = async () => {
    setErrorMsg(null);
    setIsDownloadingJson(true);
    try {
      const blob = await backupsService.downloadDatabaseJson();
      const dateStr = new Date().toISOString().slice(0, 10);
      triggerBrowserDownload(blob, `labco_database_dump_${dateStr}.json`);
      setActionSuccess('Complete database JSON dump downloaded successfully.');
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to download database dump.');
    } finally {
      setIsDownloadingJson(false);
    }
  };

  const handleDownloadRowBackup = async (backupId: string) => {
    setErrorMsg(null);
    setDownloadingRowId(backupId);
    try {
      const blob = await backupsService.downloadBackupById(backupId);
      const shortId = backupId.slice(0, 8);
      const dateStr = new Date().toISOString().slice(0, 10);
      triggerBrowserDownload(blob, `backup_${shortId}_${dateStr}.zip`);
      setActionSuccess(`Backup snapshot ${shortId} downloaded successfully.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to download backup snapshot.');
    } finally {
      setDownloadingRowId(null);
    }
  };

  const handleRetry = () => {
    setErrorMsg(null);
    refetchBackups();
    refetchSummary();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Database Backups & Exports"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={handleDownloadAllReportsZip}
              isLoading={isDownloadingZip}
              className="shadow-xs font-semibold"
            >
              Download All Reports & DB (ZIP)
            </Button>

            <Button
              variant="secondary"
              onClick={handleDownloadDatabaseJson}
              isLoading={isDownloadingJson}
            >
              Download Database (JSON)
            </Button>

            <Button
              variant="secondary"
              onClick={handleTriggerBackup}
              isLoading={triggerMutation.isPending}
            >
              + Trigger Snapshot
            </Button>
          </div>
        }
      />



      {actionSuccess && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-[#18794e] text-xs flex items-center justify-between">
          <span className="font-medium">✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-[#18794e]">✕</button>
        </div>
      )}

      {currentError && (
        <ErrorState message={currentError} onRetry={handleRetry} />
      )}

      {/* SLA & Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-xs space-y-1">
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

        <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-xs space-y-1">
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

        <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-xs space-y-1">
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
          description="Initiate a manual backup or download the full system ZIP package above."
          action={
            <Button variant="primary" onClick={handleTriggerBackup} isLoading={triggerMutation.isPending}>
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
              <TableHead className="text-right">Action</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {backups.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs font-semibold text-[#172033]">
                  {(b as any).name || (b as any).snapshotName || 'Backup'}
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
                <TableCell className="text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-xs font-semibold"
                    disabled={b.status !== 'COMPLETED' || downloadingRowId === b.id}
                    isLoading={downloadingRowId === b.id}
                    onClick={() => handleDownloadRowBackup(b.id)}
                  >
                    Download (ZIP)
                  </Button>
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
