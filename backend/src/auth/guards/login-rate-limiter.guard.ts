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
  private lastCleanupAt = 0;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // Express request.ip honors X-Forwarded-For only when trust proxy is configured.
    // Never trust that header directly: projects can forge it to bypass throttling.
    const ip = request.ip || request.socket.remoteAddress || 'unknown-ip';

    const now = Date.now();
    if (now - this.lastCleanupAt >= this.windowMs) {
      for (const [knownIp, knownRecord] of this.ipRequests) {
        if (knownRecord.timestamps.every((timestamp) => now - timestamp >= this.windowMs)) {
          this.ipRequests.delete(knownIp);
        }
      }
      this.lastCleanupAt = now;
    }

    let record = this.ipRequests.get(ip);

    if (!record) {
      if (this.ipRequests.size >= 10_000) {
        throw new HttpException('Login rate limiter capacity reached. Retry shortly.', HttpStatus.TOO_MANY_REQUESTS);
      }
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
