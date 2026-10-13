import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersService } from './users.service.js';
import { UserRole, UserStatus } from '@prisma/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('UsersService (T-003: Users Provisioning & Session Revocation)', () => {
  let usersService: UsersService;
  let mockPrisma: any;
  let mockAuthService: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
      },
      client: {
        findUnique: vi.fn(),
      },
    };

    mockAuthService = {
      revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
    };

    usersService = new UsersService(mockPrisma as any, mockAuthService as any);
  });

  describe('create', () => {
    it('creates Super Admin account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'u-1',
        username: 'superadmin',
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      });

      const res = await usersService.create({
        username: 'SuperAdmin',
        password: 'Password123456!',
        role: UserRole.SUPER_ADMIN,
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'superadmin' } });
      expect(res.username).toBe('superadmin');
    });

    it('requires warehouseId when creating STORE_ADMIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        usersService.create({
          username: 'store_mgr',
          password: 'Password123456!',
          role: UserRole.STORE_ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires clientId when creating CLIENT_ADMIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        usersService.create({
          username: 'client_mgr',
          password: 'Password123456!',
          role: UserRole.CLIENT_ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate username', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        usersService.create({
          username: 'existing_user',
          password: 'Password123456!',
          role: UserRole.SUPER_ADMIN,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('disable', () => {
    it('disables account and immediately revokes all active sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', status: UserStatus.ACTIVE });
      mockPrisma.user.update.mockResolvedValue({ id: 'u-1', status: UserStatus.DISABLED });

      const res = await usersService.disable('u-1');

      expect(res.status).toBe(UserStatus.DISABLED);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-1' },
          data: expect.objectContaining({ status: UserStatus.DISABLED }),
        }),
      );
      // Invariant: all sessions revoked
      expect(mockAuthService.revokeAllUserSessions).toHaveBeenCalledWith('u-1');
    });
  });

  describe('resetPassword', () => {
    it('updates password and immediately revokes all active sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u-1', status: UserStatus.ACTIVE });

      const res = await usersService.resetPassword('u-1', 'BrandNewPassword123!');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-1' },
          data: expect.objectContaining({
            failedLoginAttempts: 0,
            lockoutUntil: null,
          }),
        }),
      );
      // Invariant: all sessions revoked on password reset
      expect(mockAuthService.revokeAllUserSessions).toHaveBeenCalledWith('u-1');
    });
  });
});
