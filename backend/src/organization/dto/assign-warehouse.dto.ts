import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignWarehouseDto {
  @ApiProperty({ description: 'Warehouse ID to assign to the project' })
  @IsUUID('4', { message: 'warehouseId must be a valid UUID' })
  @IsNotEmpty({ message: 'warehouseId is required' })
  warehouseId!: string;
}
