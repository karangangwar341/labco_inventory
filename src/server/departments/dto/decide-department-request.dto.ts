import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveDepartmentActionDto {
  @ApiPropertyOptional({ description: 'Idempotency key' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class RejectDepartmentActionDto {
  @ApiProperty({ description: 'Mandatory reason for rejection' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
