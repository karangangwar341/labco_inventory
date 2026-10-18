import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BackupsService } from './backups.service.js';
import type { Response } from 'express';

@ApiTags('System Health & Monitoring')
@Controller('health')
export class HealthController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liveness and health check endpoint (database, memory, uptime, backup alerts, background queue)',
  })
  async getHealth(@Res({ passthrough: true }) response: Response) {
    const health = await this.backupsService.getHealth();
    response.status(health.ready ? 200 : 503);
    return {
      status: health.ready ? 'READY' : 'NOT_READY',
      timestamp: health.timestamp,
    };
  }
}
