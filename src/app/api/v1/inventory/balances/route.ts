import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get('locationId') || undefined;
    const productId = searchParams.get('productId') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;
    const kind = (searchParams.get('kind') as any) || undefined;
    const locationType = (searchParams.get('locationType') as any) || undefined;

    const data = await container.inventoryService.getBalances(user, {
      locationId,
      productId,
      limit,
      page,
      kind,
      locationType,
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
