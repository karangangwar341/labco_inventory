import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequestPriority } from '@prisma/client';
import { CreateStockRequestLineDto } from './create-stock-request.dto';

export class UpdateStockRequestDto {
  @ApiPropertyOptional({ enum: RequestPriority })
  @IsOptional()
  @IsEnum(RequestPriority)
  priority?: RequestPriority;

  @ApiPropertyOptional({ example: 'Updated restock reason' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ type: [CreateStockRequestLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockRequestLineDto)
  lines?: CreateStockRequestLineDto[];
}
