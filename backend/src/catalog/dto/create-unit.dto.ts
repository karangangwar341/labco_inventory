import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'Box of 25', description: 'Name of the measurement unit' })
  @IsString()
  @IsNotEmpty({ message: 'Unit name is required' })
  @MaxLength(50, { message: 'Unit name must not exceed 50 characters' })
  name!: string;

  @ApiPropertyOptional({
    example: 'PACKAGING',
    description: 'Category classification: CONTAINER, PACKAGING, VOLUME, WEIGHT, COUNT, OTHER',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Box containing 25 test vials', description: 'Optional description of the unit' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Description must not exceed 200 characters' })
  description?: string;
}
