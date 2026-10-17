'use client';

import React, { useState, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../lib/query/query-client';
import {
  restoreQueryCache,
  attachQueryCachePersistence,
  clearPersistedCache,
} from '../lib/query/persistence';
import { AuthProvider } from '../features/auth/auth.store';
import { SessionReplacedModal } from '../features/auth/components/SessionReplacedModal';

export function Providers({ children }: { children: React.ReactNode }) {
  // Instantiate QueryClient once and restore dehydrated cache from localStorage immediately
  const [queryClient] = useState(() => {
    const client = createQueryClient();
    restoreQueryCache(client);
    return client;
  });

  useEffect(() => {
    // Attach background localStorage query synchronization
    const detachPersistence = attachQueryCachePersistence(queryClient);

    // Clear query cache and persisted local storage on session revocation
    const handleUnauthorized = () => {
      queryClient.clear();
      clearPersistedCache();
    };

    window.addEventListener('session_unauthorized', handleUnauthorized);
    return () => {
      detachPersistence();
      window.removeEventListener('session_unauthorized', handleUnauthorized);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <SessionReplacedModal />
      </AuthProvider>
    </QueryClientProvider>
  );
}
