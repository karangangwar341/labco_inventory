import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReservationsService } from './reservations.service';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule, ShipmentsModule, NotificationsModule],
  providers: [ReservationsService, RequestsService],
  controllers: [RequestsController],
  exports: [ReservationsService, RequestsService],
})
export class RequestsModule {}
