import { UserRole, UserStatus } from './common';

export interface LoginDto {
  username: string;
  password: string;
}

export interface UserSummaryDto {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  clientId?: string | null;
  assignedWarehouseIds?: string[];
}

export interface AuthResponseDto {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserSummaryDto;
}

export interface CurrentUserProfile {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  sessionId?: string;
  clientId?: string | null;
  assignedWarehouseIds?: string[];
}
