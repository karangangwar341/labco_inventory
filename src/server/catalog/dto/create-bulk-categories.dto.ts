import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CatalogScope } from '@prisma/client';

export class CreateBulkCategoryItemDto {
  @ApiProperty({ example: 'Acids', description: 'Category or subcategory name' })
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  name!: string;

  @ApiPropertyOptional({ example: 'Laboratory Reagents', description: 'Parent category name (will be created if missing)' })
  @IsOptional()
  @IsString()
  parentName?: string;

  @ApiPropertyOptional({ description: 'Parent category UUID if known' })
  @IsOptional()
  @IsUUID('4', { message: 'parentId must be a valid UUID' })
  parentId?: string;

  @ApiPropertyOptional({ enum: CatalogScope, default: CatalogScope.COMPANY })
  @IsOptional()
  @IsEnum(CatalogScope)
  ownerScope?: CatalogScope;

  @ApiPropertyOptional({ description: 'Project ID if project-scoped' })
  @IsOptional()
  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  projectId?: string;
}

export class CreateBulkCategoriesDto {
  @ApiProperty({ type: [CreateBulkCategoryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBulkCategoryItemDto)
  items!: CreateBulkCategoryItemDto[];
}
