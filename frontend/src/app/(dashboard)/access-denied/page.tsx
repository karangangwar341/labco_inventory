'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/features/auth/auth.store';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function AccessDeniedPage() {
  const { user, role, logout } = useAuth();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Security & Access Clearance"
        description="Role-based access control (RBAC) policy enforcement for Labco Instruments Operations."
      />

      <Card className="border-amber-200/90 bg-gradient-to-br from-amber-50/50 via-white to-white shadow-2xs">
        <CardContent className="p-6 sm:p-10 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-100/80 border border-amber-300 text-amber-800 mx-auto flex items-center justify-center text-3xl shadow-xs">
            🛡️
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">
              <span>HTTP 403</span>
              <span>·</span>
              <span>INSUFFICIENT CLEARANCE</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Access to this operational area is restricted
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              Your account does not possess the required RBAC role permissions to inspect or execute actions in this administrative module.
            </p>
          </div>

          {/* Current Identity Card */}
          <div className="max-w-md mx-auto p-4 rounded-xl bg-white border border-slate-200 shadow-2xs text-left text-xs space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Active Account:</span>
              <span className="font-semibold text-slate-900">{user?.username || 'Authenticated Operator'}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Assigned Role:</span>
              <Badge variant="primary" size="sm">
                {role || user?.role || 'STAFF'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Project Scope:</span>
              <span className="font-medium text-slate-700">{user?.projectId ? `Project ID: ${user.projectId}` : 'Global Labco Organization'}</span>
            </div>
          </div>

          {/* Recovery Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
            <Link href="/" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full sm:w-auto min-h-[42px] px-6 text-xs sm:text-sm font-semibold justify-center">
                Return to Permitted Workspace
              </Button>
            </Link>
            <Link href="/help" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full sm:w-auto min-h-[42px] px-5 text-xs sm:text-sm font-semibold justify-center">
                View Role Permission Matrix
              </Button>
            </Link>
            <Button
              variant="quiet"
              onClick={() => logout()}
              className="w-full sm:w-auto min-h-[42px] text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50"
            >
              Sign Out / Switch User
            </Button>
          </div>

          {/* Governance Notice */}
          <div className="pt-6 border-t border-slate-200/80 text-[11px] text-slate-500 max-w-lg mx-auto">
            <p>
              Under Labco security invariants, multi-tenant isolation and administrative approvals are strictly enforced at the database and API gateway tiers. Contact your Super Admin to request elevated operational clearance.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
