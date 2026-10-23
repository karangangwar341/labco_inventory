import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';
import { UserRole } from '@prisma/client';
import { sanitizeShipmentPayload } from '@/server/auth/interceptors/shipment-privacy.interceptor';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    const { id } = await params;

    let data = await container.shipmentsService.getShipmentById(user, id);
    if (user.role === UserRole.PROJECT_ADMIN) {
      data = sanitizeShipmentPayload(data);
    }
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
