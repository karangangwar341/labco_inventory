import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CatalogScope, ProductKind } from '@prisma/client';

export class CreateBulkProductItemDto {
  @ApiProperty({ example: 'Ethanol Absolute AR' })
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  name!: string;

  @ApiPropertyOptional({ example: 'Laboratory Reagents' })
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiPropertyOptional({ example: 'Solvents' })
  @IsOptional()
  @IsString()
  subcategoryName?: string;

  @ApiPropertyOptional({ description: 'Explicit category UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'categoryId must be a valid UUID' })
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Merck' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'Analytical reagent grade 99.9%' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ProductKind, default: ProductKind.RAW_MATERIAL })
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;

  @ApiPropertyOptional({ example: 'BOTTLE', default: 'PIECE' })
  @IsOptional()
  @IsString()
  unitName?: string;

  @ApiPropertyOptional({ example: 10, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  minOrderQuantity?: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  quantityPrecision?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowFractional?: boolean;

  @ApiPropertyOptional({ enum: CatalogScope, default: CatalogScope.COMPANY })
  @IsOptional()
  @IsEnum(CatalogScope)
  ownerScope?: CatalogScope;

  @ApiPropertyOptional({ description: 'Target Project ID for project-scoped products' })
  @IsOptional()
  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  projectId?: string;
}

export class CreateBulkProductsDto {
  @ApiProperty({ type: [CreateBulkProductItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBulkProductItemDto)
  items!: CreateBulkProductItemDto[];
}
