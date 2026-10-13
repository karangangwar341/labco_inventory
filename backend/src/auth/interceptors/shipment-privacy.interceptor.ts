import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserRole } from '@prisma/client';

export function sanitizeShipmentPayload(data: any): any {
  if (!data) return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeShipmentPayload(item));
  }

  if (typeof data === 'object') {
    const sanitized = { ...data };

    // Redact source warehouse fields if present
    if ('sourceWarehouseId' in sanitized) {
      delete sanitized.sourceWarehouseId;
    }
    if ('sourceWarehouse' in sanitized) {
      delete sanitized.sourceWarehouse;
    }
    if ('sourceLocationId' in sanitized) {
      delete sanitized.sourceLocationId;
    }
    if ('sourceLocation' in sanitized) {
      delete sanitized.sourceLocation;
    }

    // Mask for Client Admin view
    sanitized.sourceDescription = 'Central Warehouse Dispatch';

    // Recurse into nested objects
    for (const key of Object.keys(sanitized)) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = sanitizeShipmentPayload(sanitized[key]);
      }
    }

    return sanitized;
  }

  return data;
}

@Injectable()
export class ShipmentPrivacyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      map((data) => {
        if (user && user.role === UserRole.CLIENT_ADMIN) {
          return sanitizeShipmentPayload(data);
        }
        return data;
      }),
    );
  }
}
