import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole, BackupStatus } from '@prisma/client';
import { BackupsService } from './backups.service';
import { CreateBackupDto } from './dto/create-backup.dto';
import { RunRestoreDrillDto } from './dto/run-restore-drill.dto';

@ApiTags('Backups, Monitoring & Restore Drills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Trigger an automated or manual backup (supports 90-day retention and automated retry/alert verification)',
  })
  async triggerBackup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBackupDto,
  ) {
    return this.backupsService.triggerBackup(dto, user);
  }

  @Get('health')
  @ApiOperation({ summary: 'Get detailed system health for authenticated Super Admins' })
  async getSystemHealth() {
    return this.backupsService.getHealth();
  }

  @Get()
  @ApiOperation({ summary: 'List backup history records' })
  @ApiQuery({ name: 'status', enum: BackupStatus, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getBackups(
    @Query('status') status?: BackupStatus,
    @Query('limit') limit?: number,
  ) {
    return this.backupsService.getBackups({
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Retrieve high-level backup status summary and persistent failure warning indicator',
  })
  async getBackupStatusSummary() {
    return this.backupsService.getBackupStatusSummary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve specific backup record by ID' })
  async getBackupById(@Param('id') id: string) {
    return this.backupsService.getBackupById(id);
  }

  @Post(':id/restore-drill')
  @ApiOperation({
    summary:
      'Execute automated restore drill in isolated sandbox environment to verify archive checksum and inventory balance invariants',
  })
  async runRestoreDrill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RunRestoreDrillDto,
  ) {
    return this.backupsService.runRestoreDrill(id, dto, user);
  }
}
