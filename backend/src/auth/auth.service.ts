import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { User, UserStatus, LoginOutcome } from '@prisma/client';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUserCredentials(
    rawUsername: string,
    pass: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<User> {
    const normalizedUsername = rawUsername.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (!user) {
      await this.recordLoginEvent(normalizedUsername, null, LoginOutcome.INVALID_CREDENTIALS, ipAddress, userAgent);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.DISABLED) {
      await this.recordLoginEvent(normalizedUsername, user.id, LoginOutcome.ACCOUNT_DISABLED, ipAddress, userAgent);
      throw new ForbiddenException('Account has been disabled. Please contact Super Admin.');
    }

    const now = new Date();
    if (user.lockoutUntil && user.lockoutUntil > now) {
      await this.recordLoginEvent(normalizedUsername, user.id, LoginOutcome.LOCKED_OUT, ipAddress, userAgent);
      const remainingMinutes = Math.ceil((user.lockoutUntil.getTime() - now.getTime()) / (1000 * 60));
      throw new HttpException(
        {
          statusCode: HttpStatus.LOCKED,
          message: `Account is temporarily locked due to repeated failed logins. Try again in ${remainingMinutes} minute(s).`,
          error: 'Locked',
          code: 'ACCOUNT_LOCKED',
        },
        HttpStatus.LOCKED,
      );
    }

    const isPasswordValid = await bcrypt.compare(pass, user.passwordHash);

    if (!isPasswordValid) {
      const updatedAttempts = user.failedLoginAttempts + 1;
      let lockoutUntil: Date | null = null;
      let newLockoutCount = user.lockoutCount;

      if (updatedAttempts >= 5) {
        // 5 consecutive failed logins -> 15-minute lockout
        lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
        newLockoutCount += 1;

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: updatedAttempts,
            lockoutUntil,
            lockoutCount: newLockoutCount,
          },
        });

        await this.recordLoginEvent(normalizedUsername, user.id, LoginOutcome.LOCKED_OUT, ipAddress, userAgent);

        throw new HttpException(
          {
            statusCode: HttpStatus.LOCKED,
            message: 'Account locked for 15 minutes after 5 consecutive failed login attempts.',
            error: 'Locked',
            code: 'ACCOUNT_LOCKED',
          },
          HttpStatus.LOCKED,
        );
      } else {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: updatedAttempts },
        });

        await this.recordLoginEvent(normalizedUsername, user.id, LoginOutcome.INVALID_CREDENTIALS, ipAddress, userAgent);

        throw new UnauthorizedException('Invalid credentials');
      }
    }

    // Password is valid - reset consecutive failures
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });

    await this.recordLoginEvent(normalizedUsername, user.id, LoginOutcome.SUCCESS, ipAddress, userAgent);

    return user;
  }

  async login(user: User): Promise<AuthResponseDto> {
    const now = new Date();

    // Invariant: Single active session per account. Invalidate prior active sessions.
    await this.prisma.session.updateMany({
      where: {
        userId: user.id,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: now,
      },
    });

    // Generate new session token and secure hash
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');

    // 7-day session lifetime ceiling
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        isRevoked: false,
        lastActivityAt: now,
        expiresAt,
      },
    });

    // Access token lifetime: 15 minutes (900 seconds)
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      sessionId: session.id,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
      },
    };
  }

  async validateSession(userId: string, sessionId: string): Promise<User | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.userId !== userId || session.isRevoked) {
      return null;
    }

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // Check 7-day inactivity timeout
    if (now - session.lastActivityAt.getTime() > sevenDaysMs || now > session.expiresAt.getTime()) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      return null;
    }

    if (session.user.status === UserStatus.DISABLED) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      return null;
    }

    // Refresh last activity timestamp
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });

    return session.user;
  }

  async logout(userId: string, sessionId: string): Promise<{ success: boolean; message: string }> {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Session revoked successfully',
    };
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
  }

  private async recordLoginEvent(
    usernameAttempted: string,
    userId: string | null,
    outcome: LoginOutcome,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await this.prisma.loginEvent.create({
        data: {
          usernameAttempted,
          userId,
          outcome,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });
    } catch {
      // Do not block auth flow if non-critical audit log write fails in dev
    }
  }
}
