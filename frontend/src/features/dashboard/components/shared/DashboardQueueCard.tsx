import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

interface DashboardQueueCardProps {
  title: string;
  description: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  action?: React.ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  children?: React.ReactNode;
}

export function DashboardQueueCard({
  title,
  description,
  viewAllHref,
  viewAllLabel = 'Open Queue →',
  action,
  emptyMessage = 'No active items in queue.',
  isEmpty = false,
  children,
}: DashboardQueueCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#dbe3ee] p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[#dbe3ee] gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#172033]">{title}</h3>
          <p className="text-xs text-[#5b6678] mt-0.5">{description}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {action}
          {viewAllHref && (
            <Link href={viewAllHref}>
              <Button variant="secondary" size="sm">
                {viewAllLabel}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="py-8 text-center text-xs text-[#5b6678]">
          {emptyMessage}
        </div>
      ) : (
        <div className="divide-y divide-[#dbe3ee] text-xs">{children}</div>
      )}
    </div>
  );
}

export default DashboardQueueCard;
