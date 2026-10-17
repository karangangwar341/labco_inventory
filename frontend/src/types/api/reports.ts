export type ReportType =
  | 'STOCK_BALANCE'
  | 'INVENTORY_LEDGER'
  | 'BATCH_EXPIRY'
  | 'CLIENT_CONSUMPTION'
  | 'PRODUCTION_RUNS';

export type ReportFormat = 'json' | 'csv';

export interface QueryReportDto {
  format?: ReportFormat;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  productId?: string;
  clientId?: string;
  warehouseId?: string;
}

export interface ReportAuditDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  occurredAt: string;
  actorUser?: { id: string; username: string; role: string };
}

export interface ReportResult {
  reportType: ReportType;
  format: 'json';
  rowCount: number;
  data: Array<Record<string, unknown>>;
}
