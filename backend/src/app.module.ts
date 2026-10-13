import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganizationModule } from './organization/organization.module.js';
import { UsersModule } from './users/users.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { ShipmentsModule } from './shipments/shipments.module.js';
import { ManufacturingModule } from './manufacturing/manufacturing.module.js';
import { DepartmentsModule } from './departments/departments.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '.env.local'],
    }),
    PrismaModule,
    AuthModule,
    OrganizationModule,
    UsersModule,
    CatalogModule,
    InventoryModule,
    RequestsModule,
    ShipmentsModule,
    ManufacturingModule,
    DepartmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
