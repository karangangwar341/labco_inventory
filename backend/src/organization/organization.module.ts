import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service.js';
import { ClientsController } from './clients.controller.js';
import { WarehousesService } from './warehouses.service.js';
import { WarehousesController } from './warehouses.controller.js';

@Module({
  controllers: [ClientsController, WarehousesController],
  providers: [ClientsService, WarehousesService],
  exports: [ClientsService, WarehousesService],
})
export class OrganizationModule {}
