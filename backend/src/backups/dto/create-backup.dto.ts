import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBackupDto {
  @ApiPropertyOptional({ default: 90, description: 'Retention period in days (default: 90 days)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  retentionDays?: number = 90;

  @ApiPropertyOptional({ description: 'Optional operational notes for backup trigger' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Simulate failure for retry and persistent alert verification', default: false })
  @IsOptional()
  simulateFailure?: boolean = false;
}
