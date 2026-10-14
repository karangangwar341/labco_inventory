'use client';

import React, { useState } from 'react';
import AppSidebar from './AppSidebar';
import TopBar from './TopBar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-[#172033]">
      {/* Primary Sidebar (Desktop persistent 248px, Mobile drawer) */}
      <AppSidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Viewport Region */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Contextual Top Bar */}
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        {/* Content Region with subtle grid pattern */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-grid-pattern overflow-x-hidden">
          <div className="max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardShell;
