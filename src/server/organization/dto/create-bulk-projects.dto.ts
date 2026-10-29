import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBulkProjectItemDto {
  @ApiProperty({ example: 'Apex Central Diagnostics' })
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  name!: string;

  @ApiPropertyOptional({ example: ['wh-uuid-1'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each warehouse ID must be a valid UUID' })
  warehouseIds?: string[];
}

export class CreateBulkProjectsDto {
  @ApiProperty({ type: [CreateBulkProjectItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBulkProjectItemDto)
  items!: CreateBulkProjectItemDto[];
}
