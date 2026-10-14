export type ReportType =
  | 'CURRENT_STOCK_BALANCE'
  | 'STOCK_MOVEMENT_LEDGER'
  | 'DISCREPANCY_SUMMARY'
  | 'SHIPMENT_RECEIPT_STATUS'
  | 'CLIENT_CONSUMPTION'
  | 'SYSTEM_AUDIT_LOG'
  | 'PRODUCTION_YIELD';

export type ReportFormat = 'json' | 'csv';

export interface QueryReportDto {
  format?: ReportFormat;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  productId?: string;
  clientId?: string;
}

export interface ReportAuditDto {
  id: string;
  reportType: string;
  format: string;
  requestedBy: string;
  recordCount: number;
  timestamp: string;
  hash: string;
}
