import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { User, UserStatus, LoginOutcome, UserRole, ProductStatus, ProductKind, CatalogScope, OrganizationStatus } from '@prisma/client';
import { AuthResponseDto } from './dto/auth-response.dto.js';
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
      warehouseId: user.warehouseId ?? null,
      clientId: user.clientId ?? null,
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
        warehouseId: user.warehouseId ?? null,
        clientId: user.clientId ?? null,
      },
    };
  }

  /** Small, role-scoped reference set used to render the first workspace screen. */
  async getBootstrap(user: { id: string; username: string; role: string; status: string; clientId?: string | null; warehouseId?: string | null }) {
    const role = user.role as UserRole;
    const productScope = role === UserRole.SUPER_ADMIN
      ? { status: ProductStatus.APPROVED }
      : role === UserRole.STORE_ADMIN
        ? { ownerScope: CatalogScope.COMPANY, kind: ProductKind.RAW_MATERIAL, status: ProductStatus.APPROVED }
        : {
            status: ProductStatus.APPROVED,
            OR: [
              { ownerScope: CatalogScope.COMPANY },
              { ownerScope: CatalogScope.CLIENT, clientId: user.clientId ?? '__unassigned__' },
            ],
          };

    const categoryScope = role === UserRole.CLIENT_ADMIN
      ? {
          OR: [
            { ownerScope: CatalogScope.COMPANY },
            { ownerScope: CatalogScope.CLIENT, clientId: user.clientId ?? '__unassigned__' },
          ],
        }
      : { ownerScope: CatalogScope.COMPANY };

    const locationQuery = role === UserRole.SUPER_ADMIN
      ? this.prisma.stockLocation.findMany({
          where: { OR: [{ warehouse: { status: OrganizationStatus.ACTIVE } }, { client: { status: OrganizationStatus.ACTIVE } }] },
          select: { id: true, locationType: true, warehouseId: true, clientId: true, warehouse: { select: { name: true } }, client: { select: { name: true } } },
          orderBy: { createdAt: 'asc' }, take: 100,
        })
      : role === UserRole.STORE_ADMIN
        ? this.prisma.stockLocation.findMany({
            where: {
              OR: [
                { warehouseId: user.warehouseId ?? '__unassigned__', warehouse: { status: OrganizationStatus.ACTIVE } },
                { client: { status: OrganizationStatus.ACTIVE, warehouseAssignments: { some: { warehouseId: user.warehouseId ?? '__unassigned__', isActive: true } } } },
              ],
            },
            select: { id: true, locationType: true, warehouseId: true, clientId: true, warehouse: { select: { name: true } }, client: { select: { name: true } } },
          })
        : this.prisma.stockLocation.findMany({
            where: { clientId: user.clientId ?? '__unassigned__', client: { status: OrganizationStatus.ACTIVE } },
            select: { id: true, locationType: true, warehouseId: true, clientId: true, warehouse: { select: { name: true } }, client: { select: { name: true } } },
          });

    const [products, categories, locations] = await Promise.all([
      this.prisma.product.findMany({
        where: productScope,
        select: {
          id: true, name: true, kind: true, categoryId: true, brand: true, description: true,
          ownerScope: true, clientId: true, status: true, quantityPrecision: true, allowFractional: true,
          minQuantity: true, minOrderQuantity: true, trackingMode: true, createdAt: true,
          category: { select: { id: true, name: true, parentId: true, ownerScope: true, clientId: true } },
          units: { where: { status: 'ACTIVE' }, select: { id: true, unitName: true, isBaseUnit: true, conversionToBase: true }, orderBy: { isBaseUnit: 'desc' } },
        },
        orderBy: { name: 'asc' }, take: 250,
      }),
      this.prisma.category.findMany({ where: categoryScope, select: { id: true, name: true, parentId: true, ownerScope: true, clientId: true }, orderBy: { name: 'asc' }, take: 250 }),
      locationQuery,
    ]);

    return {
      user: { id: user.id, username: user.username, role: user.role, status: user.status, clientId: user.clientId, warehouseId: user.warehouseId },
      products,
      categories,
      locations: locations.map((location) => ({
        id: location.id,
        name: location.warehouse?.name ?? location.client?.name ?? 'Stock location',
        locationType: location.locationType,
        warehouseId: user.role === UserRole.CLIENT_ADMIN ? null : location.warehouseId,
        clientId: user.role === UserRole.STORE_ADMIN ? null : location.clientId,
      })),
    };
  }

  async validateSession(userId: string, sessionId: string): Promise<User | null> {
    // In-flight promise sharing avoids duplicate DB reads for parallel requests while
    // preserving immediate cross-instance revocation checks on every new request.
    const inFlight = this.inFlightSessionValidations.get(sessionId);
    if (inFlight) {
      return inFlight;
    }

    const validationPromise = this.doValidateSession(userId, sessionId);
    this.inFlightSessionValidations.set(sessionId, validationPromise);
    try {
      return await validationPromise;
    } finally {
      this.inFlightSessionValidations.delete(sessionId);
    }
  }

  private async doValidateSession(
    userId: string,
    sessionId: string,
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
