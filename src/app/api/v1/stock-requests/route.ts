import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { RequestStatus, RequestType } from '@prisma/client';
import { CreateStockRequestDto } from '@/server/requests/dto/create-stock-request.dto';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as RequestStatus) || undefined;
    const requestType = (searchParams.get('requestType') as RequestType) || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const warehouseId = searchParams.get('warehouseId') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;

    const data = await container.requestsService.getRequests(
      user,
      { status, requestType, projectId, warehouseId },
      { limit, page },
    );
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(CreateStockRequestDto, body);

    const data = await container.requestsService.createDraft(user, dto);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
