import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Central Distribution Warehouse', description: 'Warehouse facility name' })
  @IsString()
  @IsNotEmpty({ message: 'Warehouse name is required' })
  name!: string;

  @ApiPropertyOptional({ example: 'Building 4, Industrial Zone A' })
  @IsOptional()
  @IsString()
  locationDescription?: string;
}
