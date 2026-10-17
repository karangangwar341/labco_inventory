import { ImportBatchDto, ImportRowDto } from '../../types/api';

export type ImportBatchStatus = ImportBatchDto['status'];
export type ImportType = ImportBatchDto['importType'];
export type CreateImportBatchPayload = {
  importType: ImportType;
  sourceFilename: string;
  fileContent: string;
  mimeType?: string;
  defaultLocationId?: string;
  approvalMode?: 'ALL_OR_NOTHING' | 'PARTIAL';
};

export interface ImportRow extends Omit<ImportRowDto, 'rawDataJson' | 'normalizedDataJson' | 'validationStatus' | 'validationErrors' | 'hasDuplicateWarning'> {
  rowIndex: number;
  rawData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  validationErrors: string[];
  isDuplicate: boolean;
  status: 'VALID' | 'ERROR' | 'PENDING' | 'POSTED' | 'REJECTED';
}

export interface ImportBatch extends Omit<ImportBatchDto, 'sourceFilename' | 'rows'> {
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  rows: ImportRow[];
}
