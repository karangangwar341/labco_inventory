import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';
import { ShipmentStatus, UserRole } from '@prisma/client';
import { sanitizeShipmentPayload } from '@/server/auth/interceptors/shipment-privacy.interceptor';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as ShipmentStatus) || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;

    let data = await container.shipmentsService.getShipments(user, status, { limit, page });
    if (user.role === UserRole.PROJECT_ADMIN) {
      data = sanitizeShipmentPayload(data);
    }
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
