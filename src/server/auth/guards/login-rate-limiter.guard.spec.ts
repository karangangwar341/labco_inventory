import { describe, expect, it } from 'vitest';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { LoginRateLimiterGuard } from './login-rate-limiter.guard';

function contextFor(ip: string, forwardedFor = 'forged-project-value') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        headers: { 'x-forwarded-for': forwardedFor },
        socket: { remoteAddress: ip },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('LoginRateLimiterGuard', () => {
  it('does not let callers rotate a forged X-Forwarded-For header to bypass the IP limit', () => {
    const guard = new LoginRateLimiterGuard();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(guard.canActivate(contextFor('192.0.2.10', `forged-${attempt}`))).toBe(true);
    }
    expect(() => guard.canActivate(contextFor('192.0.2.10', 'forged-eleventh')))
      .toThrow(HttpException);
  });

  it('tracks distinct request IPs independently', () => {
    const guard = new LoginRateLimiterGuard();
    expect(guard.canActivate(contextFor('192.0.2.10'))).toBe(true);
    expect(guard.canActivate(contextFor('192.0.2.11'))).toBe(true);
  });
});
