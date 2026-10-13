import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrganizationStatus } from '@prisma/client';

export class UpdateClientDto {
  @ApiPropertyOptional({ example: 'Apex Manufacturing Ltd' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: OrganizationStatus, example: OrganizationStatus.ACTIVE })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;
}
