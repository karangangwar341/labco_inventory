import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ManufacturingService } from './manufacturing.service.js';
import { ManufacturingController } from './manufacturing.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule],
  providers: [ManufacturingService],
  controllers: [ManufacturingController],
  exports: [ManufacturingService],
})
export class ManufacturingModule {}
