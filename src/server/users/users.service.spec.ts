import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersService } from './users.service';
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
        update: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
      },
    };

    mockAuthService = {
      revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
    };

    usersService = new UsersService(mockPrisma as any, mockAuthService as any);
  });

  describe('create', () => {
    it('creates Super Admin account with optional profile details', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'u-1',
        username: 'superadmin',
        fullName: 'Super Admin Person',
        phoneNumber: '+91 9876543210',
        address: '123 Main St',
        idImageUrl: 'data:image/png;base64,...',
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      });

      const res = await usersService.create({
        username: 'SuperAdmin',
        password: 'Password123456!',
        role: UserRole.SUPER_ADMIN,
        fullName: 'Super Admin Person',
        phoneNumber: '+91 9876543210',
        address: '123 Main St',
        idImageUrl: 'data:image/png;base64,...',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'superadmin' } });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          username: 'superadmin',
          fullName: 'Super Admin Person',
          phoneNumber: '+91 9876543210',
          address: '123 Main St',
          idImageUrl: 'data:image/png;base64,...',
        }),
        select: expect.any(Object),
      });
      expect(res.username).toBe('superadmin');
      expect(res.fullName).toBe('Super Admin Person');
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

    it('requires projectId when creating PROJECT_ADMIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        usersService.create({
          username: 'project_mgr',
          password: 'Password123456!',
          role: UserRole.PROJECT_ADMIN,
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

  describe('update', () => {
    it('updates editable user profile details', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', username: 'store_mgr' });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u-1',
        username: 'store_mgr',
        fullName: 'John Doe',
        phoneNumber: '+91 1234567890',
        address: 'Plot 42, Lucknow',
        idImageUrl: 'https://example.com/id.jpg',
      });

      const res = await usersService.update('u-1', {
        fullName: 'John Doe',
        phoneNumber: '+91 1234567890',
        address: 'Plot 42, Lucknow',
        idImageUrl: 'https://example.com/id.jpg',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: {
          fullName: 'John Doe',
          phoneNumber: '+91 1234567890',
          address: 'Plot 42, Lucknow',
          idImageUrl: 'https://example.com/id.jpg',
        },
        select: expect.any(Object),
      });
      expect(res.fullName).toBe('John Doe');
      expect(res.phoneNumber).toBe('+91 1234567890');
    });

    it('throws NotFoundException if user to update does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(usersService.update('non-existent', { fullName: 'Test' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('enable', () => {
    it('enables account and resets lockouts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', status: UserStatus.DISABLED });
      mockPrisma.user.update.mockResolvedValue({ id: 'u-1', status: UserStatus.ACTIVE, disabledAt: null });

      const res = await usersService.enable('u-1');

      expect(res.status).toBe(UserStatus.ACTIVE);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-1' },
          data: expect.objectContaining({
            status: UserStatus.ACTIVE,
            disabledAt: null,
            failedLoginAttempts: 0,
            lockoutUntil: null,
          }),
        }),
      );
    });

    it('throws NotFoundException if user to enable does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(usersService.enable('non-existent')).rejects.toThrow(NotFoundException);
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
