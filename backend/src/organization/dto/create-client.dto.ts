import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ example: 'Apex Manufacturing Ltd', description: 'Client company name' })
  @IsString()
  @IsNotEmpty({ message: 'Client name is required' })
  name!: string;
}
