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
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'super_secret_jwt_signing_key_change_in_production',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.authService.validateSession(payload.sub, payload.sessionId);
    if (!user) {
      throw new UnauthorizedException('Session expired, revoked, or replaced by another login');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      sessionId: payload.sessionId,
    };
  }
}
