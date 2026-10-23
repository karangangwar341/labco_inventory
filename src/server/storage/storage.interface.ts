export type StorageDriverType = 'neon_s3' | 's3' | 'local';

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  storageKey: string;
  sizeBytes: number;
  checksum?: string;
  location?: string;
}

export interface StorageHealthResult {
  status: 'HEALTHY' | 'DEGRADED';
  driver: StorageDriverType;
  bucket?: string;
  endpoint?: string;
  details?: string;
}

export interface IStorageService {
  uploadFile(
    key: string,
    content: Buffer | string,
    mimeType?: string,
  ): Promise<UploadResult>;

  getFile(key: string): Promise<Buffer>;

  getPresignedDownloadUrl(
    key: string,
    expiresInSeconds?: number,
  ): Promise<string>;

  deleteFile(key: string): Promise<void>;

  getStorageHealth(): Promise<StorageHealthResult>;
}
