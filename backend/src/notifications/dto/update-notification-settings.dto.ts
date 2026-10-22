import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'In-app notification audio alerts (default: false)',
  })
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Require project receipt confirmation after dispatch approval' })
  @IsOptional()
  @IsBoolean()
  receiptConfirmationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Super Admin approval requirement per inventory workflow' })
  @IsOptional()
  @IsObject()
  approvalRequirements?: Record<string, unknown>;
}
