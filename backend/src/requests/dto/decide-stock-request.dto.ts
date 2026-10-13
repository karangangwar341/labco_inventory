import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveStockRequestDto {
  @ApiPropertyOptional({ description: 'Idempotency key to prevent duplicate approval/posting' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class RejectStockRequestDto {
  @ApiProperty({ description: 'Mandatory reason for rejection' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
