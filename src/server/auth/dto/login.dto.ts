import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin_user', description: 'Unique username' })
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  username!: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Minimum 12 characters password' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(12, { message: 'Password must be at least 12 characters in length' })
  password!: string;
}
