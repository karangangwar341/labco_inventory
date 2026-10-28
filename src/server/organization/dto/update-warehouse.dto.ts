import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrganizationStatus } from '@prisma/client';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Central Distribution Warehouse' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Building 4, Industrial Zone A' })
  @IsOptional()
  @IsString()
  locationDescription?: string;

  @ApiPropertyOptional({ enum: OrganizationStatus, example: OrganizationStatus.ACTIVE })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @ApiPropertyOptional({ example: 'user-uuid-1', description: 'Assigned Store Admin user ID, or null to unassign' })
  @IsOptional()
  @IsString()
  storeAdminId?: string | null;
}
