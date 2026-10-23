import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { LoginDto } from '@/server/auth/dto/login.dto';
import {
  validateDto,
  handleApiError,
  getClientIp,
  getClientUserAgent,
  getDeviceId,
} from '@/server/auth/auth-guard';

const ipRequests = new Map<string, { timestamps: number[] }>();
const windowMs = 60 * 1000;
const maxRequests = 10;
let lastCleanupAt = 0;

function checkLoginRateLimit(ip: string) {
  const now = Date.now();
  if (now - lastCleanupAt >= windowMs) {
    for (const [knownIp, record] of ipRequests) {
      if (record.timestamps.every((t) => now - t >= windowMs)) {
        ipRequests.delete(knownIp);
      }
    }
    lastCleanupAt = now;
  }

  let record = ipRequests.get(ip);
  if (!record) {
    record = { timestamps: [] };
    ipRequests.set(ip, record);
  }

  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0];
    const retryAfterSeconds = Math.ceil((windowMs - (now - oldest)) / 1000);
    return NextResponse.json(
      {
        statusCode: 429,
        message: `Too many login attempts from this IP address. Please retry in ${retryAfterSeconds} seconds.`,
        retryAfterSeconds,
      },
      { status: 429 },
    );
  }
  record.timestamps.push(now);
  return null;
}

export async function POST(req: Request) {
  try {
    const ipAddress = getClientIp(req);
    const rateLimitError = checkLoginRateLimit(ipAddress);
    if (rateLimitError) return rateLimitError;

    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(LoginDto, body);
    const userAgent = getClientUserAgent(req);
    const deviceId = getDeviceId(req);

    const user = await container.authService.validateUserCredentials(
      dto.username,
      dto.password,
      ipAddress,
      userAgent,
    );

    const authResponse = await container.authService.login(user, {
      deviceId,
      userAgent,
      ipAddress,
    });

    const response = NextResponse.json(authResponse);
    response.cookies.set('session_token', authResponse.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: authResponse.expiresIn || 30 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
