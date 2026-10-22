import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import { ProjectsController } from './projects.controller.js';
import { WarehousesService } from './warehouses.service.js';
import { WarehousesController } from './warehouses.controller.js';

@Module({
  controllers: [ProjectsController, WarehousesController],
  providers: [ProjectsService, WarehousesService],
  exports: [ProjectsService, WarehousesService],
})
export class OrganizationModule {}
