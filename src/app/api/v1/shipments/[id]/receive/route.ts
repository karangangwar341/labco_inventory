import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { ReceiveShipmentDto } from '@/server/shipments/dto/receive-shipment.dto';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(ReceiveShipmentDto, body);

    const data = await container.shipmentsService.recordReceipt(user, id, dto);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
