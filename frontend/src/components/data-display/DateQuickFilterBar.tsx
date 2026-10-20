'use client';

import React, { useState } from 'react';

export type DateQuickFilter =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_WEEK'
  | 'LAST_MONTH'
  | 'CUSTOM'
  | 'ALL';

export interface DateQuickFilterBarProps {
  value?: DateQuickFilter;
  activeFilter?: DateQuickFilter;
  onChange?: (filter: DateQuickFilter) => void;
  onFilterChange?: (filter: DateQuickFilter) => void;
  customStart?: string;
  customEnd?: string;
  onCustomStartChange?: (date: string) => void;
  onCustomEndChange?: (date: string) => void;
  totalOlderCount?: number;
  olderRecordsCount?: number;
  onViewOlder?: () => void;
  onViewAll?: () => void;
  className?: string;
  compact?: boolean;
}

export function isDateInRange(
  dateValue: string | Date | null | undefined,
  filter: DateQuickFilter,
  customStart?: string,
  customEnd?: string,
): boolean {
  if (filter === 'ALL') return true;
  if (!dateValue) return false;

  const itemDate = new Date(dateValue);
  if (isNaN(itemDate.getTime())) return true;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (filter === 'TODAY') {
    return itemDate >= todayStart && itemDate <= todayEnd;
  }

  if (filter === 'YESTERDAY') {
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayEnd);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    return itemDate >= yesterdayStart && itemDate <= yesterdayEnd;
  }

  if (filter === 'LAST_WEEK') {
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    return itemDate >= weekStart && itemDate <= todayEnd;
  }

  if (filter === 'LAST_MONTH') {
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);
    return itemDate >= monthStart && itemDate <= todayEnd;
  }

  if (filter === 'CUSTOM') {
    if (!customStart && !customEnd) return true;
    if (customStart) {
      const cStart = new Date(`${customStart}T00:00:00`);
      if (itemDate < cStart) return false;
    }
    if (customEnd) {
      const cEnd = new Date(`${customEnd}T23:59:59.999`);
      if (itemDate > cEnd) return false;
    }
    return true;
  }

  return true;
}

export function DateQuickFilterBar({
  value,
  activeFilter,
  onChange,
  onFilterChange,
  customStart = '',
  customEnd = '',
  onCustomStartChange,
  onCustomEndChange,
  totalOlderCount = 0,
  olderRecordsCount = 0,
  onViewOlder,
  onViewAll,
  className = '',
  compact = false,
}: DateQuickFilterBarProps) {
  const effectiveValue = value ?? activeFilter ?? 'TODAY';
  const effectiveOnChange = onChange ?? onFilterChange ?? (() => {});
  const effectiveOnViewOlder = onViewOlder ?? onViewAll;
  const effectiveOlderCount = totalOlderCount || olderRecordsCount;
  const [showCustomInputs, setShowCustomInputs] = useState(effectiveValue === 'CUSTOM');

  const options: { key: DateQuickFilter; label: string }[] = [
    { key: 'TODAY', label: 'Today' },
    { key: 'YESTERDAY', label: 'Yesterday' },
    { key: 'LAST_WEEK', label: 'Last Week' },
    { key: 'LAST_MONTH', label: 'Last Month' },
    { key: 'CUSTOM', label: 'Custom Date' },
    { key: 'ALL', label: 'All Time' },
  ];

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-slate-500 font-medium mr-1 text-[11px] uppercase tracking-wider shrink-0">
          Date:
        </span>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {options.map((opt) => {
            const isSelected = effectiveValue === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  effectiveOnChange(opt.key);
                  if (opt.key === 'CUSTOM') {
                    setShowCustomInputs(true);
                  } else {
                    setShowCustomInputs(false);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {effectiveOlderCount > 0 && effectiveValue === 'TODAY' && (
          <button
            type="button"
            onClick={() => {
              if (effectiveOnViewOlder) {
                effectiveOnViewOlder();
              } else {
                effectiveOnChange('LAST_WEEK');
              }
            }}
            className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-between sm:justify-start gap-1 px-2.5 py-1 sm:py-0.5 rounded-lg sm:rounded-full bg-amber-50 border border-amber-200/90 text-[11px] text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer mt-1 sm:mt-0"
            title="Older records exist in the database. Click to expand."
          >
            <span>⚡ {effectiveOlderCount} older record(s)</span>
            <span className="underline font-semibold">View</span>
          </button>
        )}
      </div>

      {showCustomInputs && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 animate-fadeIn">
          <div className="flex items-center justify-between sm:justify-start gap-1.5 flex-1">
            <span className="text-slate-500 text-[11px] font-medium shrink-0">From:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange?.(e.target.value)}
              className="flex-1 sm:flex-none px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-1.5 flex-1">
            <span className="text-slate-500 text-[11px] font-medium shrink-0">To:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange?.(e.target.value)}
              className="flex-1 sm:flex-none px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          {(customStart || customEnd) && (
            <button
              type="button"
              onClick={() => {
                onCustomStartChange?.('');
                onCustomEndChange?.('');
              }}
              className="text-[11px] text-slate-500 hover:text-rose-600 font-medium px-2 py-1 self-end sm:self-center"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
