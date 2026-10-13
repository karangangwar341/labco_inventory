import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ReportsService } from './reports.service.js';
import { ReportType, ReportFormat, QueryReportDto } from './dto/query-report.dto.js';

@ApiTags('Reports, Exports & Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('audit-history')
  @ApiOperation({ summary: 'View immutable report export audit history' })
  async getExportAuditHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getExportAuditHistory(user);
  }

  @Get(':reportType')
  @ApiOperation({ summary: 'Generate authorized report (JSON data or downloadable CSV)' })
  async generateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportType') reportType: ReportType,
    @Query() query: QueryReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.generateReport(reportType, query, user);

    if (result.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename || 'report.csv'}"`,
      );
      return result.csvData;
    }

    return result;
  }
}
