import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Quality Assurance Lab', description: 'Department name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Client UUID (Super Admin only; derived from auth user for Client Admin)' })
  @IsOptional()
  @IsUUID('4')
  clientId?: string;
}
