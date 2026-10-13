import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { StockCondition } from '@prisma/client';

export class CreateDepartmentReturnDto {
  @ApiPropertyOptional({ description: 'Department UUID from which items are returned' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Optional linked DepartmentIssue UUID' })
  @IsOptional()
  @IsUUID('4')
  departmentIssueId?: string;

  @ApiProperty({ description: 'Product UUID being returned' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({ description: 'Batch UUID if lot-tracked' })
  @IsOptional()
  @IsUUID('4')
  batchId?: string;

  @ApiProperty({ example: 5, description: 'Quantity being returned' })
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

  @ApiProperty({ enum: StockCondition, example: 'USABLE', description: 'Condition: USABLE, DAMAGED, or EXPIRED' })
  @IsEnum(StockCondition)
  @IsNotEmpty()
  condition!: StockCondition;

  @ApiProperty({ example: 'Unused surplus after clinical test', description: 'Mandatory reason for return' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: 'Optional return notes or comments' })
  @IsOptional()
  @IsString()
  notes?: string;
}
