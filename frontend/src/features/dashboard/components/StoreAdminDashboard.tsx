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
import { requestsService } from '@/features/requests/requests.service';
import { inventoryService } from '@/features/inventory/inventory.service';
import { shipmentsService } from '@/features/shipments/shipments.service';
import { StockRequest } from '@/features/requests/requests.types';
import { StockBalance } from '@/features/inventory/inventory.types';
import { Shipment } from '@/features/shipments/shipments.types';
import { useAuth } from '@/features/auth/auth.store';

export function StoreAdminDashboard() {
  const { user } = useAuth();
  const [approvedRequests, setApprovedRequests] = useState<StockRequest[]>([]);
  const [inboundShipments, setInboundShipments] = useState<Shipment[]>([]);
  const [warehouseLowStock, setWarehouseLowStock] = useState<StockBalance[]>([]);
  const [recentMovements, setRecentMovements] = useState<StockRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStoreData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [requestsRes, shipmentsRes, balancesRes] = await Promise.all([
        requestsService.getRequests({ limit: 50 }).catch(() => []),
        shipmentsService.getShipments({ limit: 50 }).catch(() => []),
        inventoryService.getBalances({ limit: 100 }).catch(() => []),
      ]);

      const allRequests = Array.isArray(requestsRes) ? requestsRes : [];
      // Requests approved by Super Admin that need dispatch
      const approved = allRequests.filter((r) => r.status === 'APPROVED');
      setApprovedRequests(approved.slice(0, 5));
      setRecentMovements(allRequests.slice(0, 5));

      const allShipments = Array.isArray(shipmentsRes) ? shipmentsRes : [];
      // Inbound shipments arriving or pending receipt
      const pendingReceipt = allShipments.filter(
        (s) => s.status === 'IN_TRANSIT' || s.status === 'PENDING',
      );
      setInboundShipments(pendingReceipt.slice(0, 5));

      const allBalances = Array.isArray(balancesRes) ? balancesRes : [];
      const low = allBalances.filter((b) => {
        const avail = Number(b.availableQty ?? 0);
        const thresh = Number(b.minThreshold ?? 0);
        return thresh > 0 && avail <= thresh;
      });
      setWarehouseLowStock(low.slice(0, 5));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStoreData();
  }, [fetchStoreData]);

  if (isLoading) {
    return <LoadingState message="Connecting to warehouse inventory and shipment queues..." />;
  }

  const assignedLocationText = user?.assignedWarehouseIds?.length
    ? `Assigned Warehouse Nodes: ${user.assignedWarehouseIds.join(', ')}`
    : 'Assigned Facility: Central Warehouse Hub (loc-wh-1)';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Operations Dashboard"
        description="Physical inventory custody, picking/dispatch for approved requests, and dock inbound receiving."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/requests/new">
              <Button variant="primary">+ New Stock Request</Button>
            </Link>
            <Link href="/shipments">
              <Button variant="secondary">Dock Shipments</Button>
            </Link>
          </div>
        }
      />

      {/* Warehouse Facility Scope Banner */}
      <AlertNotice
        variant="info"
        title="Warehouse Custody Active"
        message={`${assignedLocationText}. Operational scope is restricted to assigned physical stock nodes. Inventory mutations post to the immutable ledger upon dual-control authorization.`}
      />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatWidget
          label="Approved to Dispatch"
          value={approvedRequests.length}
          subtext="Ready for pick & pack"
          badge={{
            text: approvedRequests.length > 0 ? 'READY' : 'CLEAR',
            variant: approvedRequests.length > 0 ? 'primary' : 'neutral',
          }}
          href="/shipments"
        />
        <StatWidget
          label="Inbound to Receive"
          value={inboundShipments.length}
          subtext="Arrived / In Transit to dock"
          badge={{
            text: inboundShipments.length > 0 ? 'PENDING' : 'CLEAR',
            variant: inboundShipments.length > 0 ? 'warning' : 'neutral',
          }}
          href="/shipments"
        />
        <StatWidget
          label="Warehouse Low Stock"
          value={warehouseLowStock.length}
          subtext="At or below safety threshold"
          badge={{
            text: warehouseLowStock.length > 0 ? 'REORDER' : 'HEALTHY',
            variant: warehouseLowStock.length > 0 ? 'danger' : 'success',
          }}
          href="/inventory"
        />
        <StatWidget
          label="Fulfillment Status"
          value="Operational"
          subtext="Dock active for inbound/outbound"
          badge={{ text: 'ONLINE', variant: 'success' }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approved Outbound Requests to Fulfill */}
        <DashboardQueueCard
          title="Approved Requests Ready to Dispatch"
          description="Stock requests approved by Super Admin awaiting physical picking, packing, and dispatch"
          viewAllHref="/shipments"
          viewAllLabel="Fulfill via Shipments →"
          isEmpty={approvedRequests.length === 0}
          emptyMessage="No approved requests waiting for dispatch. All outbound orders fulfilled."
        >
          {approvedRequests.map((r) => (
            <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#172033] font-mono">{r.requestNumber}</span>
                  <span className="text-[11px] text-[#5b6678] truncate">
                    Destination: {r.destinationName || 'Client Facility'}
                  </span>
                </div>
                <p className="text-[11px] text-[#5b6678] mt-0.5">
                  {r.lines?.length || 0} line items · Notes: {r.notes || 'Restock'}
                </p>
              </div>
              <Link href={`/requests/${r.id}`}>
                <Button variant="primary" size="sm">
                  Dispatch →
                </Button>
              </Link>
            </div>
          ))}
        </DashboardQueueCard>

        {/* Inbound Shipments Pending Receipt */}
        <DashboardQueueCard
          title="Inbound Shipments Awaiting Dock Receipt"
          description="Incoming vendor supplies and stock transfers arriving at the warehouse dock"
          viewAllHref="/shipments"
          viewAllLabel="Open Shipments →"
          isEmpty={inboundShipments.length === 0}
          emptyMessage="No incoming shipments currently in transit to this warehouse."
        >
          {inboundShipments.map((s) => (
            <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#172033] font-mono">{s.shipmentNumber}</span>
                  <Badge variant={s.status === 'IN_TRANSIT' ? 'warning' : 'neutral'}>
                    {s.status}
                  </Badge>
                </div>
                <p className="text-[11px] text-[#5b6678] mt-0.5">
                  Destination: {s.destinationName || 'Central WH'} · {s.lines?.length || 0} lines
                </p>
              </div>
              <Link href={`/shipments/${s.id}`}>
                <Button variant="secondary" size="sm">
                  Receive
                </Button>
              </Link>
            </div>
          ))}
        </DashboardQueueCard>

        {/* Warehouse Safety Stock & Reorders */}
        <DashboardQueueCard
          title="Warehouse Safety Stock & Reorder Alerts"
          description="Warehouse inventory items at or below minimum operating safety stock"
          viewAllHref="/inventory"
          viewAllLabel="View Inventory →"
          action={
            <Link href="/requests/new">
              <Button variant="primary" size="sm">+ Reorder</Button>
            </Link>
          }
          isEmpty={warehouseLowStock.length === 0}
          emptyMessage="✓ All warehouse stock levels are healthy."
        >
          {warehouseLowStock.map((item) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[#172033] truncate">{item.productName || item.productId}</p>
                <p className="text-[11px] text-[#5b6678] font-mono mt-0.5">
                  Available: {Number(item.availableQty)} | Safety Min: {item.minThreshold}
                </p>
              </div>
              <Badge variant="danger">REORDER</Badge>
            </div>
          ))}
        </DashboardQueueCard>

        {/* Recent Warehouse Movements */}
        <DashboardQueueCard
          title="Recent Warehouse Stock Movements"
          description="Latest inbound and outbound transfer requests recorded for this location"
          viewAllHref="/requests"
          viewAllLabel="View All Movements →"
          isEmpty={recentMovements.length === 0}
          emptyMessage="No recent movements recorded."
        >
          {recentMovements.map((req) => (
            <div key={req.id} className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="font-semibold text-[#172033] font-mono">{req.requestNumber}</span>
                <span className="text-[#5b6678] ml-2 text-[11px]">
                  {req.type || 'STOCK_TRANSFER'} · {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '—'}
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
      </div>
    </div>
  );
}

export default StoreAdminDashboard;
