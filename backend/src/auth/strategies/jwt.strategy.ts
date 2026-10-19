import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service.js';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  sessionId: string;
  deviceId?: string | null;
  warehouseId?: string | null;
  clientId?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error(
        'FATAL: JWT_SECRET environment variable is missing. The application cannot start without an explicitly configured JWT signing secret.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      passReqToCallback: true,
    });
  }

  async validate(reqOrPayload: any, maybePayload?: JwtPayload) {
    // Accommodate both passReqToCallback: true (req, payload) and direct test calls (payload)
    const req = maybePayload ? reqOrPayload : null;
    const payload: JwtPayload = maybePayload || reqOrPayload;

    const incomingUserAgent = req?.headers?.['user-agent'];
    const incomingDeviceId = (req?.headers?.['x-device-id'] as string) || (payload.deviceId ?? undefined);
    const ipAddress = req?.ip || req?.socket?.remoteAddress;

    const user = await this.authService.validateSession(payload.sub, payload.sessionId, {
      deviceId: incomingDeviceId,
      userAgent: incomingUserAgent,
      ipAddress,
    });

    if (!user) {
      throw new UnauthorizedException('Session expired, revoked, replaced by another login, or used on an unauthorized device');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      sessionId: payload.sessionId,
      warehouseId: user.warehouseId ?? payload.warehouseId ?? null,
      clientId: user.clientId ?? payload.clientId ?? null,
    };
  }
}
