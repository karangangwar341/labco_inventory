'use client';

import React, { useState } from 'react';
import AppSidebar from './AppSidebar';
import TopBar from './TopBar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-slate-50/60 text-slate-900 antialiased font-sans">
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
        <main className="flex-1 p-5 sm:p-7 lg:p-9 overflow-x-hidden">
          <div className="max-w-[1600px] mx-auto w-full space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardShell;
