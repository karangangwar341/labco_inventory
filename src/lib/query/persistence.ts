import { QueryClient, dehydrate, hydrate, DehydratedState } from '@tanstack/react-query';

const CACHE_STORAGE_KEY = 'LABCO_QUERY_CACHE_V1';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PersistedCacheEnvelope {
  version: number;
  timestamp: number;
  clientState: DehydratedState;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Restores query cache from localStorage into QueryClient during app initialization.
 */
export function restoreQueryCache(queryClient: QueryClient): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;

    const envelope: PersistedCacheEnvelope = JSON.parse(raw);
    const now = Date.now();

    // Invalidate if cache is older than maximum age or schema version changed
    if (envelope.version !== 1 || now - envelope.timestamp > CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(CACHE_STORAGE_KEY);
      return;
    }

    hydrate(queryClient, envelope.clientState);
  } catch (err) {
    // Graceful fallback on corrupted cache or storage quota restrictions
    console.warn('[CachePersistence] Failed to restore query cache from localStorage:', err);
    try {
      window.localStorage.removeItem(CACHE_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

/**
 * Subscribes to QueryClient query changes and debounces writing state to localStorage.
 */
export function attachQueryCachePersistence(queryClient: QueryClient): () => void {
  if (typeof window === 'undefined') return () => {};

  const saveCache = () => {
    try {
      // Only dehydrate successful queries (exclude errors and pending)
      // Only persist the authenticated user's small bootstrap payload. Page data can
      // include sensitive operational records and is kept in the in-memory cache.
      const dehydrated = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => query.queryKey[0] === 'session'
          && query.queryKey[1] === 'bootstrap'
          && query.state.status === 'success'
          && query.state.data !== undefined,
      });

      const envelope: PersistedCacheEnvelope = {
        version: 1,
        timestamp: Date.now(),
        clientState: dehydrated,
      };

      window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      // Ignore quota exceeded or storage disabled
    }
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    // Only persist on query success or update
    if (event.type === 'updated' && event.query.state.status === 'success') {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(saveCache, 600);
    }
  });

  return () => {
    unsubscribe();
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}

/**
 * Clears persisted query cache from localStorage (called on logout to ensure tenant privacy).
 */
export function clearPersistedCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CACHE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
