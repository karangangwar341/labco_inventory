import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'neutral';
  size?: 'sm' | 'md';
  withDot?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  withDot = false,
  className = '',
}: BadgeProps) {
  const variantStyles = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200/80',
    primary: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  const dotStyles = {
    neutral: 'bg-slate-400',
    primary: 'bg-blue-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    purple: 'bg-purple-500',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.2 text-[10px]',
    md: 'px-2.5 py-0.5 text-[11px]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium border shadow-2xs select-none ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {withDot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]}`} />
      )}
      <span>{children}</span>
    </span>
  );
}

export default Badge;
