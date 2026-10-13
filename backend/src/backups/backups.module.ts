import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { BackupsService } from './backups.service.js';
import { BackupsController } from './backups.controller.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [BackupsController, HealthController],
  providers: [BackupsService],
  exports: [BackupsService],
})
export class BackupsModule {}
