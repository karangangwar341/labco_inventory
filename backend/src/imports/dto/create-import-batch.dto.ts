import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ImportType, ImportApprovalMode } from '@prisma/client';

export class CreateImportBatchDto {
  @ApiProperty({
    enum: ImportType,
    example: ImportType.STOCK_IN,
    description: 'Import intent / operation type',
  })
  @IsEnum(ImportType)
  @IsNotEmpty()
  importType!: ImportType;

  @ApiPropertyOptional({
    enum: ImportApprovalMode,
    default: ImportApprovalMode.PARTIAL,
    description: 'Approval mode: ALL_OR_NOTHING (commits all valid rows or none) or PARTIAL (posts approved rows)',
  })
  @IsOptional()
  @IsEnum(ImportApprovalMode)
  approvalMode?: ImportApprovalMode;

  @ApiProperty({ example: 'monthly_stock_in_october.csv', description: 'Source filename' })
  @IsString()
  @IsNotEmpty()
  sourceFilename!: string;

  @ApiProperty({
    example: 'productName,quantity,unitName,batchNumber\nCartridge A,100,PIECE,BATCH-001',
    description: 'File content (CSV/JSON text or Base64 payload)',
  })
  @IsString()
  @IsNotEmpty()
  fileContent!: string;

  @ApiPropertyOptional({ example: 'text/csv', default: 'text/csv', description: 'MIME type' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Default StockLocation UUID for rows omitting location' })
  @IsOptional()
  @IsUUID('4')
  defaultLocationId?: string;
}
