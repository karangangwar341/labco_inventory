import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'NewSecretPass123!@', description: 'Minimum 12 characters new password' })
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  newPassword!: string;
}
