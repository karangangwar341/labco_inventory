import { NextResponse } from 'next/server';
import { container } from '../container';
import { UserRole } from '@prisma/client';
import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthenticatedUser } from './decorators/current-user.decorator';

export type { AuthenticatedUser };

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export function getClientUserAgent(req: Request): string {
  return req.headers.get('user-agent') || 'Unknown User-Agent';
}

export function getDeviceId(req: Request): string | undefined {
  return (
    req.headers.get('x-device-id') ||
    req.headers.get('X-Device-Id') ||
    undefined
  );
}

export async function authenticateUser(req: Request): Promise<AuthenticatedUser> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(new RegExp('(^| )session_token=([^;]+)'));
    if (match) {
      token = match[2];
    }
  }

  if (!token) {
    throw new UnauthorizedException('Authentication required');
  }
  let payload: any;
  try {
    payload = container.jwtService.verify(token, {
      secret: process.env.JWT_SECRET || 'super_secret_jwt_signing_key_change_in_production',
    });
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }

  const deviceId = getDeviceId(req) || payload.deviceId;
  const userAgent = getClientUserAgent(req);
  const ipAddress = getClientIp(req);

  const user = await container.authService.validateSession(payload.sub, payload.sessionId, {
    deviceId,
    userAgent,
    ipAddress,
  });

  if (!user) {
    throw new UnauthorizedException(
      'Session expired, revoked, replaced by another login, or used on an unauthorized device',
    );
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    sessionId: payload.sessionId,
    warehouseId: user.warehouseId ?? payload.warehouseId ?? null,
    projectId: user.projectId ?? payload.projectId ?? null,
  };
}

export function requireRoles(user: AuthenticatedUser, allowedRoles: UserRole[]): void {
  if (!user || !user.role) {
    throw new ForbiddenException('Access denied: user role is missing');
  }
  if (!allowedRoles.includes(user.role as UserRole)) {
    throw new ForbiddenException(
      `Access denied: required role ${allowedRoles.join(' or ')}`,
    );
  }
}

export async function validateDto<T extends object>(
  cls: new () => T,
  body: any,
): Promise<T> {
  const instance = plainToInstance(cls, body || {});
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    const messages = errors.flatMap((e) =>
      e.constraints ? Object.values(e.constraints) : [`Validation failed for ${e.property}`],
    );
    throw new BadRequestException(messages);
  }
  return instance;
}

export function handleApiError(error: any) {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const res = error.getResponse();
    const body = typeof res === 'object' ? res : { statusCode: status, message: res };
    return NextResponse.json(body, { status });
  }

  console.error('[Unhandled Next.js API Error]:', error);
  return NextResponse.json(
    {
      statusCode: 500,
      message: error?.message || 'Internal server error',
      error: 'Internal Server Error',
    },
    { status: 500 },
  );
}
