import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserRole } from '@prisma/client';

function isPlainObject(value: any): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (value instanceof Date) return false;
  if (
    value._isDecimal ||
    typeof value.toFixed === 'function' ||
    typeof value.toNumber === 'function' ||
    (Array.isArray(value.d) && typeof value.s === 'number' && typeof value.e === 'number')
  ) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function sanitizeShipmentPayload(data: any): any {
  if (!data) return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeShipmentPayload(item));
  }

  if (isPlainObject(data)) {
    const sanitized = { ...data };

    // Redact source warehouse fields if present on a shipment entity
    const isShipmentEntity =
      'sourceWarehouseId' in sanitized ||
      'sourceWarehouse' in sanitized ||
      'sourceLocationId' in sanitized ||
      'sourceLocation' in sanitized ||
      'sourceWarehouseName' in sanitized ||
      'shipmentNumber' in sanitized ||
      'shipmentType' in sanitized;

    if (isShipmentEntity) {
      delete sanitized.sourceWarehouseId;
      delete sanitized.sourceWarehouse;
      delete sanitized.sourceLocationId;
      delete sanitized.sourceLocation;
      delete sanitized.sourceWarehouseName;
      sanitized.sourceDescription = 'Central Warehouse Dispatch';
    }

    // Recurse into nested objects or arrays without spreading non-plain objects
    for (const key of Object.keys(sanitized)) {
      if (Array.isArray(sanitized[key])) {
        sanitized[key] = sanitized[key].map((item: any) =>
          isPlainObject(item) ? sanitizeShipmentPayload(item) : item,
        );
      } else if (isPlainObject(sanitized[key])) {
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
        if (user && user.role === UserRole.PROJECT_ADMIN) {
          return sanitizeShipmentPayload(data);
        }
        return data;
      }),
    );
  }
}
