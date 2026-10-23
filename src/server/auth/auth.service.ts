import {
  Injectable,
  Optional,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserStatus, LoginOutcome, UserRole, ProductStatus, ProductKind, CatalogScope, OrganizationStatus, LocationType } from '@prisma/client';
import { AuthResponseDto } from './dto/auth-response.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  // Reuse concurrent validation work, but never cache a successful result across requests:
  // revocation and account disablement must take effect on the next authenticated request.
  private inFlightSessionValidations = new Map<string, Promise<User | null>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Optional() private readonly configService?: ConfigService,
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

  async login(
    user: User,
    clientContext?: { deviceId?: string; userAgent?: string; ipAddress?: string },
  ): Promise<AuthResponseDto> {
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

    // Configurable session lifetime ceiling (defaults to 30 days)
    const sessionDays = parseInt(this.configService?.get<string>('SESSION_LIFETIME_DAYS') || '30', 10);
    const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

    const userAgentHash = clientContext?.userAgent
      ? crypto.createHash('sha256').update(clientContext.userAgent).digest('hex')
      : null;

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        deviceId: clientContext?.deviceId || null,
        userAgentHash,
        ipAddress: clientContext?.ipAddress || null,
        isRevoked: false,
        lastActivityAt: now,
        expiresAt,
      },
    });

    const jwtExpiration = this.configService?.get<string>('JWT_EXPIRATION') || '30d';
    const expiresInSeconds = this.parseExpirationToSeconds(jwtExpiration);

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      sessionId: session.id,
      deviceId: clientContext?.deviceId || null,
      warehouseId: user.warehouseId ?? null,
      projectId: user.projectId ?? null,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: jwtExpiration as any });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: expiresInSeconds,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        warehouseId: user.warehouseId ?? null,
        projectId: user.projectId ?? null,
      },
    };
  }

  private parseExpirationToSeconds(exp: string): number {
    const match = exp.match(/^(\d+)([smhd])$/);
    if (!match) return 30 * 86400;
    const val = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's': return val;
      case 'm': return val * 60;
      case 'h': return val * 3600;
      case 'd': return val * 86400;
      default: return 30 * 86400;
    }
  }

  /** Small, role-scoped reference set used to render the first workspace screen. */
  async getBootstrap(user: { id: string; username: string; role: string; status: string; projectId?: string | null; warehouseId?: string | null }) {
    const role = user.role as UserRole;
    const productScope = role === UserRole.SUPER_ADMIN
      ? { status: ProductStatus.APPROVED }
      : role === UserRole.STORE_ADMIN
        ? {
            ownerScope: CatalogScope.COMPANY,
            kind: ProductKind.RAW_MATERIAL,
            status: ProductStatus.APPROVED,
            balances: {
              some: {
                location: {
                  warehouseId: user.warehouseId ?? '__unassigned__',
                },
              },
            },
          }
        : {
            status: ProductStatus.APPROVED,
            OR: [
              { ownerScope: CatalogScope.COMPANY },
              { ownerScope: CatalogScope.PROJECT, projectId: user.projectId ?? '__unassigned__' },
            ],
          };

    const categoryScope = role === UserRole.PROJECT_ADMIN
      ? {
          OR: [
            { ownerScope: CatalogScope.COMPANY },
            { ownerScope: CatalogScope.PROJECT, projectId: user.projectId ?? '__unassigned__' },
          ],
        }
      : { ownerScope: CatalogScope.COMPANY };

    const locationQuery = role === UserRole.SUPER_ADMIN
      ? this.prisma.stockLocation.findMany({
          where: { OR: [{ warehouse: { status: OrganizationStatus.ACTIVE } }, { project: { status: OrganizationStatus.ACTIVE } }] },
          select: { id: true, locationType: true, warehouseId: true, projectId: true, warehouse: { select: { name: true } }, project: { select: { name: true } } },
          orderBy: { createdAt: 'asc' }, take: 100,
        })
      : role === UserRole.STORE_ADMIN
        ? this.prisma.stockLocation.findMany({
            where: {
              OR: [
                { warehouseId: user.warehouseId ?? '__unassigned__', warehouse: { status: OrganizationStatus.ACTIVE } },
                { locationType: LocationType.PROJECT, project: { status: OrganizationStatus.ACTIVE } },
              ],
            },
            select: { id: true, locationType: true, warehouseId: true, projectId: true, warehouse: { select: { name: true } }, project: { select: { name: true } } },
          })
        : this.prisma.stockLocation.findMany({
            where: { projectId: user.projectId ?? '__unassigned__', project: { status: OrganizationStatus.ACTIVE } },
            select: { id: true, locationType: true, warehouseId: true, projectId: true, warehouse: { select: { name: true } }, project: { select: { name: true } } },
          });

    const [products, categories, locations] = await Promise.all([
      this.prisma.product.findMany({
        where: productScope,
        select: {
          id: true, name: true, kind: true, categoryId: true, brand: true, description: true,
          ownerScope: true, projectId: true, status: true, quantityPrecision: true, allowFractional: true,
          minQuantity: true, minOrderQuantity: true, createdAt: true,
          category: { select: { id: true, name: true, parentId: true, ownerScope: true, projectId: true } },
          units: { where: { status: 'ACTIVE' }, select: { id: true, unitName: true, isBaseUnit: true, conversionToBase: true }, orderBy: { isBaseUnit: 'desc' } },
        },
        orderBy: { name: 'asc' }, take: 250,
      }),
      this.prisma.category.findMany({ where: categoryScope, select: { id: true, name: true, parentId: true, ownerScope: true, projectId: true }, orderBy: { name: 'asc' }, take: 250 }),
      locationQuery,
    ]);

    return {
      user: { id: user.id, username: user.username, role: user.role, status: user.status, projectId: user.projectId, warehouseId: user.warehouseId },
      products,
      categories,
      locations: locations.map((location) => ({
        id: location.id,
        name: location.warehouse?.name ?? location.project?.name ?? 'Stock location',
        locationType: location.locationType,
        warehouseId: user.role === UserRole.PROJECT_ADMIN ? null : location.warehouseId,
        projectId: user.role === UserRole.STORE_ADMIN ? null : location.projectId,
      })),
    };
  }

  async validateSession(
    userId: string,
    sessionId: string,
    clientContext?: { deviceId?: string; userAgent?: string; ipAddress?: string },
  ): Promise<User | null> {
    // In-flight promise sharing avoids duplicate DB reads for parallel requests while
    // preserving immediate cross-instance revocation checks on every new request.
    const cacheKey = `${sessionId}:${clientContext?.deviceId || ''}:${clientContext?.userAgent || ''}`;
    const inFlight = this.inFlightSessionValidations.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const validationPromise = this.doValidateSession(userId, sessionId, clientContext);
    this.inFlightSessionValidations.set(cacheKey, validationPromise);
    try {
      return await validationPromise;
    } finally {
      this.inFlightSessionValidations.delete(cacheKey);
    }
  }

  private async doValidateSession(
    userId: string,
    sessionId: string,
    clientContext?: { deviceId?: string; userAgent?: string; ipAddress?: string },
  ): Promise<User | null> {
    const now = Date.now();
    // Database errors intentionally propagate. Falling back to an old positive
    // session result would let revoked or disabled accounts continue using the API.
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.userId !== userId || session.isRevoked) {
      return null;
    }

    // 1. Device binding check:
    // If the session was registered with a device ID, any request must match that exact device ID.
    if (session.deviceId) {
      if (!clientContext?.deviceId || session.deviceId !== clientContext.deviceId) {
        // Device mismatch (stolen or copied token on a different device) - revoke immediately
        await this.prisma.session.update({
          where: { id: session.id },
          data: { isRevoked: true, revokedAt: new Date() },
        });
        return null;
      }
    }

    // 2. Browser / User-Agent binding check:
    // If the session was bound to a User-Agent hash, reject if copied to a different browser/project
    if (session.userAgentHash) {
      if (!clientContext?.userAgent) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { isRevoked: true, revokedAt: new Date() },
        });
        return null;
      }
      const incomingUaHash = crypto.createHash('sha256').update(clientContext.userAgent).digest('hex');
      if (session.userAgentHash !== incomingUaHash) {
        // User-agent mismatch (e.g. copied from Chrome to Firefox/Safari or curl/Postman)
        await this.prisma.session.update({
          where: { id: session.id },
          data: { isRevoked: true, revokedAt: new Date() },
        });
        return null;
      }
    }

    const inactivityDays = parseInt(this.configService?.get<string>('SESSION_INACTIVITY_DAYS') || '30', 10);
    const inactivityTimeoutMs = inactivityDays * 24 * 60 * 60 * 1000;

    // Check inactivity timeout and absolute expiration ceiling
    if (now - session.lastActivityAt.getTime() > inactivityTimeoutMs || now > session.expiresAt.getTime()) {
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

    // Throttle lastActivityAt updates: only write when > 5 minutes stale.
    // This avoids a DB write round-trip on every single API request.
    const ACTIVITY_UPDATE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    if (now - session.lastActivityAt.getTime() > ACTIVITY_UPDATE_THRESHOLD_MS) {
      // Fire-and-forget: don't block the request on this non-critical write
      this.prisma.session.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date() },
      }).catch(() => {
        // Non-critical; swallow errors silently
      });
    }

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
