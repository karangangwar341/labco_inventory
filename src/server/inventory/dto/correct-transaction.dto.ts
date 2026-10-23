import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PostTransactionLineDto } from './post-transaction.dto';

export class CorrectTransactionDto {
  @ApiProperty({ description: 'Mandatory explanation/audit reason for historical correction' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: 'Idempotency key' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({
    type: [PostTransactionLineDto],
    description: 'Replacement lines that will post the correct state',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostTransactionLineDto)
  replacementLines!: PostTransactionLineDto[];
}
