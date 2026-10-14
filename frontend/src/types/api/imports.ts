import { ImportBatchStatus, ImportType } from './common';

export interface ImportRowDto {
  id: string;
  rowIndex: number;
  rawData: Record<string, unknown>;
  mappedData?: Record<string, unknown>;
  validationErrors?: string[];
  isDuplicate: boolean;
  duplicateResolution?: 'OVERWRITE' | 'IGNORE' | 'SPLIT';
  status: 'VALID' | 'ERROR' | 'RESOLVED';
}

export interface ImportBatchDto {
  id: string;
  importType: ImportType;
  status: ImportBatchStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  fileName: string;
  rows: ImportRowDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateImportBatchDto {
  importType: ImportType;
  fileName: string;
  fileContent: string;
}
