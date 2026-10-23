'use client';

import React from 'react';
import { useAuth } from '@/features/auth/auth.store';
import { LoadingState } from '@/components/feedback/LoadingState';
import { SuperAdminDashboard } from '@/features/dashboard/components/SuperAdminDashboard';
import { StoreAdminDashboard } from '@/features/dashboard/components/StoreAdminDashboard';
import { ProjectAdminDashboard } from '@/features/dashboard/components/ProjectAdminDashboard';

export default function DashboardPage() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return <LoadingState message="Connecting to backend and loading role workspace..." />;
  }

  if (user.role === 'SUPER_ADMIN') {
    return <SuperAdminDashboard />;
  }

  if (user.role === 'PROJECT_ADMIN') {
    return <ProjectAdminDashboard />;
  }

  // Default to Store Admin operational dashboard for warehouse personnel
  return <StoreAdminDashboard />;
}
