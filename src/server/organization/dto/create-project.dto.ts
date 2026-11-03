import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Apex Manufacturing Ltd', description: 'Project company name' })
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  name!: string;

  @ApiPropertyOptional({ description: 'Optional list of company product IDs to initialize the project catalog with' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  initialProductIds?: string[];

  @ApiPropertyOptional({ description: 'Optional list of company category IDs whose products should be seeded' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  initialCategoryIds?: string[];

  @ApiPropertyOptional({ description: 'Automatically seed all approved company products as project catalog items' })
  @IsOptional()
  @IsBoolean()
  seedAllCompanyProducts?: boolean;
}
