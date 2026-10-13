import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ImportsService } from './imports.service.js';
import { ImportsController } from './imports.controller.js';
import { GeminiExtractionAdapter } from './adapters/gemini-extraction.adapter.js';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [ImportsController],
  providers: [ImportsService, GeminiExtractionAdapter],
  exports: [ImportsService, GeminiExtractionAdapter],
})
export class ImportsModule {}
