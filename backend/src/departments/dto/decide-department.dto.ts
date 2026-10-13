import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveDepartmentDto {
  @ApiPropertyOptional({ description: 'Optional approval notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectDepartmentDto {
  @ApiProperty({ description: 'Mandatory reason for rejection' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
