import { ImportType } from '@prisma/client';

export interface ExtractedField<T = any> {
  fieldName: string;
  proposedValue: T;
  confidence: number; // 0.0 to 1.0
  sourceEvidence?: string; // row/col/text snippet
  warnings: string[];
  requiresHumanConfirmation: boolean;
}

export interface ExtractedRow {
  rowNumber: number;
  rawRecord: Record<string, any>;
  fields: Record<string, ExtractedField>;
  normalizedData: Record<string, any>;
  overallConfidence: number;
  warnings: string[];
}

export interface ExtractionResult {
  importType: ImportType;
  totalRows: number;
  extractedRows: ExtractedRow[];
  globalWarnings: string[];
  modelInfo: {
    provider: string;
    model: string;
    version: string;
  };
}

export interface AiExtractionAdapter {
  extractFromDocument(
    content: string | Buffer,
    mimeType: string,
    intent: ImportType,
  ): Promise<ExtractionResult>;
}
