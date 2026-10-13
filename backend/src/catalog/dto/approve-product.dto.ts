import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum ApprovalDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class ApproveProductDto {
  @ApiProperty({ enum: ApprovalDecision, example: ApprovalDecision.APPROVE })
  @IsEnum(ApprovalDecision)
  decision!: ApprovalDecision;

  @ApiPropertyOptional({ example: 'Specification does not match approved lab catalog standards' })
  @IsOptional()
  @IsString()
  reason?: string;
}
