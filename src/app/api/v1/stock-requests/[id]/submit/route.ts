import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateUser(req);
    const { id } = await params;
    const idempotencyKey =
      req.headers.get('idempotency-key') || req.headers.get('Idempotency-Key') || undefined;

    const data = await container.requestsService.submitRequest(user, id, idempotencyKey);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
