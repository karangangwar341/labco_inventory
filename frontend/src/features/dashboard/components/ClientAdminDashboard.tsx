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
import { shipmentsService } from '@/features/shipments/shipments.service';
import { departmentsService } from '@/features/departments/departments.service';
import { manufacturingService } from '@/features/manufacturing/manufacturing.service';
import { inventoryService } from '@/features/inventory/inventory.service';
import { Shipment } from '@/features/shipments/shipments.types';
import { DepartmentIssue } from '@/features/departments/departments.types';
import { ProductionRun } from '@/features/manufacturing/manufacturing.types';
import { StockBalance } from '@/features/inventory/inventory.types';
import { useAuth } from '@/features/auth/auth.store';

export function ClientAdminDashboard() {
  const { user } = useAuth();
  const [inboundShipments, setInboundShipments] = useState<Shipment[]>([]);
  const [departmentIssues, setDepartmentIssues] = useState<DepartmentIssue[]>([]);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);
  const [facilityLowStock, setFacilityLowStock] = useState<StockBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClientData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [shipmentsRes, issuesRes, runsRes, balancesRes] = await Promise.all([
        shipmentsService.getShipments({ limit: 50 }).catch(() => []),
        departmentsService.getIssues({ clientId: user?.clientId ?? undefined }).catch(() => []),
        manufacturingService.getProductionRuns().catch(() => []),
        inventoryService.getBalances({ limit: 100 }).catch(() => []),
      ]);

      const allShipments = Array.isArray(shipmentsRes) ? shipmentsRes : [];
      const pendingInbound = allShipments.filter(
        (s) => s.status === 'IN_TRANSIT' || s.status === 'PENDING',
      );
      setInboundShipments(pendingInbound.slice(0, 5));

      const allIssues = Array.isArray(issuesRes) ? issuesRes : [];
      setDepartmentIssues(allIssues.slice(0, 5));

      const allRuns = Array.isArray(runsRes) ? runsRes : [];
      setProductionRuns(allRuns.slice(0, 5));

      const allBalances = Array.isArray(balancesRes) ? balancesRes : [];
      const low = allBalances.filter((b) => {
        const avail = Number(b.availableQty ?? 0);
        const thresh = Number(b.minThreshold ?? 0);
        return thresh > 0 && avail <= thresh;
      });
      setFacilityLowStock(low.slice(0, 5));
    } finally {
      setIsLoading(false);
    }
  }, [user?.clientId]);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  if (isLoading) {
    return <LoadingState message="Connecting to client facility operations, departments, and manufacturing..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Facility Dashboard"
        description="Patient testing continuity, internal department supply requisitions, formulation runs, and dock deliveries."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/requests/new">
              <Button variant="primary">+ Requisition Supplies</Button>
            </Link>
            <Link href="/departments">
              <Button variant="secondary">Departments</Button>
            </Link>
            <Link href="/manufacturing">
              <Button variant="secondary">Manufacturing</Button>
            </Link>
          </div>
        }
      />

      {/* Facility Privacy & Tenancy Notice */}
      <AlertNotice
        variant="info"
        title="Client Facility Tenant Scope Active"
        message="Patient diagnostic stock and formulation records are strictly isolated. Inbound supply origins are masked as [REDACTED] to preserve source warehouse privacy invariants."
      />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatWidget
          label="Inbound Supplies"
          value={inboundShipments.length}
          subtext="En route to facility dock"
          badge={{
            text: inboundShipments.length > 0 ? 'EN ROUTE' : 'NONE',
            variant: inboundShipments.length > 0 ? 'primary' : 'neutral',
          }}
          href="/shipments"
        />
        <StatWidget
          label="Dept Requisitions"
          value={departmentIssues.length}
          subtext="Internal issues requested"
          badge={{
            text: departmentIssues.length > 0 ? 'ACTIVE' : 'CLEAR',
            variant: departmentIssues.length > 0 ? 'warning' : 'neutral',
          }}
          href="/departments"
        />
        <StatWidget
          label="Formulation Runs"
          value={productionRuns.length}
          subtext="Active BOM batch assemblies"
          badge={{
            text: productionRuns.length > 0 ? 'RUNNING' : 'IDLE',
            variant: productionRuns.length > 0 ? 'primary' : 'neutral',
          }}
          href="/manufacturing"
        />
        <StatWidget
          label="Reagent Shortages"
          value={facilityLowStock.length}
          subtext="At or below buffer threshold"
          badge={{
            text: facilityLowStock.length > 0 ? 'ALERT' : 'OPTIMAL',
            variant: facilityLowStock.length > 0 ? 'danger' : 'success',
          }}
          href="/inventory"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inbound Supply Shipments (Source Redacted) */}
        <DashboardQueueCard
          title="Inbound Supply Shipments (Source Redacted)"
          description="Incoming supplies arriving at facility dock. Source warehouse identity is strictly masked"
          viewAllHref="/shipments"
          viewAllLabel="Receive Shipments →"
          isEmpty={inboundShipments.length === 0}
          emptyMessage="No incoming shipments currently en route to this facility."
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
                  Origin: <strong className="font-mono text-slate-500">[REDACTED]</strong> · Destination: {s.destinationName || 'Local Stock Room'}
                </p>
                <p className="text-[11px] text-[#5b6678]">
                  {s.lines?.length || 0} line items dispatched
                </p>
              </div>
              <Link href={`/shipments/${s.id}`}>
                <Button variant="primary" size="sm">
                  Verify &amp; Receive
                </Button>
              </Link>
            </div>
          ))}
        </DashboardQueueCard>

        {/* Internal Department Requisitions */}
        <DashboardQueueCard
          title="Internal Department Requisitions"
          description="Reagents and consumables issued to internal testing units (Hematology, Biochemistry, PCR)"
          viewAllHref="/departments"
          viewAllLabel="Manage Requisitions →"
          isEmpty={departmentIssues.length === 0}
          emptyMessage="No pending department requisitions."
        >
          {departmentIssues.map((issue) => (
            <div key={issue.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#172033] font-mono">{issue.issueNumber}</span>
                  <span className="text-[11px] font-medium text-[#172033]">
                    {issue.departmentName || 'Department'}
                  </span>
                </div>
                <p className="text-[11px] text-[#5b6678] mt-0.5">
                  {issue.items?.length || 0} items requested · Reason: {issue.reason || 'Routine testing'}
                </p>
              </div>
              <Badge
                variant={
                  issue.status === 'APPROVED'
                    ? 'success'
                    : issue.status === 'REJECTED'
                    ? 'danger'
                    : 'warning'
                }
              >
                {issue.status}
              </Badge>
            </div>
          ))}
        </DashboardQueueCard>

        {/* Active Formulation & Production Runs */}
        <DashboardQueueCard
          title="Active Formulation & Production Runs"
          description="BOM reagent assembly runs with yield targets and ingredient consumption"
          viewAllHref="/manufacturing"
          viewAllLabel="Open BOM Console →"
          action={
            <Link href="/manufacturing">
              <Button variant="secondary" size="sm">+ New Run</Button>
            </Link>
          }
          isEmpty={productionRuns.length === 0}
          emptyMessage="No active formulation or manufacturing runs in progress."
        >
          {productionRuns.map((run) => (
            <div key={run.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#172033] font-mono">{run.runNumber}</span>
                  <span className="text-[11px] font-medium text-[#172033]">
                    Yield SKU: {run.yieldProductId}
                  </span>
                </div>
                <p className="text-[11px] text-[#5b6678] mt-0.5">
                  Planned Target: {run.plannedQuantity} units · Actual: {run.actualQuantity ?? 'Pending'}
                </p>
              </div>
              <Badge
                variant={
                  run.status === 'COMPLETED'
                    ? 'success'
                    : run.status === 'APPROVED'
                    ? 'primary'
                    : run.status === 'PENDING_APPROVAL'
                    ? 'warning'
                    : 'neutral'
                }
              >
                {run.status}
              </Badge>
            </div>
          ))}
        </DashboardQueueCard>

        {/* Diagnostic Reagent Shortages */}
        <DashboardQueueCard
          title="Facility Reagent Shortages & Reorders"
          description="Diagnostic cartridges, reagents, and test kits low in local stock room"
          viewAllHref="/inventory"
          viewAllLabel="Facility Inventory →"
          action={
            <Link href="/requests/new">
              <Button variant="primary" size="sm">+ Requisition</Button>
            </Link>
          }
          isEmpty={facilityLowStock.length === 0}
          emptyMessage="✓ All diagnostic consumables and test kits are stocked above safety levels."
        >
          {facilityLowStock.map((item) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[#172033] truncate">{item.productName || item.productId}</p>
                <p className="text-[11px] text-[#5b6678] font-mono mt-0.5">
                  Available: {Number(item.availableQty)} | Safety Buffer: {item.minThreshold}
                </p>
              </div>
              <Badge variant="danger">LOW STOCK</Badge>
            </div>
          ))}
        </DashboardQueueCard>
      </div>
    </div>
  );
}

export default ClientAdminDashboard;
