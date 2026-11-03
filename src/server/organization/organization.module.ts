import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { WarehousesService } from './warehouses.service';
import { WarehousesController } from './warehouses.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  controllers: [ProjectsController, WarehousesController],
  providers: [ProjectsService, WarehousesService],
  exports: [ProjectsService, WarehousesService],
})
export class OrganizationModule {}
