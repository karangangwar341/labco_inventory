import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/errors';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Reuse read data across page visits; mutations explicitly invalidate affected domains.
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        // Do not spam backend on window/tab focus
        refetchOnWindowFocus: false,
        // Bounded retry policy: only retry transient network/5xx errors, never 4xx project/auth errors
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            // Authentication, authorization, and validation failures should never retry automatically
            if ([400, 401, 403, 404, 409, 422].includes(error.status)) {
              return false;
            }
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
