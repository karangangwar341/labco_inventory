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

export class WriteOffStockDto {
  @ApiPropertyOptional({ description: 'Client UUID (Super Admin only; derived from auth user for Client Admin)' })
  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @ApiProperty({ description: 'Product UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({ description: 'Batch UUID if lot-tracked' })
  @IsOptional()
  @IsUUID('4')
  batchId?: string;

  @ApiProperty({
    enum: [StockCondition.DAMAGED, StockCondition.EXPIRED],
    description: 'Condition to write off: DAMAGED or EXPIRED',
  })
  @IsEnum(StockCondition)
  @IsNotEmpty()
  condition!: StockCondition;

  @ApiProperty({ example: 5, description: 'Quantity to write off' })
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

  @ApiProperty({ example: 'Disposed per biohazard protocol', description: 'Reason for write-off' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Idempotency key' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
