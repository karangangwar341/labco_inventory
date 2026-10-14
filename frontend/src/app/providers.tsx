'use client';

import React from 'react';
import { AuthProvider } from '../features/auth/auth.store';
import { SessionReplacedModal } from '../features/auth/components/SessionReplacedModal';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <SessionReplacedModal />
    </AuthProvider>
  );
}
