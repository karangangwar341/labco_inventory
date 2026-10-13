import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject } from 'class-validator';

export class UpdateImportRowDto {
  @ApiProperty({
    example: { productName: 'Lab Cartridge A', quantity: 150, unitName: 'PIECE' },
    description: 'Updated normalized row field values',
  })
  @IsObject()
  @IsNotEmpty()
  normalizedData!: Record<string, any>;
}
