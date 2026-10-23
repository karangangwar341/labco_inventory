import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

describe('RolesGuard (RBAC)', () => {
  let rolesGuard: RolesGuard;
  let mockReflector: any;

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: vi.fn(),
    };
    rolesGuard = new RolesGuard(mockReflector);
  });

  const createMockContext = (user: any) => ({
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue({ user }),
    }),
  });

  it('allows access if no roles are required', () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext({ role: UserRole.PROJECT_ADMIN });

    expect(rolesGuard.canActivate(context as any)).toBe(true);
  });

  it('allows access if user has required role', () => {
    mockReflector.getAllAndOverride.mockReturnValue([UserRole.SUPER_ADMIN]);
    const context = createMockContext({ role: UserRole.SUPER_ADMIN });

    expect(rolesGuard.canActivate(context as any)).toBe(true);
  });

  it('throws ForbiddenException if user lacks required role', () => {
    mockReflector.getAllAndOverride.mockReturnValue([UserRole.SUPER_ADMIN]);
    const context = createMockContext({ role: UserRole.STORE_ADMIN });

    expect(() => rolesGuard.canActivate(context as any)).toThrow(ForbiddenException);
  });
});
