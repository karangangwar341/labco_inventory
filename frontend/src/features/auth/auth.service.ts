import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { setSessionToken, clearSessionToken } from '../../lib/auth/session';
import { AuthResponseDto, AppBootstrap, CurrentUserProfile } from '../../types/api';
import { LoginCredentials } from './auth.types';

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthResponseDto> => {
    const res = await apiClient.post<AuthResponseDto>(
      endpoints.auth.login(),
      credentials,
      { skipAuth: true },
    );

    if (res.accessToken) {
      setSessionToken(res.accessToken);
    }
    return res;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post(endpoints.auth.logout());
    } catch {
      // Backend session revocation attempted; proceeding with project state wipe
    } finally {
      clearSessionToken();
      if (typeof window !== 'undefined') {
        window.location.assign('/login');
      }
    }
  },

  getCurrentSession: async (): Promise<CurrentUserProfile | null> => {
    try {
      return await apiClient.get<CurrentUserProfile>(endpoints.auth.me());
    } catch {
      return null;
    }
  },

  getBootstrap: async (): Promise<AppBootstrap> =>
    apiClient.get<AppBootstrap>(endpoints.auth.bootstrap()),
};
