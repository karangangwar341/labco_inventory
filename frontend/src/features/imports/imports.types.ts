import {
  ImportBatchDto,
  ImportRowDto,
  CreateImportBatchDto,
  ImportBatchStatus,
  ImportType,
} from '../../types/api';

export type ImportBatch = ImportBatchDto;
export type ImportRow = ImportRowDto;
export type CreateImportBatchPayload = CreateImportBatchDto;
export type { ImportBatchStatus, ImportType };
