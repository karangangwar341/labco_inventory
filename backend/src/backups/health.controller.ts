import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BackupsService } from './backups.service.js';

@ApiTags('System Health & Monitoring')
@Controller('health')
export class HealthController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liveness and health check endpoint (database, memory, uptime, backup alerts, background queue)',
  })
  async getHealth() {
    return this.backupsService.getHealth();
  }
}
