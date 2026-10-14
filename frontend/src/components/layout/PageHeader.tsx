import React from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#dbe3ee]">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-[#172033] tracking-tight">
            {title}
          </h2>
          {badge && (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#eff6ff] text-[#2563eb] border border-[#dbe3ee]">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-[#5b6678] mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export default PageHeader;
