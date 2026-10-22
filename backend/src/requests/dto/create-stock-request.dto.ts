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

  @ApiProperty({ example: 10, description: 'Quantity in selected unit' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ example: 12, description: 'Physically counted quantity (for physical count adjustments)' })
  @IsOptional()
  @IsNumber()
  countedQuantity?: number;

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

  @ApiPropertyOptional({
    example: 'DIRECT_PURCHASE',
    description: 'Source type: DIRECT_PURCHASE, OPENING_STOCK, DEPARTMENT_RETURN, DONATION, CORRECTION, OTHER',
  })
  @IsOptional()
  @IsString()
  sourceType?: string;

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

  @ApiPropertyOptional({ description: 'Project UUID' })
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

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
