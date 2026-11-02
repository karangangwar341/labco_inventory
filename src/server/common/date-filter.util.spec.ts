import { describe, it, expect } from 'vitest';
import { buildDateFilter } from './date-filter.util';

describe('buildDateFilter', () => {
  it('returns undefined if neither startDate nor endDate is provided', () => {
    expect(buildDateFilter()).toBeUndefined();
    expect(buildDateFilter(undefined, undefined)).toBeUndefined();
    expect(buildDateFilter('', '')).toBeUndefined();
  });

  it('builds gte filter for startDate in YYYY-MM-DD format', () => {
    const res = buildDateFilter('2026-10-15');
    expect(res).toBeDefined();
    expect(res?.gte).toEqual(new Date('2026-10-15T00:00:00.000Z'));
    expect(res?.lte).toBeUndefined();
  });

  it('builds lte filter for endDate in YYYY-MM-DD format ending at 23:59:59.999Z', () => {
    const res = buildDateFilter(undefined, '2026-10-25');
    expect(res).toBeDefined();
    expect(res?.gte).toBeUndefined();
    expect(res?.lte).toEqual(new Date('2026-10-25T23:59:59.999Z'));
  });

  it('builds combined gte and lte filters when both are provided', () => {
    const res = buildDateFilter('2026-10-01', '2026-10-31');
    expect(res).toBeDefined();
    expect(res?.gte).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(res?.lte).toEqual(new Date('2026-10-31T23:59:59.999Z'));
  });

  it('handles full ISO string timestamps properly without appending midnight', () => {
    const startIso = '2026-10-15T08:30:00.000Z';
    const endIso = '2026-10-25T17:45:00.000Z';
    const res = buildDateFilter(startIso, endIso);
    expect(res).toBeDefined();
    expect(res?.gte).toEqual(new Date(startIso));
    expect(res?.lte).toEqual(new Date(endIso));
  });

  it('ignores invalid dates gracefully', () => {
    const res = buildDateFilter('invalid-date', 'also-invalid');
    expect(res).toBeUndefined();
  });
});
