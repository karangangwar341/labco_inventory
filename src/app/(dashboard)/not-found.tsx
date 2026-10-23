import React from 'react';
import Link from 'next/link';

export default function DashboardNotFound() {
  return (
    <div className="py-12 sm:py-20 flex flex-col items-center justify-center text-center">
      <div className="w-full max-w-lg mx-auto bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/80 mx-auto flex items-center justify-center text-2xl shadow-2xs">
          🧭
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-mono font-semibold">
            <span>404 NOT FOUND</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Record or View Not Located
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            The requested entity ID, catalog item, or operational view does not exist in the database or may have been deleted.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-2">
          <Link
            href="/inventory"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors min-h-[38px]"
          >
            Go to Stock Inventory
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 font-semibold text-xs shadow-xs transition-colors min-h-[38px]"
          >
            Return to Overview
          </Link>
        </div>

        <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-center gap-2">
          <span>Need help?</span>
          <Link href="/help" className="text-blue-600 hover:underline font-medium">
            Contact Support &amp; View Docs
          </Link>
        </div>
      </div>
    </div>
  );
}
