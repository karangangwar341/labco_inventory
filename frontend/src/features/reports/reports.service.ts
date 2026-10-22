import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { ReportType, QueryReportDto, ReportAuditDto, ReportResult } from './reports.types';

export const reportsService = {
  generateReport: async <T = ReportResult>(
    reportType: ReportType,
    params?: QueryReportDto,
  ): Promise<T> => {
    const stringParams: Record<string, string> = {};
    if (params?.format) stringParams.format = params.format;
    if (params?.startDate) stringParams.startDate = params.startDate;
    if (params?.endDate) stringParams.endDate = params.endDate;
    if (params?.locationId) stringParams.locationId = params.locationId;
    if (params?.productId) stringParams.productId = params.productId;
    if (params?.projectId) stringParams.projectId = params.projectId;
    if (params?.warehouseId) stringParams.warehouseId = params.warehouseId;

    return apiClient.get<T>(endpoints.reports.byType(reportType, stringParams));
  },

  generateCsv: async (reportType: ReportType, params?: QueryReportDto): Promise<string> => {
    return reportsService.generateReport<string>(reportType, { ...params, format: 'csv' });
  },

  generateExcel: async (reportType: ReportType, params?: QueryReportDto): Promise<Blob> => {
    return reportsService.generateReport<Blob>(reportType, { ...params, format: 'xlsx' });
  },

  getAuditHistory: async (): Promise<ReportAuditDto[]> => {
    return apiClient.get<ReportAuditDto[]>(endpoints.reports.auditHistory());
  },
};
