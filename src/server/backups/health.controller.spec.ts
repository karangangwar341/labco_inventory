import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns only minimal readiness data to unauthenticated probes', async () => {
    const backupsService = {
      getHealth: vi.fn().mockResolvedValue({
        ready: true,
        status: 'DEGRADED',
        timestamp: '2026-10-17T00:00:00.000Z',
        memory: { rssBytes: 123 },
        monitoring: { pendingApprovalsCount: 7 },
      }),
    };
    const response = { status: vi.fn() } as unknown as Response;
    const controller = new HealthController(backupsService as never);

    const result = await controller.getHealth(response);

    expect(result).toEqual({ status: 'READY', timestamp: '2026-10-17T00:00:00.000Z' });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('signals unavailable readiness without exposing the internal health payload', async () => {
    const backupsService = {
      getHealth: vi.fn().mockResolvedValue({
        ready: false,
        status: 'DEGRADED',
        timestamp: '2026-10-17T00:00:00.000Z',
        database: 'DISCONNECTED',
      }),
    };
    const response = { status: vi.fn() } as unknown as Response;
    const controller = new HealthController(backupsService as never);

    const result = await controller.getHealth(response);

    expect(result).toEqual({ status: 'NOT_READY', timestamp: '2026-10-17T00:00:00.000Z' });
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
