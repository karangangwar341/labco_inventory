import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class ReRunCycleDto {
  @ApiPropertyOptional({ example: 50, description: 'Optional override for planned output quantity' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  plannedOutput?: number;

  @ApiPropertyOptional({ example: 'BATCH-20261017-001', description: 'Batch number for output' })
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @ApiPropertyOptional({ example: '2028-10-17T00:00:00.000Z', description: 'Expiry date' })
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @ApiPropertyOptional({ example: 'Re-running production cycle after low stock trigger', description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
