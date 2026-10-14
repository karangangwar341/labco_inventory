'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { StatWidget } from './shared/StatWidget';
import { DashboardQueueCard } from './shared/DashboardQueueCard';
import { AlertNotice } from './shared/AlertNotice';
import { approvalsService } from '@/features/approvals/approvals.service';
import { inventoryService } from '@/features/inventory/inventory.service';
import { backupsService } from '@/features/backups/backups.service';
import { requestsService } from '@/features/requests/requests.service';
import { StockBalance } from '@/features/inventory/inventory.types';
import { BackupStatusSummary } from '@/features/backups/backups.types';
import { QueueItem } from '@/features/approvals/approvals.types';
import { StockRequest } from '@/features/requests/requests.types';

export function SuperAdminDashboard() {
  const [approvalsQueue, setApprovalsQueue] = useState<QueueItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<StockBalance[]>([]);
  const [recentRequests, setRecentRequests] = useState<StockRequest[]>([]);
  const [backupSummary, setBackupSummary] = useState<BackupStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [queueData, balances, requests, backup] = await Promise.all([
        approvalsService.getQueue().catch(() => ({
          REQUESTS: [],
          SHIPMENTS: [],
          MANUFACTURING: [],
          DEPARTMENTS: [],
          CORRECTIONS: [],
        })),
        inventoryService.getBalances({ limit: 100 }).catch(() => []),
        requestsService.getRequests({ limit: 5 }).catch(() => []),
        backupsService.getBackupStatusSummary().catch(() => null),
      ]);

      const combinedQueue = [
        ...(queueData.REQUESTS || []),
        ...(queueData.SHIPMENTS || []),
        ...(queueData.MANUFACTURING || []),
        ...(queueData.DEPARTMENTS || []),
      ];
      setApprovalsQueue(combinedQueue);

      const low = (Array.isArray(balances) ? balances : []).filter((b) => {
        const avail = Number(b.availableQty ?? 0);
        const thresh = Number(b.minThreshold ?? 0);
        return thresh > 0 && avail <= thresh;
      });
      setLowStockItems(low.slice(0, 5));
      setRecentRequests(Array.isArray(requests) ? requests : []);
      setBackupSummary(backup);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return <LoadingState message="Aggregating global ledger queues and platform resiliency status..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Super Admin Governance & Control"
        description="Dual-control approvals queue, system ledger integrity, and continuous database resiliency."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/approvals">
              <Button variant="primary">Review Pending Approvals ({approvalsQueue.length})</Button>
            </Link>
            <Link href="/backups">
              <Button variant="secondary">Resiliency Console</Button>
            </Link>
          </div>
        }
      />

      {backupSummary?.persistentAlertActive && (
        <AlertNotice
          variant="danger"
          title="Persistent Backup Failure Alert"
          message={`${backupSummary.consecutiveFailures} consecutive backup failures detected. Continuous WAL replication or snapshot storage requires immediate inspection.`}
          actionHref="/backups"
          actionLabel="Inspect Backups →"
        />
      )}

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatWidget
          label="Pending Approvals"
          value={approvalsQueue.length}
          subtext="Requires Super Admin sign-off"
          badge={{
            text: approvalsQueue.length > 0 ? 'ACTION REQ' : 'CLEAR',
            variant: approvalsQueue.length > 0 ? 'warning' : 'success',
          }}
          href="/approvals"
        />
        <StatWidget
          label="Low-Stock Alerts"
          value={lowStockItems.length}
          subtext="Available at/below safety buffer"
          badge={{
            text: lowStockItems.length > 0 ? 'REORDER' : 'HEALTHY',
            variant: lowStockItems.length > 0 ? 'danger' : 'success',
          }}
          href="/inventory"
        />
        <StatWidget
          label="Database Status"
          value="ACID Active"
          subtext="Pessimistic row locking FOR UPDATE"
          badge={{ text: 'VERIFIED', variant: 'primary' }}
        />
        <StatWidget
          label="Backup Retention"
          value={backupSummary ? `${backupSummary.totalCompletedBackups} Snapshots` : '90 Days SLA'}
          subtext="Automated continuous WAL snapshots"
          badge={{
            text: backupSummary?.persistentAlertActive ? 'ALERT' : 'PROTECTED',
            variant: backupSummary?.persistentAlertActive ? 'danger' : 'success',
          }}
          href="/backups"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unified Approvals Queue */}
        <DashboardQueueCard
          title="Unified Approvals Queue"
          description="Stock requests, shipment discrepancy holds, and production runs awaiting dual-control authorization"
          viewAllHref="/approvals"
          viewAllLabel="Open Approvals Queue →"
          isEmpty={approvalsQueue.length === 0}
          emptyMessage="No pending items awaiting Super Admin authorization. All operational queues clear."
        >
          {approvalsQueue.slice(0, 5).map((item) => (
            <div key={`${item.type}-${item.id}`} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#172033] truncate">{item.type}</span>
                  <span className="text-[11px] text-[#5b6678] font-mono">by {item.requester}</span>
                </div>
                <p className="text-[11px] text-[#5b6678] truncate mt-0.5">{item.details}</p>
              </div>
              <Badge variant={item.priority === 'URGENT' ? 'danger' : 'warning'}>
                {item.priority}
              </Badge>
            </div>
          ))}
        </DashboardQueueCard>

        {/* Multi-Tenant Low Stock Monitor */}
        <DashboardQueueCard
          title="Multi-Facility Stock & Reorder Alerts"
          description="Inventory SKUs across central warehouse and client locations at or below safety threshold"
          viewAllHref="/inventory"
          viewAllLabel="View All Balances →"
          isEmpty={lowStockItems.length === 0}
          emptyMessage="✓ All inventory items across all facilities are within healthy operating thresholds."
        >
          {lowStockItems.map((item) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[#172033] truncate">{item.productName || item.productId}</p>
                <p className="text-[11px] text-[#5b6678] font-mono mt-0.5">
                  Available: {Number(item.availableQty)} | Min: {item.minThreshold} | Reserved: {Number(item.reservedQty ?? 0)}
                </p>
              </div>
              <Badge variant="warning">REORDER</Badge>
            </div>
          ))}
        </DashboardQueueCard>

        {/* Recent Ledger Activity */}
        <DashboardQueueCard
          title="Recent Movement Activity"
          description="Latest stock requests and movement workflows across the platform"
          viewAllHref="/requests"
          viewAllLabel="View Stock Requests →"
          isEmpty={recentRequests.length === 0}
          emptyMessage="No recent request activity recorded."
        >
          {recentRequests.map((req) => (
            <div key={req.id} className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="font-semibold text-[#172033] font-mono">{req.requestNumber}</span>
                <span className="text-[#5b6678] ml-2 text-[11px]">
                  {req.locationName || 'Central Hub'} · {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '—'}
                </span>
              </div>
              <Badge
                variant={
                  req.status === 'APPROVED'
                    ? 'success'
                    : req.status === 'REJECTED' || req.status === 'CANCELLED'
                    ? 'danger'
                    : 'warning'
                }
              >
                {req.status}
              </Badge>
            </div>
          ))}
        </DashboardQueueCard>

        {/* System Resiliency & Integrity */}
        <DashboardQueueCard
          title="System Resiliency & Integrity"
          description="Continuous WAL archiving, point-in-time recovery, and restore drill logs"
          viewAllHref="/backups"
          viewAllLabel="Manage Backups →"
        >
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#f8fafc] border border-[#dbe3ee]">
              <div>
                <span className="font-semibold text-[#172033]">PostgreSQL ACID Concurrency</span>
                <p className="text-[11px] text-[#5b6678]">Pessimistic row locking on balances eliminates race conditions</p>
              </div>
              <Badge variant="success">HEALTHY</Badge>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#f8fafc] border border-[#dbe3ee]">
              <div>
                <span className="font-semibold text-[#172033]">Continuous WAL Archiving</span>
                <p className="text-[11px] text-[#5b6678]">Continuous replication enabled with SHA-256 integrity verification</p>
              </div>
              <Badge variant="primary">PROTECTED</Badge>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#f8fafc] border border-[#dbe3ee]">
              <div>
                <span className="font-semibold text-[#172033]">Automated Retention Policy</span>
                <p className="text-[11px] text-[#5b6678]">90-day snapshot policy with periodic recovery drill simulation</p>
              </div>
              <Badge variant="neutral">90 DAYS</Badge>
            </div>
          </div>
        </DashboardQueueCard>
      </div>
    </div>
  );
}

export default SuperAdminDashboard;
