import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';

export async function GET(req: Request) {
  try {
    const user = await authenticateUser(req);
    const data = await container.inventoryService.getTransactions(user);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
