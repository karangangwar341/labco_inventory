import React from 'react';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Textarea({
  label,
  error,
  helperText,
  className = '',
  disabled,
  id,
  rows = 3,
  ...props
}: TextareaProps) {
  const generatedId = React.useId();
  const textareaId = id || generatedId;

  return (
    <div className="space-y-1.5 w-full text-left">
      {label && (
        <label
          htmlFor={textareaId}
          className="text-xs font-medium text-slate-700 block tracking-tight"
        >
          {label}
          {props.required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        disabled={disabled}
        className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-xs text-slate-900 placeholder-slate-400 shadow-2xs transition-all duration-150 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
          error
            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
            : 'border-slate-200 hover:border-slate-300'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}
      {helperText && !error && (
        <p className="text-[11px] text-slate-500 leading-normal">{helperText}</p>
      )}
    </div>
  );
}

export default Textarea;
