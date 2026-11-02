import { Prisma } from '@prisma/client';

/**
 * Builds a Prisma DateTimeFilter for createdAt/postedAt/etc. queries.
 * Handles both full ISO strings with time/timezone and YYYY-MM-DD date strings.
 */
export function buildDateFilter(
  startDate?: string,
  endDate?: string,
): Prisma.DateTimeFilter | undefined {
  if (!startDate && !endDate) return undefined;

  const filter: Prisma.DateTimeFilter = {};

  if (startDate) {
    const d = new Date(startDate.includes('T') ? startDate : `${startDate}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) {
      filter.gte = d;
    }
  }

  if (endDate) {
    const d = new Date(endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`);
    if (!isNaN(d.getTime())) {
      filter.lte = d;
    }
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}
