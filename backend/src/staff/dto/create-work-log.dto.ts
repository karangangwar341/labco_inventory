import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkLogDto {
  @ApiPropertyOptional({ description: 'Date of logged work (ISO string or YYYY-MM-DD)', example: '2026-10-16' })
  @IsOptional()
  @IsString()
  logDate?: string;

  @ApiPropertyOptional({ description: 'Shift designation (MORNING, AFTERNOON, NIGHT, GENERAL)', example: 'MORNING' })
  @IsOptional()
  @IsString()
  shiftType?: string;

  @ApiPropertyOptional({ description: 'Hours logged for the shift', example: 8.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.25)
  @Max(24)
  hoursWorked?: number;

  @ApiProperty({ description: 'Detailed tasks and work activities completed', example: 'Calibrated diagnostic assay pipette lines and completed a quality inspection' })
  @IsString()
  @IsNotEmpty()
  tasksCompleted!: string;

  @ApiPropertyOptional({ description: 'Supervisory notes or incident remarks', example: 'Completed on schedule without deviations' })
  @IsOptional()
  @IsString()
  notes?: string;
}
