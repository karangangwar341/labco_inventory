import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController, MeController } from './auth.controller';
import { UserRole, UserStatus } from '@prisma/client';

describe('AuthController & MeController', () => {
  let authController: AuthController;
  let meController: MeController;
  let mockAuthService: any;

  beforeEach(() => {
    mockAuthService = {
      validateUserCredentials: vi.fn(),
      login: vi.fn(),
      getBootstrap: vi.fn(),
      logout: vi.fn(),
    };

    authController = new AuthController(mockAuthService);
    meController = new MeController(mockAuthService);
  });

  describe('login', () => {
    it('authenticates and issues auth response', async () => {
      const mockUser = {
        id: 'u-1',
        username: 'admin',
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      };

      const expectedResponse = {
        accessToken: 'valid.token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: mockUser,
      };

      mockAuthService.validateUserCredentials.mockResolvedValue(mockUser);
      mockAuthService.login.mockResolvedValue(expectedResponse);

      const req: any = { ip: '127.0.0.1', headers: { 'user-agent': 'TestAgent' }, socket: {} };
      const result = await authController.login({ username: 'admin', password: 'Password123!@#' }, req);

      expect(mockAuthService.validateUserCredentials).toHaveBeenCalledWith(
        'admin',
        'Password123!@#',
        '127.0.0.1',
        'TestAgent',
      );
      expect(mockAuthService.login).toHaveBeenCalledWith(mockUser, {
        deviceId: undefined,
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent',
      });
      expect(mockAuthService.getBootstrap).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('logout', () => {
    it('calls authService.logout with user ID and session ID', async () => {
      mockAuthService.logout.mockResolvedValue({ success: true, message: 'Session revoked successfully' });

      const currentUser = {
        id: 'u-1',
        username: 'admin',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        sessionId: 'sess-1',
      };

      const result = await authController.logout(currentUser);

      expect(mockAuthService.logout).toHaveBeenCalledWith('u-1', 'sess-1');
      expect(result.success).toBe(true);
    });
  });

  describe('getProfile (/api/v1/me)', () => {
    it('returns sanitized authenticated user profile', () => {
      const currentUser = {
        id: 'u-1',
        username: 'admin',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        sessionId: 'sess-1',
      };

      const profile = meController.getProfile(currentUser);

      expect(profile).toEqual(currentUser);
    });
  });
});
