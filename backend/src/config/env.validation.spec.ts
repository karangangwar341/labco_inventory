import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './env.validation.js';

const productionConfig = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:secret@db.example.test/app?sslmode=require',
  DIRECT_URL: 'postgresql://migrator:secret@db.example.test/app?sslmode=require',
  JWT_SECRET: 'a-production-secret-with-more-than-32-characters',
  CORS_ALLOWED_ORIGINS: 'https://warehouse.example.test',
  STORAGE_DRIVER: 'neon_s3',
  AWS_ACCESS_KEY_ID: 'access-key-value',
  AWS_SECRET_ACCESS_KEY: 'secret-key-value',
  AWS_ENDPOINT_URL_S3: 'https://storage.example.test',
  STORAGE_BUCKET_NAME: 'warehouse-assets',
};

describe('validateEnvironment', () => {
  it('leaves development and test environments unchanged', () => {
    const config = { NODE_ENV: 'test' };
    expect(validateEnvironment(config)).toBe(config);
  });

  it('accepts complete production configuration', () => {
    expect(validateEnvironment(productionConfig)).toBe(productionConfig);
  });

  it('rejects missing production configuration without echoing secret values', () => {
    let message = '';
    try {
      validateEnvironment({ ...productionConfig, JWT_SECRET: '', DATABASE_URL: '' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(productionConfig.JWT_SECRET);
  });

  it('rejects local CORS origins and ephemeral storage in production', () => {
    expect(() => validateEnvironment({ ...productionConfig, CORS_ALLOWED_ORIGINS: 'http://localhost:3000' }))
      .toThrow(/HTTPS origins/);
    expect(() => validateEnvironment({ ...productionConfig, STORAGE_DRIVER: 'local' }))
      .toThrow(/durable object storage/);
  });
});
