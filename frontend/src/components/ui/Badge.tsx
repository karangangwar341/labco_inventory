import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'neutral';
  className?: string;
}

export function Badge({
  children,
  variant = 'neutral',
  className = '',
}: BadgeProps) {
  const variantStyles = {
    neutral: 'bg-[#f1f5f9] text-[#5b6678] border border-[#dbe3ee]',
    primary: 'bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]',
    success: 'bg-[#ecfdf3] text-[#18794e] border border-[#bbf7d0]',
    warning: 'bg-[#fffbeb] text-[#a15c00] border border-[#fef3c7]',
    danger: 'bg-[#fef3f2] text-[#b42318] border border-[#fee4e2]',
    purple: 'bg-[#f5f3ff] text-[#6d28d9] border border-[#ddd6fe]',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
