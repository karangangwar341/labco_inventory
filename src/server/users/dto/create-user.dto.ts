import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'store_mgr_1', description: 'Unique username' })
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  username!: string;

  @ApiProperty({ example: 'SecureP@ssw0rd2026', description: 'Minimum 12 characters password' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  password!: string;

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

  @ApiProperty({ enum: UserRole, example: UserRole.STORE_ADMIN })
  @IsEnum(UserRole, { message: 'Role must be SUPER_ADMIN, STORE_ADMIN, or PROJECT_ADMIN' })
  role!: UserRole;

  @ApiPropertyOptional({ description: 'Required for STORE_ADMIN role' })
  @IsOptional()
  @IsUUID('4', { message: 'warehouseId must be a valid UUID' })
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Required for PROJECT_ADMIN role' })
  @IsOptional()
  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  projectId?: string;
}
