import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class UpdateStaffMemberDto {
  @ApiPropertyOptional({ description: 'Staff badge / ID number', example: 'EMP-101' })
  @IsOptional()
  @IsString()
  staffNumber?: string;

  @ApiPropertyOptional({ description: 'Full name of staff member', example: 'Sarah Jenkins' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Job title or role within facility', example: 'Senior Quality Inspector' })
  @IsOptional()
  @IsString()
  roleTitle?: string;

  @ApiPropertyOptional({ description: 'Phone number or contact info', example: '+1 (555) 234-5678' })
  @IsOptional()
  @IsString()
  contact?: string;

  @ApiPropertyOptional({ enum: UserStatus, description: 'Employment status' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
