import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [BackupsController, HealthController],
  providers: [BackupsService],
  exports: [BackupsService],
})
export class BackupsModule {}
