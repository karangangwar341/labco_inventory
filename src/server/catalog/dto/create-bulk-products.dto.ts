export class InitialStockEntryDto {
  @ApiPropertyOptional({ description: 'Target facility name (warehouse or project facility)' })
  @IsOptional()
  @IsString()
  facilityName?: string;

  @ApiPropertyOptional({ description: 'Explicit stock location UUID' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiProperty({ description: 'Initial stock quantity' })
  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}
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

  @ApiPropertyOptional({ example: 100, description: 'Single facility initial stock quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialStockQuantity?: number;

  @ApiPropertyOptional({ example: 'Kursi Road Factory', description: 'Target facility or warehouse name' })
  @IsOptional()
  @IsString()
  facilityName?: string;

  @ApiPropertyOptional({ description: 'Explicit stock location UUID' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ type: [InitialStockEntryDto], description: 'Optional list of initial stocks for multiple facilities' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialStockEntryDto)
  initialStocks?: InitialStockEntryDto[];
}

export class CreateBulkProductsDto {
  @ApiProperty({ type: [CreateBulkProductItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBulkProductItemDto)
  items!: CreateBulkProductItemDto[];

  @ApiPropertyOptional({ description: 'Default fallback location UUID for items with initial stock' })
  @IsOptional()
  @IsString()
  defaultLocationId?: string;

  @ApiPropertyOptional({ description: 'Default fallback facility name for items with initial stock' })
  @IsOptional()
  @IsString()
  defaultFacilityName?: string;
}
