import React from 'react';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'quiet' | 'danger' | 'ghost' | 'warning' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5 font-medium',
    md: 'px-3.5 py-2 text-xs gap-2 font-medium',
    lg: 'px-4 py-2.5 text-sm gap-2.5 font-medium',
  };

  let variantClasses = '';
  switch (variant) {
    case 'secondary':
      variantClasses =
        'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm focus-visible:ring-blue-500/30';
      break;
    case 'destructive':
    case 'danger':
      variantClasses =
        'bg-red-600 hover:bg-red-700 text-white shadow-xs hover:shadow-sm focus-visible:ring-red-500/40 border border-transparent';
      break;
    case 'quiet':
    case 'ghost':
      variantClasses =
        'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 focus-visible:ring-blue-500/30';
      break;
    case 'warning':
      variantClasses =
        'bg-amber-600 hover:bg-amber-700 text-white shadow-xs hover:shadow-sm focus-visible:ring-amber-500/40 border border-transparent';
      break;
    case 'success':
      variantClasses =
        'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-sm focus-visible:ring-emerald-500/40 border border-transparent';
      break;
    case 'primary':
    default:
      variantClasses =
        'bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-sm shadow-blue-500/10 focus-visible:ring-blue-500/40 border border-transparent';
      break;
  }

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${sizeStyles[size]} ${variantClasses} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-1.5">
          <svg
            className="animate-spin h-3.5 w-3.5 text-current"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <span>Loading...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export default Button;
