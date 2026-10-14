import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class LoginRateLimiterGuard implements CanActivate {
  private readonly ipRequests = new Map<string, RateLimitRecord>();
  private readonly windowMs = 60 * 1000; // 1 minute sliding window
  private readonly maxRequests = 10; // Max 10 requests per minute per IP

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.ip ||
      request.socket.remoteAddress ||
      'unknown-ip';

    const now = Date.now();
    let record = this.ipRequests.get(ip);

    if (!record) {
      record = { timestamps: [] };
      this.ipRequests.set(ip, record);
    }

    // Filter out timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((t) => now - t < this.windowMs);

    if (record.timestamps.length >= this.maxRequests) {
      const oldest = record.timestamps[0];
      const retryAfterSeconds = Math.ceil((this.windowMs - (now - oldest)) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many login attempts from this IP address. Please retry in ${retryAfterSeconds} seconds.`,
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
    return true;
  }
}
