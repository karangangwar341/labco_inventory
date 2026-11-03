import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Ramesh Kumar', description: 'Full name of user (optional)' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: '+91 9876543210', description: 'Phone number (optional)' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'Plot 42, Kursi Road Industrial Area, Lucknow', description: 'Postal / physical address (optional)' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'ID card or avatar image URL/base64 (optional)' })
  @IsOptional()
  @IsString()
  idImageUrl?: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.STORE_ADMIN })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Role must be SUPER_ADMIN, STORE_ADMIN, or PROJECT_ADMIN' })
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Warehouse ID for STORE_ADMIN role' })
  @IsOptional()
  @IsUUID('4', { message: 'warehouseId must be a valid UUID' })
  warehouseId?: string | null;

  @ApiPropertyOptional({ description: 'Project ID for PROJECT_ADMIN role' })
  @IsOptional()
  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  projectId?: string | null;
}
