import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum ReportType {
  STOCK_BALANCE = 'STOCK_BALANCE',
  INVENTORY_LEDGER = 'INVENTORY_LEDGER',
  PROJECT_CONSUMPTION = 'PROJECT_CONSUMPTION',
  PRODUCTION_RUNS = 'PRODUCTION_RUNS',
  SHIPMENTS = 'SHIPMENTS',
  MISSING_STOCK = 'MISSING_STOCK',
}

export enum ReportFormat {
  JSON = 'json',
  CSV = 'csv',
  XLSX = 'xlsx',
}

export class QueryReportDto {
  @ApiPropertyOptional({ enum: ReportFormat, default: ReportFormat.JSON, description: 'Export format: json, csv, or xlsx' })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat = ReportFormat.JSON;

  @ApiPropertyOptional({ description: 'Filter by StockLocation UUID' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({ description: 'Filter by Product UUID' })
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter by Project UUID (Super Admin only)' })
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @ApiPropertyOptional({ description: 'Filter by Warehouse UUID (Super Admin only)' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Start date filter (ISO format)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'End date filter (ISO format)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
