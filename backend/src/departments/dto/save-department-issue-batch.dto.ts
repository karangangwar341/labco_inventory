import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { CreateDepartmentIssueDto } from './create-department-issue.dto.js';

export class SaveDepartmentIssueBatchDto {
  @ApiProperty({ type: [CreateDepartmentIssueDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateDepartmentIssueDto)
  issues!: CreateDepartmentIssueDto[];
}
