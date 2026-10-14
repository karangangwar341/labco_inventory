'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserSessionProfile, LoginCredentials } from './auth.types';
import { authService } from './auth.service';
import { getSessionToken, clearSessionToken } from '../../lib/auth/session';
import { UserRole } from '../../types/api';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSessionProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionReplaced, setSessionReplaced] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const token = getSessionToken();

    if (token) {
      // Direct backend validation against GET /me as authoritative truth
      authService
        .getCurrentSession()
        .then((profile) => {
          if (!isMounted) return;
          if (profile && profile.id) {
            setUser(profile);
          } else {
            // Token was invalid or expired
            clearSessionToken();
            setUser(null);
          }
        })
        .catch(() => {
          if (!isMounted) return;
          clearSessionToken();
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
      setUser(null);
    };

    window.addEventListener('session_unauthorized', handleUnauthorized);
    return () => {
      isMounted = false;
      window.removeEventListener('session_unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const res = await authService.login(credentials);
    if (res.user) {
      // Backend returned authoritative user summary
      setUser({
        id: res.user.id,
        username: res.user.username,
        role: res.user.role,
        status: res.user.status,
        clientId: res.user.clientId,
        assignedWarehouseIds: res.user.assignedWarehouseIds,
      });
    }
  };

  const logout = () => {
    setUser(null);
    authService.logout();
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
