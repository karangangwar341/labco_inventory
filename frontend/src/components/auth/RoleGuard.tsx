'use client';

import React from 'react';
import { useAuth } from '@/features/auth/auth.store';
import { UserRole } from '@/types/api';
import { PermissionDenied } from '@/components/feedback/PermissionDenied';
import { LoadingState } from '@/components/feedback/LoadingState';

export function RoleGuard({
  allowedRoles,
  children,
  fallback,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState message="Verifying role authorizations..." />;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    if (fallback) return <>{fallback}</>;
    return (
      <PermissionDenied
        requiredRoles={allowedRoles}
        userRole={user?.role}
      />
    );
  }

  return <>{children}</>;
}

export default RoleGuard;
