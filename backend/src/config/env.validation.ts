type Environment = Record<string, unknown>;

function value(config: Environment, key: string): string {
  const entry = config[key];
  return typeof entry === 'string' ? entry.trim() : '';
}

function isPlaceholder(input: string): boolean {
  return /your_|change[_ -]?in[_ -]?production|super[_ -]?secret|placeholder|\[[^\]]+\]/i.test(input);
}

/** Fail fast on production misconfiguration while leaving local/test defaults usable. */
export function validateEnvironment(config: Environment): Environment {
  if (value(config, 'NODE_ENV') !== 'production') return config;

  const missing = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'CORS_ALLOWED_ORIGINS']
    .filter((key) => !value(config, key));

  const errors: string[] = [];
  if (missing.length) errors.push(`Missing required variables: ${missing.join(', ')}`);

  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    const connectionString = value(config, key);
    if (connectionString && (!/^postgres(?:ql)?:\/\//i.test(connectionString) || isPlaceholder(connectionString))) {
      errors.push(`${key} must be a real PostgreSQL connection string.`);
    }
  }

  const jwtSecret = value(config, 'JWT_SECRET');
  if (jwtSecret && (jwtSecret.length < 32 || isPlaceholder(jwtSecret))) {
    errors.push('JWT_SECRET must be a non-placeholder secret with at least 32 characters.');
  }

  const trustedProxyHops = value(config, 'TRUST_PROXY_HOPS');
  if (trustedProxyHops && (!/^\d+$/.test(trustedProxyHops) || Number(trustedProxyHops) > 10)) {
    errors.push('TRUST_PROXY_HOPS must be an integer from 0 to 10.');
  }

  const origins = value(config, 'CORS_ALLOWED_ORIGINS');
  if (origins) {
    for (const origin of origins.split(',').map((entry) => entry.trim()).filter(Boolean)) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'https:' || parsed.origin !== origin) {
          errors.push('CORS_ALLOWED_ORIGINS must contain HTTPS origins only, without paths or trailing slashes.');
          break;
        }
      } catch {
        errors.push('CORS_ALLOWED_ORIGINS contains an invalid origin.');
        break;
      }
    }
  }

  const storageDriver = (value(config, 'STORAGE_DRIVER') || 'neon_s3').toLowerCase();
  if (!['neon_s3', 's3'].includes(storageDriver)) {
    errors.push('Production requires durable object storage (STORAGE_DRIVER=neon_s3 or s3).');
  }

  const storageCredentials = [
    ['AWS_ACCESS_KEY_ID', 'NEON_STORAGE_ACCESS_KEY_ID'],
    ['AWS_SECRET_ACCESS_KEY', 'NEON_STORAGE_SECRET_ACCESS_KEY'],
  ];
  for (const aliases of storageCredentials) {
    if (!aliases.some((key) => value(config, key) && !isPlaceholder(value(config, key)))) {
      errors.push(`Production object storage requires ${aliases.join(' or ')}.`);
    }
  }
  if (!(value(config, 'AWS_ENDPOINT_URL_S3') || value(config, 'NEON_STORAGE_ENDPOINT'))) {
    errors.push('Production object storage requires AWS_ENDPOINT_URL_S3 or NEON_STORAGE_ENDPOINT.');
  }
  if (!(value(config, 'STORAGE_BUCKET_NAME') || value(config, 'NEON_STORAGE_BUCKET'))) {
    errors.push('Production object storage requires STORAGE_BUCKET_NAME or NEON_STORAGE_BUCKET.');
  }

  if (errors.length) {
    throw new Error(`Invalid production environment configuration: ${errors.join(' ')}`);
  }
  return config;
}
