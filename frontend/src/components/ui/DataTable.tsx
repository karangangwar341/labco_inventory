'use client';

import React, { useState, useEffect } from 'react';

export interface ColumnDef<T> {
  id: string;
  header: React.ReactNode | ((info: { data: T[] }) => React.ReactNode);
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => React.ReactNode;
  width?: string; // e.g. 'w-[20%]' or 'w-48'
  minWidth?: string; // e.g. 'min-w-[180px]'
  maxWidth?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor?: (item: T, index: number) => string;
  isLoading?: boolean;
  loadingMessage?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyState?: {
    title?: string;
    description?: string;
    action?: React.ReactNode;
    icon?: React.ReactNode;
  };
  onRowClick?: (item: T) => void;
  stickyHeader?: boolean;
  minWidth?: string; // e.g. 'min-w-[1000px]' (default 'min-w-[960px]')
  tableLayout?: 'auto' | 'fixed'; // default 'fixed'
  className?: string;
  striped?: boolean;
  // Optional client-side pagination
  pagination?: {
    pageSize?: number;
    pageSizeOptions?: number[];
    showSummary?: boolean;
  };
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  loadingMessage,
  emptyTitle,
  emptyDescription,
  emptyState,
  onRowClick,
  stickyHeader = true,
  minWidth = 'min-w-[960px]',
  tableLayout = 'fixed',
  className = '',
  striped = false,
  pagination,
}: DataTableProps<T>) {
  const [pageSize, setPageSize] = useState(pagination?.pageSize || 20);
  const [currentPage, setCurrentPage] = useState(1);

  // Sync pageSize if prop changes
  useEffect(() => {
    if (pagination?.pageSize) {
      setPageSize(pagination.pageSize);
    }
  }, [pagination?.pageSize]);

  // Reset to page 1 if data length shrinks
  useEffect(() => {
    setCurrentPage(1);
  }, [data.length]);

  // Pagination logic if enabled
  const isPaginated = !!pageSize;
  const totalItems = data.length;
  const totalPages = isPaginated ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1;
  const activePage = Math.min(currentPage, totalPages);

  const displayedData = isPaginated
    ? data.slice((activePage - 1) * pageSize, activePage * pageSize)
    : data;
  // Action columns already provide explicit controls (such as Inspect/Edit).
  // Avoid making their containing mobile card a button, which would nest
  // interactive controls and create ambiguous keyboard/screen-reader behavior.
  const mobileCardsClickable = Boolean(onRowClick) && !columns.some((column) => column.id === 'actions');

  const startItem = totalItems === 0 ? 0 : (activePage - 1) * pageSize + 1;
  const endItem = Math.min(activePage * pageSize, totalItems);

  const alignMap = {
    left: 'text-left justify-start',
    center: 'text-center justify-center',
    right: 'text-right justify-end',
  };

  const valignMap = {
    top: 'align-top',
    middle: 'align-middle',
    bottom: 'align-bottom',
  };

  return (
    <div className={`w-full flex flex-col rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden ${className}`}>
      <div className="grid gap-3 p-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={`mobile-skeleton-${index}`} className="animate-pulse rounded-xl border border-slate-200 p-4 space-y-3" aria-hidden="true">
              <div className="h-4 w-2/5 rounded bg-slate-100" />
              <div className="h-3 w-3/4 rounded bg-slate-100" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          ))
        ) : displayedData.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <h3 className="text-sm font-semibold text-slate-800">
              {emptyState?.title || emptyTitle || 'No records found'}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {emptyState?.description || emptyDescription || 'There are no items matching the active filters.'}
            </p>
            {emptyState?.action && <div className="pt-3">{emptyState.action}</div>}
          </div>
        ) : (
          displayedData.map((item, rowIdx) => {
            const rowKey = keyExtractor
              ? keyExtractor(item, rowIdx)
              : (item as any)?.id || `row-${rowIdx}`;
            const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
              if (!mobileCardsClickable || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              onRowClick?.(item);
            };

            return (
              <article
                key={`mobile-${rowKey}`}
                onClick={mobileCardsClickable ? () => onRowClick?.(item) : undefined}
                onKeyDown={handleKeyDown}
                role={mobileCardsClickable ? 'button' : undefined}
                tabIndex={mobileCardsClickable ? 0 : undefined}
                className={`min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 ${
                  mobileCardsClickable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2' : ''
                }`}
              >
                <div className="space-y-3">
                  {columns.map((col, columnIndex) => {
                    const header = typeof col.header === 'function' ? col.header({ data }) : col.header;
                    let cellContent: React.ReactNode = null;
                    if (col.cell) {
                      cellContent = col.cell(item, rowIdx);
                    } else if (col.accessorKey) {
                      cellContent = String((item as any)[col.accessorKey] ?? '');
                    }

                    return (
                      <div
                        key={`${rowKey}-mobile-${col.id}`}
                        className={`min-w-0 ${columnIndex === 0 ? 'border-b border-slate-100 pb-3' : ''} ${col.id === 'actions' ? 'pt-1' : ''}`}
                      >
                        {columnIndex !== 0 && (
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {header}
                          </div>
                        )}
                        <div className="min-w-0 break-words text-sm text-slate-800 [&_*]:max-w-full [&_*]:break-words">
                          {cellContent}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Horizontal Scroll Viewport Container */}
      <div className="hidden w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent md:block">
        <table
          className={`w-full border-collapse text-xs ${minWidth} ${
            tableLayout === 'fixed' ? 'table-fixed' : 'table-auto'
          }`}
        >
          {tableLayout === 'fixed' && (
            <colgroup>
              {columns.map((col) => {
                const isTailwindWidth = col.width?.startsWith('w-');
                const styleWidth = isTailwindWidth ? undefined : col.width;
                return (
                  <col
                    key={`col-${col.id}`}
                    style={styleWidth ? { width: styleWidth } : undefined}
                    className={`${col.width || ''} ${col.minWidth || ''}`}
                  />
                );
              })}
            </colgroup>
          )}

          {/* Table Header */}
          <thead
            className={`bg-slate-50/90 backdrop-blur-xs text-slate-500 font-semibold border-b border-slate-200/80 text-[11px] tracking-wider uppercase select-none ${
              stickyHeader ? 'sticky top-0 z-10' : ''
            }`}
          >
            <tr>
              {columns.map((col) => {
                const alignCls = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                const isTailwindWidth = col.width?.startsWith('w-');
                const isTailwindMinWidth = col.minWidth?.startsWith('min-w-');
                const cellStyle: React.CSSProperties = {
                  ...(isTailwindWidth ? {} : { width: col.width }),
                  ...(isTailwindMinWidth ? {} : { minWidth: col.minWidth }),
                  ...(col.maxWidth && !col.maxWidth.startsWith('max-w-') ? { maxWidth: col.maxWidth } : {}),
                };
                return (
                  <th
                    key={col.id}
                    style={cellStyle}
                    className={`py-3 px-3.5 font-semibold text-slate-500 text-[11px] ${alignCls} ${
                      isTailwindWidth ? col.width : ''
                    } ${isTailwindMinWidth ? col.minWidth : ''} ${col.maxWidth || ''} ${col.headerClassName || ''}`}
                  >
                    {typeof col.header === 'function' ? col.header({ data }) : col.header}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              // Loading Skeleton State
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse">
                  {columns.map((col, colIdx) => (
                    <td key={`skeleton-cell-${colIdx}`} className="py-4 px-4 align-top">
                      <div
                        className="h-4 bg-slate-100 rounded-md"
                        style={{ width: `${Math.max(40, 90 - colIdx * 15)}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayedData.length === 0 ? (
              // Empty State Row
              <tr>
                <td colSpan={columns.length} className="py-14 px-6 text-center">
                  <div className="max-w-md mx-auto space-y-2">
                    {emptyState?.icon && (
                      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                        {emptyState.icon}
                      </div>
                    )}
                    <h3 className="text-sm font-semibold text-slate-800">
                      {emptyState?.title || emptyTitle || 'No records found'}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {emptyState?.description || emptyDescription || 'There are no items matching the active filters.'}
                    </p>
                    {emptyState?.action && <div className="pt-2">{emptyState.action}</div>}
                  </div>
                </td>
              </tr>
            ) : (
              // Data Rows
              displayedData.map((item, rowIdx) => {
                const rowKey = keyExtractor
                  ? keyExtractor(item, rowIdx)
                  : (item as any)?.id || `row-${rowIdx}`;

                return (
                  <tr
                    key={rowKey}
                    onClick={() => onRowClick?.(item)}
                    className={`transition-colors duration-150 group ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${
                      striped && rowIdx % 2 === 1
                        ? 'bg-slate-50/40 hover:bg-slate-100/60'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    {columns.map((col) => {
                      const alignCls =
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                      const valignCls = valignMap[col.valign || 'top'];

                      let cellContent: React.ReactNode = null;
                      if (col.cell) {
                        cellContent = col.cell(item, rowIdx);
                      } else if (col.accessorKey) {
                        cellContent = String((item as any)[col.accessorKey] ?? '');
                      }

                      const isTailwindWidth = col.width?.startsWith('w-');
                      const isTailwindMinWidth = col.minWidth?.startsWith('min-w-');
                      const cellStyle: React.CSSProperties = {
                        ...(isTailwindWidth ? {} : { width: col.width }),
                        ...(isTailwindMinWidth ? {} : { minWidth: col.minWidth }),
                        ...(col.maxWidth && !col.maxWidth.startsWith('max-w-') ? { maxWidth: col.maxWidth } : {}),
                      };

                      return (
                        <td
                          key={`${rowKey}-${col.id}`}
                          style={cellStyle}
                          className={`py-3.5 px-3.5 text-slate-700 text-xs ${valignCls} ${alignCls} ${
                            isTailwindWidth ? col.width : ''
                          } ${isTailwindMinWidth ? col.minWidth : ''} ${col.maxWidth || ''} ${col.className || ''}`}
                        >
                          {cellContent}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {isPaginated && totalItems > 0 && (
        <div className="py-2.5 px-3 sm:px-4 bg-slate-50/70 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div>
              Showing <span className="font-semibold text-slate-700">{startItem}</span> to{' '}
              <span className="font-semibold text-slate-700">{endItem}</span> of{' '}
              <span className="font-semibold text-slate-700">{totalItems}</span> entries
            </div>

            {pagination?.pageSizeOptions && pagination.pageSizeOptions.length > 0 && (
              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                <span className="text-slate-500">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-0.5 rounded border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  {pagination.pageSizeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={activePage <= 1}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
                title="First Page"
              >
                «
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={activePage <= 1}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
              >
                Previous
              </button>
              <span className="px-2 text-slate-600 font-medium">
                Page {activePage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={activePage >= totalPages}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={activePage >= totalPages}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
                title="Last Page"
              >
                »
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DataTable;
