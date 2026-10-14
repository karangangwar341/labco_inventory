import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

interface AlertNoticeProps {
  variant?: 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}

export function AlertNotice({
  variant = 'warning',
  title,
  message,
  actionHref,
  actionLabel,
}: AlertNoticeProps) {
  const isDanger = variant === 'danger';
  const isInfo = variant === 'info';

  const containerClasses = isDanger
    ? 'bg-[#fef3f2] border-[#fee4e2] text-[#b42318]'
    : isInfo
    ? 'bg-[#eff6ff] border-[#bfdbfe] text-[#2563eb]'
    : 'bg-[#fffbeb] border-[#fef3c7] text-[#a15c00]';

  return (
    <div
      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${containerClasses}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-lg">{isDanger ? '⚠️' : isInfo ? 'ℹ️' : '🔔'}</span>
        <div>
          <p className="font-bold">{title}</p>
          <p className="text-[#5b6678] mt-0.5 leading-relaxed">{message}</p>
        </div>
      </div>

      {actionHref && actionLabel && (
        <Link href={actionHref} className="shrink-0">
          <Button
            variant={isDanger ? 'danger' : 'secondary'}
            size="sm"
          >
            {actionLabel}
          </Button>
        </Link>
      )}
    </div>
  );
}

export default AlertNotice;
