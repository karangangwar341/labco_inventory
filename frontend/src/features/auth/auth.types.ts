import { CurrentUserProfile, LoginDto } from '../../types/api';

export type { CurrentUserProfile as UserSessionProfile };
export type { LoginDto as LoginCredentials };

export interface AuthState {
  user: CurrentUserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionReplaced: boolean;
}
