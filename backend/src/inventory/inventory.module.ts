import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service.js';
import { InventoryService } from './inventory.service.js';
import { InventoryController } from './inventory.controller.js';

@Module({
  controllers: [InventoryController],
  providers: [LedgerService, InventoryService],
  exports: [LedgerService, InventoryService],
})
export class InventoryModule {}
