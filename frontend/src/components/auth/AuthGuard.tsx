'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/features/auth/auth.store';
import { LoadingState } from '@/components/feedback/LoadingState';

const emptySubscribe = () => () => {};

function useIsHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHydrated = useIsHydrated();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isHydrated && !isLoading && (!isAuthenticated || !user)) {
      const fullPath = searchParams?.toString()
        ? `${pathname}?${searchParams.toString()}`
        : pathname;
      const redirectUrl = `/login?redirect=${encodeURIComponent(fullPath || '/')}`;
      router.replace(redirectUrl);
    }
  }, [isHydrated, isLoading, isAuthenticated, user, router, pathname, searchParams]);

  // While checking auth token against backend or hydrating project, render consistent placeholder
  if (!isHydrated || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="w-full max-w-sm p-8 bg-white border border-[#dbe3ee] rounded-xl shadow-xs text-center space-y-3">
          <div className="w-9 h-9 rounded-lg bg-[#2563eb] text-white font-bold flex items-center justify-center mx-auto text-sm">
            L
          </div>
          <LoadingState message="Verifying session credentials..." />
        </div>
      </div>
    );
  }

  // If unauthenticated, return null while router.replace executes
  if (!isAuthenticated || !user) {
    return null;
  }

  return <>{children}</>;
}

export default AuthGuard;
