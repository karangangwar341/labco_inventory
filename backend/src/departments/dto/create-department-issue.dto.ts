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

  @ApiProperty({ description: 'Product UUID to issue' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({ description: 'Batch UUID if lot-tracked' })
  @IsOptional()
  @IsUUID('4')
  batchId?: string;

  @ApiProperty({ example: 10, description: 'Quantity to issue' })
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
