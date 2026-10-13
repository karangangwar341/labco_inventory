import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ImportApprovalMode } from '@prisma/client';

export class ApproveImportBatchDto {
  @ApiPropertyOptional({
    enum: ImportApprovalMode,
    description: 'Override approval mode (ALL_OR_NOTHING or PARTIAL)',
  })
  @IsOptional()
  @IsEnum(ImportApprovalMode)
  approvalMode?: ImportApprovalMode;

  @ApiPropertyOptional({ description: 'Idempotency key' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class RejectImportBatchDto {
  @ApiProperty({ description: 'Mandatory reason for batch rejection' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
