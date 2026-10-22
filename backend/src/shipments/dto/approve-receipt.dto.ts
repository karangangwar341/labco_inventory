import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApproveReceiptDto {
  @ApiPropertyOptional({ description: 'Idempotency key to prevent double approval' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
