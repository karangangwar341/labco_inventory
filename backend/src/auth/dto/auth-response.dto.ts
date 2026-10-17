import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

export class UserSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ required: false, nullable: true })
  warehouseId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  clientId?: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived JWT Access Token' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ example: 900, description: 'Token expiration in seconds' })
  expiresIn!: number;

  @ApiProperty({ type: UserSummaryDto })
  user!: UserSummaryDto;

  @ApiProperty({ required: false, description: 'Role-scoped startup data for the first workspace screen' })
  bootstrap?: Record<string, unknown>;
}
