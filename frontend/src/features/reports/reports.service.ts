import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { ReportType, QueryReportDto, ReportAuditDto } from './reports.types';

export const reportsService = {
  generateReport: async (
    reportType: ReportType,
    params?: QueryReportDto,
  ): Promise<any> => {
    const stringParams: Record<string, string> = {};
    if (params?.format) stringParams.format = params.format;
    if (params?.startDate) stringParams.startDate = params.startDate;
    if (params?.endDate) stringParams.endDate = params.endDate;
    if (params?.locationId) stringParams.locationId = params.locationId;
    if (params?.productId) stringParams.productId = params.productId;
    if (params?.clientId) stringParams.clientId = params.clientId;

    return apiClient.get(endpoints.reports.byType(reportType, stringParams));
  },

  getAuditHistory: async (): Promise<ReportAuditDto[]> => {
    return apiClient.get<ReportAuditDto[]>(endpoints.reports.auditHistory());
  },
};
