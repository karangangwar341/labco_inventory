import React from 'react';
import { Button } from '../ui/Button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  totalItems?: number;
}

export function Pagination({ page, totalPages, onPageChange, totalItems }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-[#dbe3ee] bg-white rounded-b-lg text-xs">
      <div className="text-[#5b6678]">
        Page <span className="font-semibold text-[#172033]">{page}</span> of{' '}
        <span className="font-semibold text-[#172033]">{totalPages}</span>
        {totalItems !== undefined && (
          <span className="ml-2 text-[#5b6678]/80">({totalItems} total items)</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default Pagination;
