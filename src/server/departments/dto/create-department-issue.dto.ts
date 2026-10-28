import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateDepartmentIssueDto {
  @ApiProperty({ description: 'Target Department UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  departmentId!: string;

  @ApiPropertyOptional({ example: 'IND-2026-001', description: 'Physical Indent Form Number' })
  @IsOptional()
  @IsString()
  indentNumber?: string;

  @ApiProperty({ description: 'Product UUID to issue' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({ example: 10, description: 'Quantity requested on the physical indent form' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  requestedQuantity?: number;

  @ApiProperty({ example: 10, description: 'Supplied / issued quantity' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ description: 'ProductUnit UUID' })
  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @ApiPropertyOptional({ example: 'PIECE', description: 'Unit name if unitId not provided' })
  @IsOptional()
  @IsString()
  unitName?: string;

  @ApiPropertyOptional({ example: 'For batch testing', description: 'Optional issue notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
