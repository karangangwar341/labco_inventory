import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApproveReceiptDto {
  @ApiPropertyOptional({ description: 'Idempotency key to prevent double approval' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Whether any missing quantity should be held on DISCREPANCY_HOLD (D-002)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  holdDiscrepancy?: boolean;
}
