import React from 'react';
import { Button } from '../ui/Button';

export function ErrorState({
  title = 'Failed to load content',
  message = 'An unexpected error occurred while communicating with the server.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-[#fee4e2] bg-[#fef3f2]">
      <div className="text-2xl mb-2">⚠️</div>
      <h3 className="text-xs font-semibold text-[#b42318]">{title}</h3>
      <p className="text-xs text-[#b42318]/80 max-w-sm mt-0.5 mb-4">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
