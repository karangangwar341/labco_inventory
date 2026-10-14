import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthorizationService } from './authorization.service.js';
import { AuthController, MeController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { ShipmentPrivacyInterceptor } from './interceptors/shipment-privacy.interceptor.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'FATAL: JWT_SECRET environment variable is missing. The application cannot start without an explicitly configured JWT signing secret.',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: (configService.get<string>('JWT_EXPIRATION') || '15m') as any,
          },
        };
      },
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    AuthorizationService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    ShipmentPrivacyInterceptor,
  ],
  exports: [
    AuthService,
    AuthorizationService,
    JwtAuthGuard,
    RolesGuard,
    ShipmentPrivacyInterceptor,
    JwtModule,
  ],
})
export class AuthModule {}
