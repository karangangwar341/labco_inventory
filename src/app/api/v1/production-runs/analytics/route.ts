import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';
import { QueryManufacturingAnalyticsDto } from '@/server/manufacturing/dto/query-manufacturing-analytics.dto';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    const { searchParams } = new URL(req.url);
    const query: QueryManufacturingAnalyticsDto = {
      projectId: searchParams.get('projectId') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      status: (searchParams.get('status') as any) || undefined,
    };

    const data = await container.manufacturingService.getManufacturingAnalytics(user, query);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
