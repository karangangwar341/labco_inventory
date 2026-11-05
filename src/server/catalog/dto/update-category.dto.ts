import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Laboratory Glassware', description: 'Updated category name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Category name cannot be empty' })
  name?: string;

  @ApiPropertyOptional({ description: 'Main category UUID when setting as a subcategory. Pass null to detach to top-level.' })
  @IsOptional()
  parentId?: string | null;
}
