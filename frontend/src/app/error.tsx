'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Log unexpected project error to monitoring telemetry
    console.error('Unhandled application exception:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-rose-600 selection:text-white">
      {/* Precision Top Bar */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
            ⚠️
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-slate-900">Labco Operations</span>
            <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">System Safeguard</span>
          </div>
        </Link>

        <button
          onClick={() => window.location.reload()}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 transition-colors"
        >
          Reload Page
        </button>
      </header>

      {/* Main Stage */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-xl mx-auto text-center space-y-6 bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-10 shadow-xs">
          {/* Anomaly Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span className="font-mono">ERROR 500</span>
            <span className="text-rose-400">·</span>
            <span>SYSTEM RECOVERY ACTIVE</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              An unexpected application error occurred
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              The interface encountered an unhandled exception while executing this view. Database ledger commits and stock balances are unaffected.
            </p>
          </div>

          {error?.digest && (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] font-mono text-slate-600 max-w-md mx-auto text-left flex items-center justify-between">
              <span className="text-slate-400 uppercase tracking-wider text-[10px]">Reference Digest:</span>
              <span className="font-semibold text-slate-800 select-all">{error.digest}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-2">
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[42px] cursor-pointer"
            >
              🔄 Retry Operation
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm transition-colors min-h-[42px] cursor-pointer"
            >
              Hard Reload Page
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[42px]"
            >
              Return Home
            </Link>
          </div>

          {/* Developer / Diagnostics Details */}
          <div className="pt-4 border-t border-slate-100 text-left">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="text-[11px] text-slate-400 hover:text-slate-600 font-medium flex items-center gap-1 cursor-pointer"
            >
              <span>{showDetails ? '▼ Hide' : '▶ Show'} diagnostic details</span>
            </button>
            {showDetails && (
              <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-rose-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap max-h-48 scrollbar-thin">
                {error.message || 'Unknown runtime error'}
                {error.stack ? `\n\n${error.stack}` : ''}
              </pre>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-3 px-4 sm:px-8 text-center sm:flex sm:items-center sm:justify-between text-[11px] text-slate-500">
        <div>Continuous Ledger PITR Safeguard Active</div>
        <div className="mt-1 sm:mt-0">
          <Link href="/help" className="hover:text-slate-800 underline">
            Operations Help &amp; Support
          </Link>
        </div>
      </footer>
    </div>
  );
}
