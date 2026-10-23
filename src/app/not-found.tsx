import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
      {/* Precision Top Bar */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-xs group-hover:bg-blue-700 transition-colors">
            🧪
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-slate-900">Labco Instruments</span>
            <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">Operations Ledger</span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 transition-colors"
          >
            <span>Dashboard</span>
            <span>→</span>
          </Link>
        </div>
      </header>

      {/* Main 404 Stage */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-2xl mx-auto text-center space-y-6">
          {/* Diagnostic Beacon Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-mono">ERROR 404</span>
            <span className="text-amber-400">·</span>
            <span>ROUTING EXCEPTION</span>
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Operational view could not be located
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              The requested URL path does not correspond to an active module or catalog entity. Your session credentials and physical ledger balances are completely safe.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition-all min-h-[42px]"
            >
              Return to Safe Dashboard
            </Link>
            <Link
              href="/inventory"
              className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/90 font-semibold text-xs sm:text-sm shadow-xs transition-all min-h-[42px]"
            >
              Search Active Inventory
            </Link>
          </div>

          {/* Quick Routing Directory */}
          <div className="pt-8 text-left">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-1 text-center sm:text-left">
              Direct Module Navigation
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                href="/inventory"
                className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-xs transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-base group-hover:scale-105 transition-transform">
                    📦
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Stock &amp; Inventory
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Usable, reserved, and quarantine levels
                    </p>
                  </div>
                </div>
              </Link>

              <Link
                href="/catalog"
                className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-xs transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-base group-hover:scale-105 transition-transform">
                    🏷️
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                      Product Catalog
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Assays, reagents, and brand taxonomies
                    </p>
                  </div>
                </div>
              </Link>

              <Link
                href="/manufacturing"
                className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-xs transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center text-base group-hover:scale-105 transition-transform">
                    🏭
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      Manufacturing &amp; BOMs
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Continuous runs and formulation batches
                    </p>
                  </div>
                </div>
              </Link>

              <Link
                href="/shipments"
                className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-xs transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center text-base group-hover:scale-105 transition-transform">
                    🚚
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                      Inbound Logistics
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Shipment tracking and stock receipts
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-3 px-4 sm:px-8 text-center sm:flex sm:items-center sm:justify-between text-[11px] text-slate-500">
        <div className="flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Ledger Engine Operational · Continuous WAL Active</span>
        </div>
        <div className="mt-2 sm:mt-0 flex items-center justify-center gap-4">
          <Link href="/help" className="hover:text-slate-800 transition-colors underline">
            Help Center
          </Link>
          <span>·</span>
          <Link href="/departments" className="hover:text-slate-800 transition-colors">
            Departments
          </Link>
        </div>
      </footer>
    </div>
  );
}
