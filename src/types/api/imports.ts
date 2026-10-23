import { ImportBatchStatus, ImportType } from './common';

export interface ImportRowDto {
  id: string;
  batchId: string;
  rowNumber: number;
  rawDataJson: Record<string, unknown>;
  normalizedDataJson: Record<string, unknown>;
  validationStatus: 'PENDING' | 'VALID' | 'INVALID' | 'POSTED' | 'REJECTED';
  validationErrors?: string[] | null;
  hasDuplicateWarning: boolean;
  duplicateWarningReason?: string | null;
  editedAfterExtraction: boolean;
}

export interface ImportBatchDto {
  id: string;
  importType: ImportType;
  status: ImportBatchStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  sourceFilename: string;
  approvalMode: 'ALL_OR_NOTHING' | 'PARTIAL';
  uploadedById: string;
  rows?: ImportRowDto[];
  _count?: { rows: number };
  createdAt: string;
  updatedAt: string;
}

export interface CreateImportBatchDto {
  importType: ImportType;
  sourceFilename: string;
  fileContent: string;
  mimeType?: string;
  defaultLocationId?: string;
  approvalMode?: 'ALL_OR_NOTHING' | 'PARTIAL';
}
