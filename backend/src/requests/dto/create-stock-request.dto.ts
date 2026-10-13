import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RequestType,
  RequestPriority,
  StockCondition,
} from '@prisma/client';

export class CreateStockRequestLineDto {
  @ApiProperty({ description: 'Product UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({ description: 'Batch UUID if tracking lot/expiry' })
  @IsOptional()
  @IsUUID('4')
  batchId?: string;

  @ApiProperty({ example: 10, description: 'Quantity in selected unit' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ description: 'ProductUnit UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  unitId!: string;

  @ApiPropertyOptional({ enum: StockCondition, default: StockCondition.USABLE })
  @IsOptional()
  @IsEnum(StockCondition)
  condition?: StockCondition;
}

export class CreateStockRequestDto {
  @ApiProperty({ enum: RequestType })
  @IsEnum(RequestType)
  requestType!: RequestType;

  @ApiPropertyOptional({ enum: RequestPriority, default: RequestPriority.NORMAL })
  @IsOptional()
  @IsEnum(RequestPriority)
  priority?: RequestPriority;

  @ApiPropertyOptional({ description: 'Source StockLocation UUID' })
  @IsOptional()
  @IsUUID('4')
  sourceLocationId?: string;

  @ApiPropertyOptional({ description: 'Destination StockLocation UUID' })
  @IsOptional()
  @IsUUID('4')
  destinationLocationId?: string;

  @ApiPropertyOptional({ description: 'Client UUID' })
  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @ApiPropertyOptional({ example: 'Monthly restock request' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Idempotency key' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({ type: [CreateStockRequestLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockRequestLineDto)
  lines!: CreateStockRequestLineDto[];
}
