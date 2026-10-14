import React from 'react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: string;
}

export function EmptyState({
  title = 'No items found',
  description = 'There are no records to display matching the current criteria.',
  action,
  icon = '📦',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center rounded-xl border border-dashed border-[#dbe3ee] bg-white shadow-xs">
      <div className="text-3xl mb-2.5">{icon}</div>
      <h3 className="text-sm font-semibold text-[#172033]">{title}</h3>
      <p className="text-xs text-[#5b6678] max-w-sm mt-0.5 mb-4">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

export default EmptyState;
