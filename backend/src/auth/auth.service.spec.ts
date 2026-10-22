import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { UserStatus, UserRole, LoginOutcome } from '@prisma/client';
import { UnauthorizedException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService (T-002: Authentication, Lockout & Sessions)', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockJwtService: any;

  const mockUser = {
    id: 'user-uuid-1',
    username: 'warehouse_admin',
    passwordHash: '',
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    failedLoginAttempts: 0,
    lockoutUntil: null,
    lockoutCount: 0,
    disabledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Generate valid bcrypt hash for "SecurePass123!@"
    mockUser.passwordHash = await bcrypt.hash('SecurePass123!@', 10);
    mockUser.failedLoginAttempts = 0;
    mockUser.lockoutUntil = null;
    mockUser.status = UserStatus.ACTIVE;

    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      session: {
        updateMany: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      loginEvent: {
        create: vi.fn(),
      },
      product: { findMany: vi.fn().mockResolvedValue([]) },
      category: { findMany: vi.fn().mockResolvedValue([]) },
      stockLocation: { findMany: vi.fn().mockResolvedValue([]) },
    };

    mockJwtService = {
      sign: vi.fn().mockReturnValue('mocked.jwt.token'),
    };

    authService = new AuthService(mockPrisma as any, mockJwtService as any);
  });

  describe('getBootstrap', () => {
    it('only includes approved company raw materials for Store Admins', async () => {
      await authService.getBootstrap({
        id: 'store-admin-1', username: 'store-admin', role: UserRole.STORE_ADMIN,
        status: UserStatus.ACTIVE, warehouseId: 'warehouse-1',
      });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { ownerScope: 'COMPANY', kind: 'RAW_MATERIAL', status: 'APPROVED' },
        take: 250,
      }));
    });

    it('loads bounded role-scoped startup references in parallel and omits other warehouse identities for projects', async () => {
      mockPrisma.stockLocation.findMany.mockResolvedValue([{
        id: 'location-project', locationType: 'PROJECT', warehouseId: null, projectId: 'project-1',
        warehouse: null, project: { name: 'Project One' },
      }]);

      const result = await authService.getBootstrap({
        id: 'project-admin-1', username: 'project-admin', role: UserRole.PROJECT_ADMIN,
        status: UserStatus.ACTIVE, projectId: 'project-1', warehouseId: null,
      });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ OR: expect.arrayContaining([
          { ownerScope: 'PROJECT', projectId: 'project-1' },
        ]) }),
        take: 250,
      }));
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { OR: [
          { ownerScope: 'COMPANY' },
          { ownerScope: 'PROJECT', projectId: 'project-1' },
        ] },
        take: 250,
      }));
      expect(result.locations).toEqual([{ id: 'location-project', name: 'Project One', locationType: 'PROJECT', warehouseId: null, projectId: 'project-1' }]);
      expect(result.products).toEqual([]);
      expect(result.categories).toEqual([]);
    });
  });

  describe('validateUserCredentials', () => {
    it('authenticates valid credentials and resets failed attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 2,
      });
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.validateUserCredentials('warehouse_admin', 'SecurePass123!@');

      expect(result.id).toBe(mockUser.id);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { failedLoginAttempts: 0, lockoutUntil: null },
      });
      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ outcome: LoginOutcome.SUCCESS }),
      });
    });

    it('rejects nonexistent user with generic invalid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.validateUserCredentials('nonexistent', 'SecurePass123!@'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ outcome: LoginOutcome.INVALID_CREDENTIALS }),
      });
    });

    it('rejects disabled account with 403 Forbidden', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: UserStatus.DISABLED,
      });

      await expect(
        authService.validateUserCredentials('warehouse_admin', 'SecurePass123!@'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ outcome: LoginOutcome.ACCOUNT_DISABLED }),
      });
    });

    it('increments failedLoginAttempts on invalid password (attempts 1 to 4)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 2,
      });

      await expect(
        authService.validateUserCredentials('warehouse_admin', 'WrongPassword123!'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { failedLoginAttempts: 3 },
      });
    });

    it('locks account for 15 minutes upon reaching 5 consecutive failed logins', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 4,
        lockoutCount: 0,
      });

      try {
        await authService.validateUserCredentials('warehouse_admin', 'WrongPassword123!');
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.LOCKED); // 423
      }

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining({
          failedLoginAttempts: 5,
          lockoutCount: 1,
          lockoutUntil: expect.any(Date),
        }),
      });

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ outcome: LoginOutcome.LOCKED_OUT }),
      });
    });

    it('blocks login attempt while lockout is active', async () => {
      const futureLockout = new Date(Date.now() + 10 * 60 * 1000); // 10 mins remaining
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        lockoutUntil: futureLockout,
      });

      try {
        await authService.validateUserCredentials('warehouse_admin', 'SecurePass123!@');
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.LOCKED);
      }
    });
  });

  describe('login (Single Active Session Policy & Device Binding)', () => {
    it('revokes prior active sessions and binds session to device and user-agent when a new login occurs', async () => {
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.session.create.mockResolvedValue({
        id: 'new-session-uuid',
        userId: mockUser.id,
        tokenHash: 'hashed_token',
        deviceId: 'device-xyz-123',
        userAgentHash: 'hashed_ua',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const response = await authService.login(mockUser as any, {
        deviceId: 'device-xyz-123',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ipAddress: '127.0.0.1',
      });

      // Verify prior active sessions were invalidated
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          isRevoked: false,
        },
        data: expect.objectContaining({
          isRevoked: true,
          revokedAt: expect.any(Date),
        }),
      });

      // Verify session creation stored device and userAgent
      expect(mockPrisma.session.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          deviceId: 'device-xyz-123',
          ipAddress: '127.0.0.1',
          userId: mockUser.id,
        }),
      }));

      expect(response.accessToken).toBe('mocked.jwt.token');
      expect(response.expiresIn).toBe(2592000); // 30 days
      expect(response.user.username).toBe(mockUser.username);
    });
  });

  describe('validateSession (Device Binding, Inactivity & Revocation)', () => {
    it('returns user and refreshes lastActivityAt for valid active session on authorized device', async () => {
      const activeSession = {
        id: 'session-uuid',
        userId: mockUser.id,
        deviceId: 'device-123',
        userAgentHash: null,
        isRevoked: false,
        lastActivityAt: new Date(Date.now() - 10 * 60 * 1000),
        expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        user: mockUser,
      };

      mockPrisma.session.findUnique.mockResolvedValue(activeSession);
      mockPrisma.session.update.mockResolvedValue(activeSession);

      const user = await authService.validateSession(mockUser.id, 'session-uuid', {
        deviceId: 'device-123',
      });

      expect(user).not.toBeNull();
      expect(user?.id).toBe(mockUser.id);
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-uuid' },
        data: { lastActivityAt: expect.any(Date) },
      });
    });

    it('rejects and revokes session if accessed from a different device (copied token)', async () => {
      const activeSession = {
        id: 'session-uuid',
        userId: mockUser.id,
        deviceId: 'original-device-123',
        userAgentHash: null,
        isRevoked: false,
        lastActivityAt: new Date(Date.now() - 10 * 60 * 1000),
        expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        user: mockUser,
      };

      mockPrisma.session.findUnique.mockResolvedValue(activeSession);
      mockPrisma.session.update.mockResolvedValue({ ...activeSession, isRevoked: true });

      const user = await authService.validateSession(mockUser.id, 'session-uuid', {
        deviceId: 'unauthorized-copied-device-999',
      });

      expect(user).toBeNull();
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-uuid' },
        data: expect.objectContaining({
          isRevoked: true,
          revokedAt: expect.any(Date),
        }),
      });
    });

    it('rejects and revokes session if inactive for more than 30 days', async () => {
      const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const expiredSession = {
        id: 'old-session-uuid',
        userId: mockUser.id,
        deviceId: null,
        userAgentHash: null,
        isRevoked: false,
        lastActivityAt: thirtyFiveDaysAgo,
        expiresAt: new Date(Date.now() + 1000),
        user: mockUser,
      };

      mockPrisma.session.findUnique.mockResolvedValue(expiredSession);

      const user = await authService.validateSession(mockUser.id, 'old-session-uuid');

      expect(user).toBeNull();
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: 'old-session-uuid' },
        data: expect.objectContaining({
          isRevoked: true,
          revokedAt: expect.any(Date),
        }),
      });
    });

    it('rejects already revoked session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'revoked-session',
        userId: mockUser.id,
        deviceId: null,
        userAgentHash: null,
        isRevoked: true,
        user: mockUser,
      });

      const user = await authService.validateSession(mockUser.id, 'revoked-session');
      expect(user).toBeNull();
    });
  });

  describe('logout', () => {
    it('marks session as revoked', async () => {
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

      const res = await authService.logout(mockUser.id, 'session-123');

      expect(res.success).toBe(true);
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-123',
          userId: mockUser.id,
          isRevoked: false,
        },
        data: expect.objectContaining({
          isRevoked: true,
          revokedAt: expect.any(Date),
        }),
      });
    });
  });
});
