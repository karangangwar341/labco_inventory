import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator';
import { LoginRateLimiterGuard } from './guards/login-rate-limiter.guard';
import type { Request } from 'express';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(LoginRateLimiterGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate user with username and password',
    description:
      'Enforces IP rate limiting, single active session policy (prior sessions revoked), 5-failed attempt lockout for 15 minutes, and minimum 12-char password.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 423, description: 'Account locked due to 5 consecutive failed attempts' })
  @ApiResponse({ status: 403, description: 'Account disabled' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const deviceId = req.headers['x-device-id'] as string | undefined;

    const user = await this.authService.validateUserCredentials(
      loginDto.username,
      loginDto.password,
      ipAddress,
      userAgent,
    );

    // Keep login latency focused on credential validation and session creation.
    // Startup reference data is fetched separately after the project establishes the session.
    return this.authService.login(user, { deviceId, userAgent, ipAddress });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke active session and logout' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized or session already revoked' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.id, user.sessionId);
  }
}

@ApiTags('User Profile')
@Controller('me')
export class MeController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current authenticated user identity and scope' })
  @ApiResponse({ status: 200, description: 'Current authenticated user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      sessionId: user.sessionId,
    };
  }

  @Get('bootstrap')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get the current user profile and small role-scoped startup data set' })
  getBootstrap(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getBootstrap(user);
  }
}
