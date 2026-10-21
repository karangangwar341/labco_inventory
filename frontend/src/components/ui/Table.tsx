import React from 'react';

export function Table({
  children,
  className = '',
  tableClassName = '',
}: {
  children: React.ReactNode;
  className?: string;
  tableClassName?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-2xs ${className}`}>
      <table className={`w-full min-w-[720px] md:min-w-full text-left border-collapse text-xs ${tableClassName}`}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  children,
  className = '',
  sticky = false,
}: {
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <thead
      className={`bg-slate-50/90 backdrop-blur-xs text-slate-500 font-semibold border-b border-slate-200/80 text-[11px] tracking-wider uppercase select-none ${
        sticky ? 'sticky top-0 z-10' : ''
      } ${className}`}
    >
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tbody className={`divide-y divide-slate-100 bg-white ${className}`}>
      {children}
    </tbody>
  );
}

export function TableRow({
  children,
  className = '',
  onClick,
  selected = false,
  striped = false,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  striped?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors duration-150 ${
        selected
          ? 'bg-blue-50/70 hover:bg-blue-50'
          : striped
          ? 'even:bg-slate-50/40 hover:bg-slate-50/70'
          : 'hover:bg-slate-50/70'
      } group ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  className = '',
  align = 'left',
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <th
      className={`py-3 px-4 font-semibold text-slate-500 text-[11px] whitespace-nowrap ${alignClasses[align]} ${className}`}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className = '',
  onClick,
  align = 'left',
  valign = 'middle',
  mono = false,
  numeric = false,
  compact = false,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  mono?: boolean;
  numeric?: boolean;
  compact?: boolean;
  colSpan?: number;
}) {
  const computedAlign = numeric ? 'right' : align;
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };
  const valignClasses = {
    top: 'align-top',
    middle: 'align-middle',
    bottom: 'align-bottom',
  };

  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      className={`${compact ? 'py-2 px-3' : 'py-3.5 px-4'} text-slate-700 text-xs ${valignClasses[valign]} ${
        alignClasses[computedAlign]
      } ${mono || numeric ? 'font-mono' : ''} ${
        numeric ? 'tabular-nums font-medium' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function TableEmptyState({
  colSpan,
  title = 'No records found',
  description = 'There are no items to display in this table.',
}: {
  colSpan: number;
  title?: string;
  description?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 px-4 text-center">
        <div className="max-w-xs mx-auto space-y-1">
          <p className="text-xs font-semibold text-slate-700">{title}</p>
          <p className="text-[11px] text-slate-400 leading-normal">{description}</p>
        </div>
      </td>
    </tr>
  );
}

export default Table;
