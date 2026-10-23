import React from 'react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label className="text-xs font-medium text-slate-700 block">
          {label}
        </label>
      )}
      <input
        className={`w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 shadow-2xs transition-all duration-150 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/15'
            : 'hover:border-slate-300'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-[11px] text-red-600 font-medium">{error}</p>}
      {helperText && !error && <p className="text-[11px] text-slate-500">{helperText}</p>}
    </div>
  );
}

export default Input;
