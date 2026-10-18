import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { DepartmentsService } from './departments.service.js';
import { DepartmentsController } from './departments.controller.js';

@Module({
  imports: [PrismaModule, InventoryModule, NotificationsModule, RequestsModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
