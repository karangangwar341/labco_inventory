import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStaffMemberDto {
  @ApiProperty({ description: 'Unique staff identification number / badge ID within the project store', example: 'EMP-101' })
  @IsString()
  @IsNotEmpty()
  staffNumber!: string;

  @ApiProperty({ description: 'Full name of the staff member', example: 'Sarah Jenkins' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiPropertyOptional({ description: 'Job title or role within facility', example: 'Assay Production Specialist' })
  @IsOptional()
  @IsString()
  roleTitle?: string;

  @ApiPropertyOptional({ description: 'Phone number or contact info', example: '+1 (555) 234-5678' })
  @IsOptional()
  @IsString()
  contact?: string;

  @ApiPropertyOptional({ description: 'Project ID (Super Admin override only)' })
  @IsOptional()
  @IsString()
  projectId?: string;
}
