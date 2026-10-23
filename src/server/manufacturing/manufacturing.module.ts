import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ManufacturingService } from './manufacturing.service';
import { ManufacturingController } from './manufacturing.controller';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule, NotificationsModule],
  providers: [ManufacturingService],
  controllers: [ManufacturingController],
  exports: [ManufacturingService],
})
export class ManufacturingModule {}
