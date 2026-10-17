import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({
    example: [90, 30, 7],
    description: 'Expiry warning intervals in days before batch expiration',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  expiryWarningIntervals?: number[];

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'In-app notification audio alerts (default: false)',
  })
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Require client receipt confirmation after dispatch approval' })
  @IsOptional()
  @IsBoolean()
  receiptConfirmationEnabled?: boolean;
}
