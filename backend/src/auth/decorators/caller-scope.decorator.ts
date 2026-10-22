import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface CallerScope {
  userId: string;
  role: UserRole;
  isGlobal: boolean;
  warehouseId?: string;
  projectId?: string;
}

export const Scope = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CallerScope => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('User scope cannot be resolved: authentication required');
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return {
        userId: user.id,
        role: user.role,
        isGlobal: true,
      };
    }

    if (user.role === UserRole.STORE_ADMIN) {
      return {
        userId: user.id,
        role: user.role,
        isGlobal: false,
        warehouseId: user.warehouseId,
      };
    }

    if (user.role === UserRole.PROJECT_ADMIN) {
      return {
        userId: user.id,
        role: user.role,
        isGlobal: false,
        projectId: user.projectId,
      };
    }

    throw new ForbiddenException('Unrecognized user role');
  },
);
