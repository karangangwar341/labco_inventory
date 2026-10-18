import React, { Suspense } from 'react';
import Image from 'next/image';
import { LoginForm } from '@/features/auth/components/LoginForm';

export const metadata = {
  title: 'Sign In | Labco Instruments - Diagnostic Warehouse Operations',
  description: 'Enterprise warehouse operations and inventory ledger portal for Labco Instruments.',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70 text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Top Corporate Navigation Bar */}
      <header className="w-full bg-white border-b border-slate-200/90 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="h-9 flex items-center">
              <Image
                src="/labco-logo.png"
                alt="Labco Instruments"
                width={160}
                height={42}
                className="h-8 w-auto object-contain"
                priority
              />
            </div>
            <div className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-200 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">WMS Operations</span>
              <span>·</span>
              <span>ISO 9001:2015 Certified System</span>
            </div>
          </div>

          {/* Operational Status */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-medium text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
              ISO 9001:2015
            </span>
          </div>
        </div>
      </header>

      {/* Main Split-Screen Section */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16 flex flex-col justify-center">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">

          {/* Left Column: Product & Operations Showcase */}
          <div className="lg:col-span-7 space-y-6">
            {/* Accreditation Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/90 text-xs font-semibold text-blue-800">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>Precision Medical Diagnostics &amp; Supply Chain</span>
              <span className="text-blue-300">|</span>
              <span className="text-blue-900 font-bold">ISO 9001:2015 Certified</span>
            </div>

            {/* Headline */}
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.14]">
                Diagnostic Warehouse <br />
                <span className="text-blue-700">Management &amp; Ledger</span> System
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                The centralized operational platform for Labco Instruments manufacturing facilities, regional distribution warehouses, and healthcare client facilities. Engineered for batch-level traceability, chain of custody, and verified delivery challans.
              </p>
            </div>


            {/* Quality Statement & Trust Indicators */}
            <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">ISO 9001:2015</span>
                <span>·</span>
                <span>Quality Management System</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span>256-Bit Transport Security</span>
                <span>·</span>
                <span className="text-blue-700 font-medium">Real-Time Ledger Reconciliation</span>
              </div>
            </div>
          </div>

          {/* Right Column: Authentication Card */}
          <div className="lg:col-span-5 flex justify-center items-center">
            <Suspense fallback={<div className="w-full max-w-md h-96 bg-white border border-slate-200/90 rounded-2xl shadow-xl animate-pulse" />}>
              <LoginForm />
            </Suspense>
          </div>

        </div>
      </main>

      {/* Corporate Footer */}
      <footer className="w-full bg-white border-t border-slate-200/90 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>© 2026 Labco Instruments Pvt. Ltd. All rights reserved.</span>
            <span>·</span>
            <span className="text-slate-600 font-medium">ISO 9001:2015 Quality Certified</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>Confidential &amp; Proprietary System</span>
            <span>·</span>
            <span>Authorized Access Only</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
