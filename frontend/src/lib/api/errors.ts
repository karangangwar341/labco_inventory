/**
 * Standardized frontend API Error handling.
 * Normalizes HTTP status codes, NestJS exceptions, and domain error messages.
 */

export interface ErrorDetails {
  code?: string;
  fieldErrors?: Record<string, string>;
  insufficientStock?: {
    requested?: number;
    available?: number;
  };
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  public status: number;
  public data: unknown;
  public code: string;
  public isSessionReplaced: boolean;
  public isUnauthorized: boolean;
  public isForbidden: boolean;
  public isLocked: boolean;
  public isConflict: boolean;
  public isInsufficientStock: boolean;
  public isRateLimited: boolean;
  public validationErrors: string[];
  public details: ErrorDetails;

  constructor(status: number, message: string, data?: unknown) {
    const rawData = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    
    // Normalize validation messages from NestJS ValidationPipe (string or string[])
    let resolvedMessage = message;
    let validationErrors: string[] = [];

    if (Array.isArray(rawData.message)) {
      validationErrors = rawData.message.map((m) => String(m));
      resolvedMessage = validationErrors.join('; ');
    } else if (typeof rawData.message === 'string') {
      resolvedMessage = rawData.message;
    }

    super(resolvedMessage);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.validationErrors = validationErrors;

    const rawMsg = resolvedMessage.toLowerCase();
    const rawCode = String(rawData.error || rawData.code || '').toUpperCase();

    // Session replacement detection
    this.isSessionReplaced =
      status === 401 &&
      (rawMsg.includes('replaced') ||
        rawCode === 'SESSION_REPLACED' ||
        rawMsg.includes('terminated'));

    // Auth failures
    this.isUnauthorized = status === 401;
    this.isForbidden = status === 403;

    // Account lockout (HTTP 423 or message)
    this.isLocked =
      status === 423 ||
      rawMsg.includes('locked') ||
      rawCode === 'ACCOUNT_LOCKED';

    // Conflict & duplicate idempotency (HTTP 409)
    this.isConflict =
      status === 409 ||
      rawMsg.includes('conflict') ||
      rawMsg.includes('duplicate');

    // Insufficient inventory stock
    this.isInsufficientStock =
      rawMsg.includes('insufficient') ||
      rawCode === 'INSUFFICIENT_AVAILABLE_STOCK';

    // Rate limiting (HTTP 429)
    this.isRateLimited =
      status === 429 ||
      rawMsg.includes('too many requests') ||
      rawMsg.includes('rate limit');

    // Normalized domain error code
    if (this.isSessionReplaced) this.code = 'SESSION_REPLACED';
    else if (this.isLocked) this.code = 'ACCOUNT_LOCKED';
    else if (this.isInsufficientStock) this.code = 'INSUFFICIENT_AVAILABLE_STOCK';
    else if (this.isConflict) this.code = 'CONFLICT';
    else if (this.isForbidden) this.code = 'FORBIDDEN';
    else if (this.isUnauthorized) this.code = 'UNAUTHORIZED';
    else if (this.isRateLimited) this.code = 'RATE_LIMITED';
    else if (status === 422 || validationErrors.length > 0) this.code = 'VALIDATION_ERROR';
    else this.code = rawCode || (status === 0 ? 'NETWORK_ERROR' : 'API_ERROR');

    // Details parsing
    const details: ErrorDetails = { code: this.code };

    if (this.isInsufficientStock) {
      // Parse "Requested: X, Available: Y" if present
      const reqMatch = resolvedMessage.match(/Requested:\s*([0-9.]+)/i);
      const availMatch = resolvedMessage.match(/Available:\s*([0-9.]+)/i);
      details.insufficientStock = {
        requested: reqMatch ? parseFloat(reqMatch[1]) : undefined,
        available: availMatch ? parseFloat(availMatch[1]) : undefined,
      };
    }

    if (this.isLocked) {
      // 15-minute lockout baseline (900 seconds)
      details.retryAfterSeconds = 900;
    }

    this.details = details;
  }
}
