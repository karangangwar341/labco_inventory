import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TrackingMode } from '@prisma/client';

export class ProductAttributeDto {
  @ApiProperty({ example: 'Volume' })
  @IsString()
  @IsNotEmpty()
  attributeName!: string;

  @ApiProperty({ example: '500' })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiPropertyOptional({ example: 'ml' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ProductUnitDto {
  @ApiProperty({ example: 'Box of 12' })
  @IsString()
  @IsNotEmpty()
  unitName!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isBaseUnit!: boolean;

  @ApiProperty({ example: 12, description: 'How many base units are in this unit (e.g. 1 box = 12 pieces)' })
  @IsNumber()
  @IsPositive({ message: 'conversionToBase must be a positive number' })
  conversionToBase!: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Erlenmeyer Flask 500ml', description: 'Product name' })
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  name!: string;

  @ApiPropertyOptional({ example: 'Pyrex' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ description: 'Category UUID' })
  @IsUUID('4', { message: 'categoryId must be a valid UUID' })
  @IsNotEmpty({ message: 'categoryId is required' })
  categoryId!: string;

  @ApiPropertyOptional({ example: 'Borosilicate glass flask' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 0, description: 'Number of decimal places allowed (0 to 2)' })
  @IsInt()
  @Min(0)
  @Max(2)
  quantityPrecision!: number;

  @ApiProperty({ example: false, description: 'True if product can be measured in fractional quantities' })
  @IsBoolean()
  allowFractional!: boolean;

  @ApiProperty({ enum: TrackingMode, example: TrackingMode.NONE })
  @IsEnum(TrackingMode)
  trackingMode!: TrackingMode;

  @ApiPropertyOptional({ example: 10, description: 'Low-stock alert threshold' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @ApiPropertyOptional({ type: [ProductAttributeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeDto)
  attributes?: ProductAttributeDto[];

  @ApiProperty({ type: [ProductUnitDto], description: 'List of units. Exactly one base unit is required.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductUnitDto)
  units!: ProductUnitDto[];
}
