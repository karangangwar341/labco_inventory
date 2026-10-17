import React from 'react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function EmptyState({
  title = 'No items found',
  description = 'There are no records to display matching the current criteria.',
  action,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-slate-200 bg-white/70 backdrop-blur-xs transition-all duration-200">
      <div className="w-12 h-12 rounded-full bg-slate-100 ring-8 ring-slate-50 flex items-center justify-center text-slate-400 mb-3.5">
        {icon ? (
          typeof icon === 'string' ? (
            <span className="text-xl">{icon}</span>
          ) : (
            icon
          )
        ) : (
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        )}
      </div>
      <h3 className="text-sm font-semibold text-slate-800 tracking-tight">{title}</h3>
      <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5 leading-relaxed">{description}</p>
      {action && <div className="inline-flex items-center gap-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
