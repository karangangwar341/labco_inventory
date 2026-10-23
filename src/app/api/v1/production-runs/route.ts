import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, validateDto, handleApiError } from '@/server/auth/auth-guard';
import { ProductionStatus } from '@prisma/client';
import { CreateProductionRunDto } from '@/server/manufacturing/dto/create-production-run.dto';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as ProductionStatus) || undefined;
    const projectId = searchParams.get('projectId') || undefined;

    const data = await container.manufacturingService.getProductionRuns(user, status, projectId);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const dto = await validateDto(CreateProductionRunDto, body);

    const data = await container.manufacturingService.createProductionRun(user, dto);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
