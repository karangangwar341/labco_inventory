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
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductionMode } from '@prisma/client';

export class ProductionInputDto {
  @ApiProperty({ description: 'Raw material Product UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 5, description: 'Consumed quantity' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ description: 'ProductUnit UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  unitId!: string;
}

export class ProductionOutputDto {
  @ApiProperty({ description: 'Finished Product UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 10, description: 'Produced quantity' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ description: 'ProductUnit UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  unitId!: string;
}

export class CreateProductionRunDto {
  @ApiPropertyOptional({ description: 'Project UUID (required if caller is Super Admin)' })
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @ApiPropertyOptional({ enum: ProductionMode, default: ProductionMode.LINKED })
  @IsOptional()
  @IsEnum(ProductionMode)
  mode?: ProductionMode;

  @ApiPropertyOptional({ example: 'BATCH-PROD-2026-001', description: 'Production reference code' })
  @IsOptional()
  @IsString()
  productionReference?: string;

  @ApiPropertyOptional({ example: 12, description: 'Planned output quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  plannedOutput?: number;

  @ApiPropertyOptional({ example: 10, description: 'Actual output quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualOutput?: number;

  @ApiPropertyOptional({ example: 2, description: 'Wastage quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  wastage?: number;

  @ApiPropertyOptional({ example: 'Standard formulation batch' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ProductionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionInputDto)
  inputs!: ProductionInputDto[];

  @ApiProperty({ type: [ProductionOutputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionOutputDto)
  outputs!: ProductionOutputDto[];
}
