import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DepartmentStatus } from '@prisma/client';

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ example: 'Microbiology Lab', description: 'Updated department name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: DepartmentStatus, description: 'Target department status' })
  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;
}
