import React from 'react';
import Link from 'next/link';

interface StatWidgetProps {
  label: string;
  value: string | number;
  subtext?: string;
  badge?: {
    text: string;
    variant: 'success' | 'warning' | 'danger' | 'primary' | 'neutral';
  };
  href?: string;
}

export function StatWidget({
  label,
  value,
  subtext,
  badge,
  href,
}: StatWidgetProps) {
  const content = (
    <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-xs space-y-1.5 transition hover:border-slate-300">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#5b6678] uppercase tracking-wider">
          {label}
        </span>
        {badge && (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              badge.variant === 'success'
                ? 'bg-[#ecfdf3] text-[#18794e]'
                : badge.variant === 'warning'
                ? 'bg-[#fffbeb] text-[#a15c00]'
                : badge.variant === 'danger'
                ? 'bg-[#fef3f2] text-[#b42318]'
                : badge.variant === 'primary'
                ? 'bg-[#eff6ff] text-[#2563eb]'
                : 'bg-[#f1f5f9] text-[#5b6678]'
            }`}
          >
            {badge.text}
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-[#172033] tracking-tight">{value}</p>
      {subtext && <p className="text-[11px] text-[#5b6678]">{subtext}</p>}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}

export default StatWidget;
