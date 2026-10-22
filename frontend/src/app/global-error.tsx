'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl mx-auto">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-slate-900">Application Failure</h1>
          <p className="text-xs text-slate-600">
            A critical initialization error occurred. Ledger data and records remain completely safe.
          </p>
          {error?.digest && (
            <p className="font-mono text-[10px] text-slate-400 bg-slate-50 p-2 rounded">
              Ref: {error.digest}
            </p>
          )}
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={() => reset()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 cursor-pointer"
            >
              Reload System
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 cursor-pointer"
            >
              Return Home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
