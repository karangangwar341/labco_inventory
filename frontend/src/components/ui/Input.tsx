import React from 'react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1 w-full">
      {label && (
        <label className="text-xs font-medium text-[#172033] block">
          {label}
        </label>
      )}
      <input
        className={`w-full px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-xs text-[#172033] placeholder-[#5b6678]/60 focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] transition disabled:bg-[#f1f5f9] disabled:opacity-60 ${
          error ? 'border-[#b42318] focus:border-[#b42318] focus:ring-[#b42318]' : ''
        } ${className}`}
        {...props}
      />
      {error && <p className="text-[11px] text-[#b42318]">{error}</p>}
    </div>
  );
}

export default Input;
