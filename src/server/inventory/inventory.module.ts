import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  controllers: [InventoryController],
  providers: [LedgerService, InventoryService],
  exports: [LedgerService, InventoryService],
})
export class InventoryModule {}
