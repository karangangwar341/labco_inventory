import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveShipmentLineDto {
  @ApiProperty({ description: 'ShipmentLine UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  shipmentLineId!: string;

  @ApiProperty({ example: 95, description: 'Actual physical count received' })
  @IsNumber()
  @Min(0)
  receivedQty!: number;

  @ApiPropertyOptional({ example: '5 units damaged/broken in transit' })
  @IsOptional()
  @IsString()
  discrepancyReason?: string;
}

export class ReceiveShipmentDto {
  @ApiProperty({ type: [ReceiveShipmentLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveShipmentLineDto)
  lines!: ReceiveShipmentLineDto[];

  @ApiPropertyOptional({ example: 'Delivery arrived on truck #102' })
  @IsOptional()
  @IsString()
  notes?: string;
}
