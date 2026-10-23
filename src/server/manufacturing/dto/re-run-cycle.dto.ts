import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class ReRunCycleDto {
  @ApiPropertyOptional({ example: 50, description: 'Optional override for planned output quantity' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  plannedOutput?: number;

  @ApiPropertyOptional({ example: 'Re-running production cycle after low stock trigger', description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
