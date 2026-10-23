'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { MAIN_DOMAINS, HELP_NAV_ITEM, getActiveDomain, NavIconName, MainDomain } from './navigation';
import { useAuth } from '../../features/auth/auth.store';

interface AppSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

function renderIcon(iconName: NavIconName, isActive: boolean) {
  const cls = `w-4 h-4 shrink-0 transition-colors duration-150 ${
    isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
  }`;

  switch (iconName) {
    case 'overview':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'requests':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'manufacturing':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'catalog':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    case 'reports':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case 'settings':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      );
    case 'users':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'help':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.7 9a2.35 2.35 0 114.02 1.66c-.86.86-1.72 1.04-1.72 2.34M12 16.5h.01" />
        </svg>
      );
    default:
      return null;
  }
}

export function AppSidebar({ isOpen = false, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const { user, role, logout } = useAuth();

  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';
  const activeDomain = getActiveDomain(pathname);

  // Visible domains for this role
  const visibleDomains = MAIN_DOMAINS.filter(
    (domain) => !domain.roles || (role && domain.roles.includes(role))
  );

  const desktopSidebarContent = (
    <div className="w-[230px] h-full flex flex-col justify-between bg-slate-950 text-slate-100 select-none border-r border-slate-800/80 shadow-sm">
      {/* Brand Header */}
      <div>
        <div className="h-16 px-3 flex items-center justify-between border-b border-slate-800/80 bg-slate-950">
          <Link href="/" className="flex items-center gap-2 group w-full">
            <div className="h-9 px-2 py-1 rounded bg-white flex items-center justify-center shadow-xs ring-1 ring-white/20 group-hover:ring-blue-500/40 transition-all duration-150 shrink-0">
              <Image
                src="/labco-logo.png"
                alt="Labco Instruments"
                width={80}
                height={22}
                className="h-5 w-auto object-contain"
                priority
              />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-xs text-white tracking-tight leading-none truncate">WMS Console</span>
              </div>
              <span className="text-[9px] text-slate-400 font-normal mt-0.5 truncate">Operations &amp; Logistics</span>
            </div>
          </Link>
        </div>

        {/* Level 1: Main Domains Navigation */}
        <div className="p-3">
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Main Navigation
          </div>
          <nav className="space-y-1 mt-1" aria-label="Main Navigation Domains">
            {visibleDomains.map((domain: MainDomain) => {
              const isActive = activeDomain?.id === domain.id;

              return (
                <Link
                  key={domain.id}
                  href={domain.defaultHref}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600/20 text-white font-semibold shadow-xs ring-1 ring-blue-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {renderIcon(domain.iconName, isActive)}
                    <span className="truncate">{domain.label}</span>
                  </div>

                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Sidebar Footer: Help & User Account */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950 space-y-2">
        <Link
          href={HELP_NAV_ITEM.href}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            pathname === HELP_NAV_ITEM.href
              ? 'bg-blue-600/20 text-blue-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          {renderIcon('help', pathname === HELP_NAV_ITEM.href)}
          <span className="truncate">How to use system</span>
        </Link>

        {user ? (
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="relative shrink-0">
                <div className="w-7 h-7 rounded-full bg-slate-800 text-blue-400 font-bold text-xs flex items-center justify-center ring-1 ring-slate-700">
                  {userInitial}
                </div>
                <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate leading-tight">{user.username}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-slate-400 font-medium truncate">
                    {user.role}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign out of account"
              className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
              aria-label="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="block text-center px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors shadow-xs"
          >
            Sign In
          </Link>
        )}
      </div>
    </div>
  );

  // Mobile Drawer (Shows main domains and their contextual sub-items)
  const mobileDrawerContent = (
    <div className="w-[280px] h-full flex flex-col justify-between bg-slate-950 text-slate-100 select-none">
      <div>
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-8 px-2 py-0.5 rounded bg-white flex items-center justify-center shadow-xs">
              <Image
                src="/labco-logo.png"
                alt="Labco Instruments"
                width={80}
                height={20}
                className="h-4.5 w-auto object-contain"
              />
            </div>
            <span className="font-semibold text-xs text-white">WMS Operations</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-140px)]" aria-label="Mobile Navigation">
          {visibleDomains.map((domain) => {
            const isDomainActive = activeDomain?.id === domain.id;
            const subItems = domain.subItems.filter(
              (sub) => !sub.roles || (role && sub.roles.includes(role))
            );

            return (
              <div key={domain.id} className="space-y-1">
                <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>{domain.label}</span>
                  {isDomainActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </div>

                <div className="space-y-0.5 pl-1">
                  {subItems.map((item) => {
                    const isSubActive = item.exact
                      ? pathname === item.href
                      : pathname === item.href || (item.href !== '/' && pathname?.startsWith(`${item.href}/`));

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                          isSubActive
                            ? 'bg-blue-600/25 text-blue-300 font-semibold'
                            : 'text-slate-300 hover:text-white hover:bg-slate-900'
                        }`}
                      >
                        <span className="w-1 h-1 rounded-full bg-slate-600" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-slate-800">
        <button
          onClick={logout}
          className="w-full text-center px-3 py-2 text-xs font-semibold text-rose-400 bg-rose-500/10 rounded-lg hover:bg-rose-500/20"
        >
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="print:hidden hidden lg:block shrink-0 sticky top-0 h-screen z-30">
        {desktopSidebarContent}
      </aside>

      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex animate-fadeIn">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="relative flex-1 flex flex-col max-w-[280px] w-full bg-slate-950 shadow-2xl z-50">
            {mobileDrawerContent}
          </div>
        </div>
      )}
    </>
  );
}

export default AppSidebar;
