import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  IStorageService,
  StorageDriverType,
  UploadResult,
  StorageHealthResult,
} from './storage.interface.js';

@Injectable()
export class StorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private driver: StorageDriverType = 'local';
  private s3Project?: S3Client;
  private bucket: string = 'warehouse-inventory-assets';
  private endpoint?: string;
  private localBasePath: string = './storage/uploads';

  constructor(private readonly configService?: ConfigService) {
    this.initConfiguration();
  }

  onModuleInit() {
    if (this.driver === 'neon_s3' || this.driver === 's3') {
      this.logger.log(
        `Neon Object Storage initialized (Bucket: "${this.bucket}", Endpoint: "${this.endpoint || 'default'}")`,
      );
    } else {
      this.logger.log(
        `Local storage driver active (Path: "${this.localBasePath}")`,
      );
    }
  }

  private initConfiguration() {
    const rawDriver = (
      this.getConfig('STORAGE_DRIVER') || 'neon_s3'
    ).toLowerCase();
    this.bucket =
      this.getConfig('STORAGE_BUCKET_NAME') ||
      this.getConfig('NEON_STORAGE_BUCKET') ||
      'warehouse-inventory-assets';
    this.endpoint =
      this.getConfig('AWS_ENDPOINT_URL_S3') ||
      this.getConfig('NEON_STORAGE_ENDPOINT') ||
      'https://storage.neon.tech';
    this.localBasePath =
      this.getConfig('STORAGE_LOCAL_PATH') || './storage/uploads';

    const accessKeyId =
      this.getConfig('AWS_ACCESS_KEY_ID') ||
      this.getConfig('NEON_STORAGE_ACCESS_KEY_ID');
    const secretAccessKey =
      this.getConfig('AWS_SECRET_ACCESS_KEY') ||
      this.getConfig('NEON_STORAGE_SECRET_ACCESS_KEY');
    const region =
      this.getConfig('AWS_REGION') ||
      this.getConfig('NEON_STORAGE_REGION') ||
      'us-east-1';

    if (
      (rawDriver === 'neon_s3' || rawDriver === 's3') &&
      accessKeyId &&
      secretAccessKey &&
      !accessKeyId.includes('your_neon_')
    ) {
      this.driver = rawDriver === 's3' ? 's3' : 'neon_s3';
      this.s3Project = new S3Client({
        region,
        endpoint: this.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      // Fallback gracefully to local directory storage if credentials are placeholder/unset
      this.driver = 'local';
      this.ensureLocalDirectory(this.localBasePath);
    }
  }

  private getConfig(key: string): string | undefined {
    return this.configService?.get<string>(key) || process.env[key];
  }

  private ensureLocalDirectory(dirPath: string) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to create local storage directory: ${err.message}`);
    }
  }

  async uploadFile(
    key: string,
    content: Buffer | string,
    mimeType = 'application/octet-stream',
  ): Promise<UploadResult> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    if (this.s3Project && (this.driver === 'neon_s3' || this.driver === 's3')) {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      });

      await this.s3Project.send(command);

      return {
        storageKey: key,
        sizeBytes: buffer.length,
        checksum,
        location: `${this.endpoint}/${this.bucket}/${key}`,
      };
    }

    // Local file fallback
    const normalizedKey = key.replace(/^[/\\]+/, '');
    const fullPath = path.resolve(this.localBasePath, normalizedKey);
    const targetDir = path.dirname(fullPath);
    this.ensureLocalDirectory(targetDir);

    await fs.promises.writeFile(fullPath, buffer);

    return {
      storageKey: key,
      sizeBytes: buffer.length,
      checksum,
      location: fullPath,
    };
  }

  async getFile(key: string): Promise<Buffer> {
    if (this.s3Project && (this.driver === 'neon_s3' || this.driver === 's3')) {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Project.send(command);
      if (!response.Body) {
        throw new Error(`File payload not found in storage for key "${key}"`);
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }

    // Local file fallback
    const normalizedKey = key.replace(/^[/\\]+/, '');
    const fullPath = path.resolve(this.localBasePath, normalizedKey);
    return fs.promises.readFile(fullPath);
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    if (this.s3Project && (this.driver === 'neon_s3' || this.driver === 's3')) {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return getSignedUrl(this.s3Project, command, {
        expiresIn: expiresInSeconds,
      });
    }

    // Local environment pseudo-presigned URL
    return `/storage/uploads/${key.replace(/^[/\\]+/, '')}?exp=${Date.now() + expiresInSeconds * 1000}`;
  }

  async deleteFile(key: string): Promise<void> {
    if (this.s3Project && (this.driver === 'neon_s3' || this.driver === 's3')) {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.s3Project.send(command);
      return;
    }

    const normalizedKey = key.replace(/^[/\\]+/, '');
    const fullPath = path.resolve(this.localBasePath, normalizedKey);
    try {
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
    } catch {
      // Ignore deletion errors on absent local files
    }
  }

  async getStorageHealth(): Promise<StorageHealthResult> {
    if (this.driver !== 'local' && this.s3Project) {
      try {
        await this.s3Project.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        return {
          status: 'DEGRADED',
          driver: this.driver,
          bucket: this.bucket,
          details: 'Configured object storage is unreachable or the bucket is unavailable.',
        };
      }
    }

    return {
      status: 'HEALTHY',
      driver: this.driver,
      bucket: this.driver !== 'local' ? this.bucket : undefined,
      endpoint: this.driver !== 'local' ? this.endpoint : undefined,
      details:
        this.driver === 'neon_s3'
          ? 'Neon Object Storage connected (S3-compatible branch-aware storage)'
          : this.driver === 's3'
            ? 'S3-compatible Object Storage connected'
            : 'Local disk file storage active',
    };
  }
}
