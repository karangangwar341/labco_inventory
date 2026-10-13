import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Laboratory Glassware', description: 'Category name' })
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  name!: string;

  @ApiPropertyOptional({ description: 'Parent category UUID for subcategories' })
  @IsOptional()
  @IsUUID('4', { message: 'parentId must be a valid UUID' })
  parentId?: string;
}
