import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RunRestoreDrillDto {
  @ApiPropertyOptional({
    description: 'Target isolated environment for test restoration',
    default: 'isolated-drill-sandbox',
  })
  @IsOptional()
  @IsString()
  targetEnvironment?: string = 'isolated-drill-sandbox';

  @ApiPropertyOptional({
    description: 'Whether to verify ledger-to-balance consistency and physical inventory invariant during drill',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  verifyLedgerConsistency?: boolean = true;

  @ApiPropertyOptional({ description: 'Operational notes and auditor remarks for this drill' })
  @IsOptional()
  @IsString()
  drillNotes?: string;
}
