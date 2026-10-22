'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DashboardErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error('Dashboard component error:', error);
  }, [error]);

  return (
    <div className="py-10 sm:py-16 flex flex-col items-center justify-center text-center">
      <div className="w-full max-w-lg mx-auto bg-white border border-rose-200/80 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200/80 mx-auto flex items-center justify-center text-2xl shadow-2xs">
          ⚠️
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-mono font-semibold">
            <span>MODULE ERROR</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Component Failed to Render
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            A runtime error occurred in this module. Inventory data and your active authentication session are fully secure.
          </p>
        </div>

        {error?.digest && (
          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-[10px] font-mono text-slate-500 flex items-center justify-between">
            <span>Digest:</span>
            <span className="font-semibold text-slate-800">{error.digest}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-1">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors min-h-[38px] cursor-pointer"
          >
            🔄 Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors min-h-[38px] cursor-pointer"
          >
            Reload Module
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 font-semibold text-xs transition-colors min-h-[38px]"
          >
            Overview
          </Link>
        </div>

        <div className="pt-3 border-t border-slate-100 text-left">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-[11px] text-slate-400 hover:text-slate-600 font-medium flex items-center gap-1 cursor-pointer"
          >
            <span>{showDetails ? '▼ Hide' : '▶ Show'} stack details</span>
          </button>
          {showDetails && (
            <pre className="mt-2 p-2.5 rounded-lg bg-slate-900 text-rose-300 font-mono text-[10px] overflow-x-auto whitespace-pre-wrap max-h-36 scrollbar-thin">
              {error.message || 'Unknown error'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
