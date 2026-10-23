import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveProductionRunDto {
  @ApiPropertyOptional({ description: 'Idempotency key' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class RejectProductionRunDto {
  @ApiProperty({ description: 'Mandatory reason for rejection' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
