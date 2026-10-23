'use client';

import React, { useState } from 'react';
import AppSidebar from './AppSidebar';
import TopBar from './TopBar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen min-w-0 flex overflow-x-clip bg-slate-50/60 text-slate-900 antialiased font-sans">
      {/* Primary Sidebar (Desktop persistent 260px, Mobile drawer) */}
      <AppSidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Viewport Region */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Contextual Top Bar */}
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        {/* Content Region */}
        <main className="dashboard-content bg-slate-50/60 sm:bg-grid-pattern min-w-0 flex-1 overflow-x-clip p-3 sm:p-7 lg:p-9 print:p-0 print:bg-white">
          <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 sm:space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardShell;
