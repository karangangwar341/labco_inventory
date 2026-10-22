import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageService } from './storage.service.js';
import * as fs from 'fs';
import * as path from 'path';

describe('StorageService (Neon Object Storage & Local Driver)', () => {
  const testDir = './storage/test_uploads';

  afterEach(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  describe('Local Fallback Mode', () => {
    let service: StorageService;
    const mockConfig: any = {
      get: (key: string) => {
        if (key === 'STORAGE_DRIVER') return 'local';
        if (key === 'STORAGE_LOCAL_PATH') return testDir;
        return undefined;
      },
    };

    beforeEach(() => {
      service = new StorageService(mockConfig);
    });

    it('uploads a file locally and verifies checksum', async () => {
      const payload = Buffer.from('test content for storage');
      const result = await service.uploadFile('imports/test.txt', payload, 'text/plain');

      expect(result.storageKey).toBe('imports/test.txt');
      expect(result.sizeBytes).toBe(payload.length);
      expect(result.checksum).toBeDefined();

      const downloaded = await service.getFile('imports/test.txt');
      expect(downloaded.toString()).toBe('test content for storage');
    });

    it('generates a pseudo-presigned URL in local mode', async () => {
      const url = await service.getPresignedDownloadUrl('imports/test.txt', 300);
      expect(url).toContain('/storage/uploads/imports/test.txt');
      expect(url).toContain('exp=');
    });

    it('deletes a stored file locally', async () => {
      const payload = Buffer.from('to be deleted');
      await service.uploadFile('imports/del.txt', payload);
      await service.deleteFile('imports/del.txt');

      await expect(service.getFile('imports/del.txt')).rejects.toThrow();
    });

    it('reports healthy status for local driver', async () => {
      const health = await service.getStorageHealth();
      expect(health.status).toBe('HEALTHY');
      expect(health.driver).toBe('local');
    });
  });

  describe('Neon S3 Mode Initialization', () => {
    it('initializes Neon Object Storage driver when credentials are provided', async () => {
      const mockConfig: any = {
        get: (key: string) => {
          if (key === 'STORAGE_DRIVER') return 'neon_s3';
          if (key === 'AWS_ACCESS_KEY_ID') return 'neon_real_key_12345';
          if (key === 'AWS_SECRET_ACCESS_KEY') return 'neon_real_secret_67890';
          if (key === 'AWS_ENDPOINT_URL_S3') return 'https://storage.neon.tech';
          if (key === 'STORAGE_BUCKET_NAME') return 'test-warehouse-bucket';
          return undefined;
        },
      };

      const s3Service = new StorageService(mockConfig);
      Object.assign(s3Service, { s3Project: { send: vi.fn().mockResolvedValue({}) } });
      const health = await s3Service.getStorageHealth();

      expect(health.status).toBe('HEALTHY');
      expect(health.driver).toBe('neon_s3');
      expect(health.bucket).toBe('test-warehouse-bucket');
      expect(health.endpoint).toBe('https://storage.neon.tech');
    });

    it('reports degraded when the configured bucket cannot be reached', async () => {
      const mockConfig: any = {
        get: (key: string) => ({
          STORAGE_DRIVER: 'neon_s3',
          AWS_ACCESS_KEY_ID: 'neon_real_key_12345',
          AWS_SECRET_ACCESS_KEY: 'neon_real_secret_67890',
          AWS_ENDPOINT_URL_S3: 'https://storage.neon.tech',
          STORAGE_BUCKET_NAME: 'test-warehouse-bucket',
        })[key],
      };
      const s3Service = new StorageService(mockConfig);
      Object.assign(s3Service, { s3Project: { send: vi.fn().mockRejectedValue(new Error('secret details omitted')) } });

      const health = await s3Service.getStorageHealth();

      expect(health.status).toBe('DEGRADED');
      expect(health.details).not.toContain('secret details');
    });
  });
});
