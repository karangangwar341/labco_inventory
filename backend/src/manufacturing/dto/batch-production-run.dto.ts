import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitProductionRunBatchDto {
  @ApiProperty({
    description: 'Array of production run draft IDs to submit together for day-end approval',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  runIds!: string[];

  @ApiPropertyOptional({ description: 'Batch reference or notes' })
  @IsOptional()
  @IsString()
  batchNotes?: string;
}

export class DecideProductionRunBatchDto {
  @ApiProperty({
    description: 'Array of production run IDs to decide together',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  runIds!: string[];

  @ApiPropertyOptional({ description: 'Rejection reason or approval notes' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Idempotency key' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
