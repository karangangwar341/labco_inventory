import React from 'react';

export function Table({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-[#dbe3ee] bg-white shadow-xs ${className}`}>
      <table className="w-full text-left border-collapse text-xs">
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
    <thead className={`bg-[#f8fafc] text-[#5b6678] font-semibold border-b border-[#dbe3ee] uppercase text-[11px] tracking-wider ${sticky ? 'sticky top-0 z-10' : ''} ${className}`}>
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
  return <tbody className={`divide-y divide-[#dbe3ee] bg-white ${className}`}>{children}</tbody>;
}

export function TableRow({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={`transition hover:bg-[#f8fafc] ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`py-2.5 px-3.5 text-left font-semibold text-[#5b6678] ${className}`}>{children}</th>;
}

export function TableCell({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <td onClick={onClick} className={`py-2.5 px-3.5 text-[#172033] ${className}`}>
      {children}
    </td>
  );
}

export default Table;
