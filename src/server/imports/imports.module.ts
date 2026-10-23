import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ImportsService } from './imports.service';
import { ImportsController } from './imports.controller';
import { GeminiExtractionAdapter } from './adapters/gemini-extraction.adapter';

@Module({
  imports: [PrismaModule, InventoryModule, NotificationsModule],
  controllers: [ImportsController],
  providers: [ImportsService, GeminiExtractionAdapter],
  exports: [ImportsService, GeminiExtractionAdapter],
})
export class ImportsModule {}
