import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType, StockCondition } from '@prisma/client';

export class PostTransactionLineDto {
  @ApiProperty({ description: 'Target StockLocation UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  locationId!: string;

  @ApiProperty({ description: 'Product UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ enum: StockCondition, default: StockCondition.USABLE })
  @IsEnum(StockCondition)
  condition!: StockCondition;

  @ApiProperty({ example: 10, description: 'Quantity in original unit' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ example: 'Box of 10', description: 'Unit name of entered quantity' })
  @IsString()
  @IsNotEmpty()
  unitName!: string;

  @ApiProperty({ enum: ['IN', 'OUT'], description: 'IN adds to stock, OUT deducts from stock' })
  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';
}

export class PostTransactionDto {
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  transactionType!: TransactionType;

  @ApiPropertyOptional({ description: 'Immutable transaction reason, required for damaged stock-outs' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Idempotency key to prevent double posting on retries' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: 'STOCK_REQUEST' })
  @IsOptional()
  @IsString()
  sourceRefType?: string;

  @ApiPropertyOptional({ example: 'req-uuid-123' })
  @IsOptional()
  @IsString()
  sourceRefId?: string;

  @ApiProperty({ type: [PostTransactionLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostTransactionLineDto)
  lines!: PostTransactionLineDto[];
}
