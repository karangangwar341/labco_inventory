import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const trustedProxyHops = process.env.TRUST_PROXY_HOPS;
  if (trustedProxyHops !== undefined && trustedProxyHops !== '') {
    const hopCount = Number(trustedProxyHops);
    if (!Number.isInteger(hopCount) || hopCount < 0 || hopCount > 10) {
      throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 10.');
    }
    app.getHttpAdapter().getInstance().set('trust proxy', hopCount);
  }

  const rawCorsOrigins = process.env.CORS_ALLOWED_ORIGINS;
  const allowedOrigins = rawCorsOrigins
    ? rawCorsOrigins.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (such as mobile apps, curl, or server-to-server)
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.replace(/\/$/, '');

      // 1. Direct match with configured origins
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // 2. Allow local origins in non-production
      if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin)) {
        return callback(null, true);
      }

      // 3. Allow Vercel preview/production deployments for this project
      const isVercelMatch = allowedOrigins.some((allowed) => {
        if (allowed.includes('.vercel.app')) {
          const baseName = allowed.replace(/^https?:\/\//, '').split('.')[0].replace(/-[a-z0-9]+$/, '');
          const escapedBase = baseName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const previewPattern = new RegExp(`^https:\\/\\/${escapedBase}(-[a-z0-9_-]+)?\\.vercel\\.app$`, 'i');
          return previewPattern.test(normalizedOrigin);
        }
        return false;
      });

      if (isVercelMatch) {
        return callback(null, true);
      }

      // Deny origin gracefully without throwing an unhandled 500 error in preflight
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Idempotency-Key',
      'X-Request-ID',
      'X-Device-Id',
      'x-device-id',
    ],
    exposedHeaders: ['X-Request-ID', 'X-Response-Time', 'X-Device-Id'],
  });

  // Request correlation and duration timing middleware (P-001)
  app.use((req: any, res: any, next: any) => {
    const suppliedRequestId = req.headers['x-request-id'];
    // Treat caller-provided IDs as untrusted log input. Accept only short,
    // printable tokens so newlines/control characters cannot forge log entries.
    const correlationId =
      typeof suppliedRequestId === 'string' &&
      /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    req.id = correlationId;
    res.setHeader('X-Request-ID', correlationId);

    const startTime = process.hrtime();
    const originalWriteHead = res.writeHead;
    res.writeHead = function (...args: any[]) {
      const diff = process.hrtime(startTime);
      const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      if (!res.headersSent) {
        res.setHeader('X-Response-Time', `${durationMs}ms`);
      }
      return originalWriteHead.apply(res, args);
    };

    res.on('finish', () => {
      const diff = process.hrtime(startTime);
      const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      if (process.env.NODE_ENV !== 'test') {
        const method = req.method;
        const path = req.path || req.url?.split('?')[0];
        const status = res.statusCode;
        console.log(`[HTTP ${status}] ${method} ${path} (${durationMs}ms) [${correlationId}]`);
      }
    });

    next();
  });

  // Secure HTTP Headers (Runbook Section 7 & Security Baseline)
  app.use((req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  app.setGlobalPrefix('api/v1', {
    exclude: ['/', 'health'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Warehouse, Project Manufacturing & Inventory Management API')
    .setDescription('REST API for Warehouse, Project Manufacturing & Inventory Management System')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, document);
  }

  const port = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is listening on port ${port}.`);
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
    console.log(`Swagger documentation: /api/v1/docs`);
  }
}
await bootstrap();
