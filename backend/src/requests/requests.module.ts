import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ShipmentsModule } from '../shipments/shipments.module.js';
import { ReservationsService } from './reservations.service.js';
import { RequestsService } from './requests.service.js';
import { RequestsController } from './requests.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule, ShipmentsModule],
  providers: [ReservationsService, RequestsService],
  controllers: [RequestsController],
  exports: [ReservationsService, RequestsService],
})
export class RequestsModule {}
