import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const isDiagnosticEnabled =
      process.env.ENABLE_QUERY_TIMING === 'true' ||
      (process.env.NODE_ENV === 'development' && process.env.DEBUG_PRISMA === 'true');

    super(
      isDiagnosticEnabled
        ? {
            log: [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'error' },
              { emit: 'stdout', level: 'warn' },
            ],
          }
        : undefined,
    );

    if (isDiagnosticEnabled) {
      (this as any).$on('query', (e: any) => {
        // Redact any parameters or literals per Phase 0 / P-001 security requirements
        const sanitizedQuery = (e.query || '')
          .replace(/\$?\d+/g, '?')
          .replace(/'[^']*'/g, "'?'");
        this.logger.debug(
          `[Prisma DB ${e.duration}ms] ${sanitizedQuery}`,
        );
      });
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch {
      // Allow app to start even if DB is not connected during unit test runs
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Ensure default interactive transaction timeout is 30s to account for remote database latency
  override $transaction<R>(
    fn: (prisma: Prisma.TransactionClient) => Promise<R>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R>;
  override $transaction<P extends Prisma.PrismaPromise<any>[]>(
    promises: [...P],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<any>;
  override $transaction(arg: any, options?: any): Promise<any> {
    if (typeof arg === 'function') {
      const mergedOptions = {
        maxWait: 10000,
        timeout: 30000,
        ...options,
      };
      return super.$transaction(arg, mergedOptions);
    }
    return super.$transaction(arg, options);
  }
}
