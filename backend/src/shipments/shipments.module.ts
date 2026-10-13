import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ShipmentsService } from './shipments.service.js';
import { ShipmentsController } from './shipments.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule],
  providers: [ShipmentsService],
  controllers: [ShipmentsController],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
