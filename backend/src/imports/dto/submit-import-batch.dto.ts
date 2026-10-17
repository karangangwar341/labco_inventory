import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ImportApprovalMode } from '@prisma/client';

export class SubmitImportBatchDto {
  @ApiPropertyOptional({ enum: ImportApprovalMode })
  @IsOptional()
  @IsEnum(ImportApprovalMode)
  approvalMode?: ImportApprovalMode;
}
