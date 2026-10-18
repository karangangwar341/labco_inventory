import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ProductionStatus } from '@prisma/client';

export class QueryManufacturingAnalyticsDto {
  @ApiPropertyOptional({ description: 'Client UUID (Super Admin only filter)' })
  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @ApiPropertyOptional({ description: 'Start date ISO string' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date ISO string' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: ProductionStatus, description: 'Filter by run status' })
  @IsOptional()
  @IsEnum(ProductionStatus)
  status?: ProductionStatus;
}
