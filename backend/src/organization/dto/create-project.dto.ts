import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Apex Manufacturing Ltd', description: 'Project company name' })
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  name!: string;
}
