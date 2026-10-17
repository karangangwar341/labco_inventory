import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { ImportsModule } from './imports/imports.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { BackupsModule } from './backups/backups.module.js';
import { StorageModule } from './storage/storage.module.js';
import { StaffModule } from './staff/staff.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '.env.local'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 25, // 25 requests per second burst limit
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 120, // 120 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 360, // 360 requests per minute sustained limit
      },
    ]),
    PrismaModule,
    StorageModule,
    AuthModule,
    OrganizationModule,
    UsersModule,
    CatalogModule,
    InventoryModule,
    RequestsModule,
    ShipmentsModule,
    ManufacturingModule,
    DepartmentsModule,
    ImportsModule,
    NotificationsModule,
    ReportsModule,
    BackupsModule,
    StaffModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

