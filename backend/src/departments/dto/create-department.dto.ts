import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Quality Assurance Lab', description: 'Department name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Project UUID (Super Admin only; derived from auth user for Project Admin)' })
  @IsOptional()
  @IsUUID('4')
  projectId?: string;
}
