import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { UnitsService } from './units.service';
import { UnitsController } from './units.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CategoriesController, ProductsController, UnitsController],
  providers: [CategoriesService, ProductsService, UnitsService],
  exports: [CategoriesService, ProductsService, UnitsService],
})
export class CatalogModule {}
