import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { UpdateStockRequestDto } from '@/server/requests/dto/update-stock-request.dto';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    const { id } = await params;
    const data = await container.requestsService.getRequestById(user, id);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(UpdateStockRequestDto, body);

    const data = await container.requestsService.updatePendingRequest(user, id, dto);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
