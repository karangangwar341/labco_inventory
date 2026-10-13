import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({
    example: [90, 30, 7],
    description: 'Expiry warning intervals in days before batch expiration',
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  expiryWarningIntervals?: number[];

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'In-app notification audio alerts (default: false)',
  })
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;
}
