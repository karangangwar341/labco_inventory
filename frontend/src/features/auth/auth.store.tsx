'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserSessionProfile, LoginCredentials } from './auth.types';
import { authService } from './auth.service';
import { getSessionToken, clearSessionToken } from '../../lib/auth/session';
import { clearPersistedCache } from '../../lib/query/persistence';
import { UserRole } from '../../types/api';
import { queryKeys } from '../../lib/query/query-keys';
import type { AppBootstrap } from '../../types/api';

interface AuthContextType {
  user: UserSessionProfile | null;
  role?: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionReplaced: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  dismissSessionReplaced: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getInitialUser(): UserSessionProfile | null {
  if (typeof window === 'undefined') return null;
  const token = getSessionToken();
  if (!token) return null;
  try {
    const raw = localStorage.getItem('user_session');
    if (raw) return JSON.parse(raw) as UserSessionProfile;
  } catch {
    return null;
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserSessionProfile | null>(getInitialUser);
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const token = getSessionToken();
    if (!token) return false;
    // If token exists and we already have cached session profile, don't stall the UI
    const cached = getInitialUser();
    return !cached;
  });
  const [sessionReplaced, setSessionReplaced] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const token = getSessionToken();

    if (token) {
      // Revalidate in background against GET /me as authoritative truth
      authService
        .getBootstrap()
        .then((bootstrap) => {
          if (!isMounted) return;
          const profile = bootstrap?.user;
          if (profile && profile.id) {
            setUser(profile);
            queryClient.setQueryData<AppBootstrap>(queryKeys.session.bootstrap(profile.id), bootstrap);
            try {
              localStorage.setItem('user_session', JSON.stringify(profile));
            } catch {
              // Ignore storage quotas
            }
          } else {
            // Token was invalid or expired
            clearSessionToken();
            clearPersistedCache();
            setUser(null);
          }
        })
        .catch(() => {
          if (!isMounted) return;
          clearSessionToken();
          clearPersistedCache();
          setUser(null);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    } else {
      Promise.resolve().then(() => {
        if (isMounted) setIsLoading(false);
      });
    }

    const handleUnauthorized = (e: Event) => {
      const customEvent = e as CustomEvent<{ isReplaced: boolean; message?: string }>;
      if (customEvent.detail?.isReplaced) {
        setSessionReplaced(true);
      }
      clearSessionToken();
      clearPersistedCache();
      setUser(null);
    };

    window.addEventListener('session_unauthorized', handleUnauthorized);
    return () => {
      isMounted = false;
      window.removeEventListener('session_unauthorized', handleUnauthorized);
    };
  }, [queryClient]);

  const login = async (credentials: LoginCredentials) => {
    const res = await authService.login(credentials);
    if (res.user) {
      // A new login can belong to another account in the same browser.
      queryClient.clear();
      clearPersistedCache();
      // Backend returned authoritative user summary
      const profile: UserSessionProfile = {
        id: res.user.id,
        username: res.user.username,
        role: res.user.role,
        status: res.user.status,
        clientId: res.user.clientId,
        assignedWarehouseIds: res.user.assignedWarehouseIds,
      };
      setUser(profile);
      if (res.bootstrap) {
        queryClient.setQueryData<AppBootstrap>(queryKeys.session.bootstrap(profile.id), res.bootstrap);
      }
      try {
        localStorage.setItem('user_session', JSON.stringify(profile));
      } catch {
        // Ignore
      }
    }
  };

  const logout = () => {
    setUser(null);
    clearSessionToken();
    clearPersistedCache();
    authService.logout();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('session_unauthorized', { detail: { isReplaced: false } }),
      );
    }
  };

  const dismissSessionReplaced = () => {
    setSessionReplaced(false);
    logout();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role,
        isAuthenticated: !!user,
        isLoading,
        sessionReplaced,
        login,
        logout,
        dismissSessionReplaced,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
