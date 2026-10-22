import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum DiscrepancyResolution {
  MISSING = 'MISSING',
  CALCULATION_MISTAKE = 'CALCULATION_MISTAKE',
}

export class ResolveDiscrepancyDto {
  @ApiProperty({ enum: DiscrepancyResolution, description: 'Final Super Admin decision for all discrepancies on this shipment' })
  @IsEnum(DiscrepancyResolution)
  resolution!: DiscrepancyResolution;

  @ApiPropertyOptional({ description: 'Optional audit note for this decision', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
