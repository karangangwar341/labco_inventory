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
    'inline-flex items-center justify-center font-medium rounded-md transition select-none disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1';

  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-xs',
    lg: 'px-4 py-2.5 text-sm',
  };

  // Standard variants: primary, secondary, destructive, quiet
  let variantClasses = '';
  switch (variant) {
    case 'secondary':
      variantClasses = 'bg-white hover:bg-[#f8fafc] text-[#172033] border border-[#dbe3ee] shadow-xs focus:ring-[#2563eb]';
      break;
    case 'destructive':
    case 'danger':
      variantClasses = 'bg-[#b42318] hover:bg-[#911b12] text-white shadow-xs focus:ring-[#b42318]';
      break;
    case 'quiet':
    case 'ghost':
      variantClasses = 'bg-transparent hover:bg-[#f1f5f9] text-[#5b6678] hover:text-[#172033] focus:ring-[#2563eb]';
      break;
    case 'warning':
      variantClasses = 'bg-[#a15c00] hover:bg-[#854d00] text-white shadow-xs focus:ring-[#a15c00]';
      break;
    case 'success':
      variantClasses = 'bg-[#18794e] hover:bg-[#13613e] text-white shadow-xs focus:ring-[#18794e]';
      break;
    case 'primary':
    default:
      variantClasses = 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-xs focus:ring-[#2563eb]';
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
