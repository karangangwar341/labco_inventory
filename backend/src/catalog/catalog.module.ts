import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { CategoriesController } from './categories.controller.js';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { UnitsService } from './units.service.js';
import { UnitsController } from './units.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [CategoriesController, ProductsController, UnitsController],
  providers: [CategoriesService, ProductsService, UnitsService],
  exports: [CategoriesService, ProductsService, UnitsService],
})
export class CatalogModule {}
