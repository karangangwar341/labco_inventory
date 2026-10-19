'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../features/auth/auth.store';
import { getActiveDomain, SubNavItem } from './navigation';
import { notificationsService } from '../../features/notifications/notifications.service';
import { InAppNotification } from '../../features/notifications/notifications.types';
import { inventoryService } from '../../features/inventory/inventory.service';

interface TopBarProps {
  onOpenMobileMenu?: () => void;
  actions?: React.ReactNode;
}

export function TopBar({ onOpenMobileMenu, actions }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role } = useAuth();

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);

  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Close notifications dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch notifications and low-stock telemetry
  const fetchTelemetry = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoadingNotifs(true);
      const res = await notificationsService.getNotifications({ limit: 10 });
      setNotifications(res?.notifications || []);
      setUnreadCount(res?.unreadCount || 0);
    } catch {
      // Handled gracefully
    } finally {
      setIsLoadingNotifs(false);
    }

    try {
      const res = await inventoryService.getLowStockCount();
      setLowStockCount(res?.count ?? 0);
    } catch {
      // Handled gracefully
    }
  }, [user]);

  useEffect(() => {
    const initialFetchId = window.setTimeout(() => void fetchTelemetry(), 0);
    const intervalId = window.setInterval(() => void fetchTelemetry(), 45_000);

    return () => {
      window.clearTimeout(initialFetchId);
      window.clearInterval(intervalId);
    };
  }, [fetchTelemetry]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationsService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsService.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  // Active domain and its sub-navigation items
  const activeDomain = getActiveDomain(pathname);
  const visibleSubItems = (activeDomain?.subItems || []).filter(
    (item: SubNavItem) => !item.roles || (role && item.roles.includes(role))
  );

  return (
    <header className="sticky top-0 z-20 flex h-16 min-w-0 items-center justify-between gap-1 border-b border-slate-200/80 bg-white/95 px-2 backdrop-blur-md transition-colors sm:gap-3 sm:px-6 lg:px-8">
      {/* 1. Left Region: Mobile Trigger + Active Domain Context */}
      <div className="flex min-w-0 shrink items-center gap-1 sm:gap-3">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:hidden"
            aria-label="Open navigation menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <span className="max-w-[8.5rem] truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:max-w-none sm:text-xs sm:tracking-wider">
            {activeDomain?.label || 'Workspace'}
          </span>
          <span className="hidden text-slate-300 sm:inline">/</span>
        </div>
      </div>

      {/* 2. Middle Region: SUB-NAVIGATION BAR (Contextual to active main domain) */}
      <nav
        aria-label={`${activeDomain?.label || 'Module'} Sub-Navigation`}
        className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-slate-100/70 border border-slate-200/60 rounded-xl"
      >
        {visibleSubItems.map((item: SubNavItem) => {
          const isSubActive = item.exact
            ? pathname === item.href
            : pathname === item.href || (item.href !== '/' && pathname?.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 ${
                isSubActive
                  ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* 3. Right Region: Actions + Operational Status + Notification Bell + Role */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        {/* Operational Telemetry Badge */}
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/80 text-[11px] font-medium text-slate-600">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Operational</span>
        </div>

        {/* Low-Stock Threshold Permanent Badge Reminder */}
        {lowStockCount > 0 && (
          <Link
            href="/inventory?filter=LOW_STOCK"
            className="group flex max-w-[7rem] items-center gap-1 rounded-full border border-rose-200/90 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 shadow-2xs transition-colors hover:bg-rose-100 sm:max-w-none sm:gap-1.5 sm:px-2.5 sm:text-[11px]"
            title={`${lowStockCount} item${lowStockCount > 1 ? 's' : ''} below minimum stock threshold! Click to view in inventory.`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
            </span>
            <span className="font-medium tracking-tight sm:hidden">{lowStockCount} low</span>
            <span className="hidden font-medium tracking-tight sm:inline">⚠️ {lowStockCount} Low Stock</span>
          </Link>
        )}

        {/* Notification Bell */}
        <div className="relative" ref={notifDropdownRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) fetchTelemetry();
            }}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors relative"
            aria-label="View system notifications"
            title="System notifications"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="animate-popover absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-1rem))] origin-top-right space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 text-xs shadow-xl sm:w-[420px]">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {isLoadingNotifs ? (
                <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                  <span>Loading alerts...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <svg className="w-8 h-8 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span>No new notifications</span>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto scrollbar-thin">
                  {notifications.map((n) => {
                    // Determine direct action link based on entity and user role
                    let targetLink: { href: string; label: string } | null = null;

                    if (
                      n.entityType === 'PRODUCTION_RUN' ||
                      n.title.toLowerCase().includes('production')
                    ) {
                      targetLink = {
                        href:
                          role === 'SUPER_ADMIN'
                            ? `/approvals?tab=MANUFACTURING${n.entityId ? `&id=${encodeURIComponent(n.entityId)}` : ''}`
                            : `/manufacturing?tab=RUNS${n.entityId ? `&runId=${encodeURIComponent(n.entityId)}` : ''}`,
                        label:
                          role === 'SUPER_ADMIN'
                            ? 'Review Production Run'
                            : 'View Production Run',
                      };
                    } else if (
                      n.entityType === 'DEPARTMENT_ISSUE_BATCH' ||
                      n.title.toLowerCase().includes('department issue batch')
                    ) {
                      targetLink = {
                        href: role === 'SUPER_ADMIN' ? '/approvals?tab=DEPARTMENTS' : '/departments?tab=ISSUES',
                        label: role === 'SUPER_ADMIN' ? 'Review Department Issue Batch' : 'View Stock Out',
                      };
                    } else if (
                      n.entityType === 'DEPARTMENT_ISSUE' ||
                      n.title.toLowerCase().includes('department issue')
                    ) {
                      targetLink = {
                        href: role === 'SUPER_ADMIN' ? '/approvals?tab=DEPARTMENTS' : '/departments?tab=ISSUES',
                        label: role === 'SUPER_ADMIN' ? 'Review Department Issue' : 'View Stock Out',
                      };
                    } else if (
                      n.entityType === 'DEPARTMENT_RETURN' ||
                      n.title.toLowerCase().includes('department return')
                    ) {
                      targetLink = {
                        href: '/departments?tab=RETURNS',
                        label: role === 'SUPER_ADMIN' ? 'Review Department Return' : 'View Department Returns',
                      };
                    } else if (n.entityType === 'DEPARTMENT') {
                      targetLink = n.entityId
                        ? { href: `/departments?departmentId=${encodeURIComponent(n.entityId)}`, label: role === 'SUPER_ADMIN' ? 'Review Department' : 'View Department' }
                        : { href: '/departments', label: 'View Departments' };
                    } else if (n.title.toLowerCase().includes('department')) {
                      targetLink = { href: '/departments', label: 'View Departments' };
                    } else if (n.entityType === 'PRODUCT' || n.title.toLowerCase().includes('product')) {
                      targetLink = n.entityId && role === 'SUPER_ADMIN'
                        ? { href: `/catalog?status=PENDING_APPROVAL&productId=${encodeURIComponent(n.entityId)}`, label: 'Review Product' }
                        : n.entityId
                          ? { href: `/catalog?productId=${encodeURIComponent(n.entityId)}`, label: 'View Product' }
                          : { href: '/catalog', label: 'View Catalog' };
                    } else if (
                      n.entityType === 'STOCK_REQUEST' ||
                      n.title.toLowerCase().includes('approval') ||
                      n.title.toLowerCase().includes('request')
                    ) {
                      if (role === 'SUPER_ADMIN') {
                        if (
                          n.title.toLowerCase().includes('approval') ||
                          n.message.toLowerCase().includes('review') ||
                          n.message.toLowerCase().includes('waiting')
                        ) {
                          targetLink = { href: '/approvals', label: 'Review in Approvals Queue' };
                        } else if (n.entityId) {
                          targetLink = { href: `/requests/${n.entityId}`, label: 'View Request Details' };
                        } else {
                          targetLink = { href: '/approvals', label: 'Go to Approvals Queue' };
                        }
                      } else if (n.entityId) {
                        targetLink = { href: `/requests/${n.entityId}`, label: 'View Request Details' };
                      } else {
                        targetLink = { href: '/requests', label: 'View Requests' };
                      }
                    } else if (
                      n.entityType === 'SHIPMENT' ||
                      n.title.toLowerCase().includes('shipment') ||
                      n.title.toLowerCase().includes('receipt')
                    ) {
                      if (role === 'SUPER_ADMIN' && n.title.toLowerCase().includes('receipt')) {
                        targetLink = { href: '/approvals', label: 'Review Receipt in Approvals' };
                      } else if (n.entityId) {
                        targetLink = { href: `/shipments/${n.entityId}`, label: 'Track Shipment' };
                      } else {
                        targetLink = { href: '/shipments', label: 'View Shipments' };
                      }
                    } else if (role === 'SUPER_ADMIN' && n.title.toLowerCase().includes('approval')) {
                      targetLink = { href: '/approvals', label: 'Review in Approvals Queue' };
                    }

                    const isApproval =
                      n.title.toLowerCase().includes('approval') ||
                      n.message.toLowerCase().includes('review');

                    return (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (!n.readAt) handleMarkAsRead(n.id);
                          setShowNotifications(false);
                          if (targetLink?.href) {
                            router.push(targetLink.href);
                          }
                        }}
                        className={`py-3 transition-colors rounded-lg px-2.5 my-1 ${
                          targetLink ? 'cursor-pointer hover:bg-slate-100/80' : ''
                        } ${
                          !n.readAt ? 'bg-blue-50/70 hover:bg-blue-100/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">
                              {isApproval ? '⏳' : n.entityType === 'SHIPMENT' ? '🚚' : '📦'}
                            </span>
                            <p className="font-semibold text-slate-800 leading-tight">{n.title}</p>
                          </div>
                          {!n.readAt && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkAsRead(n.id);
                              }}
                              className="text-[10px] font-medium text-blue-600 hover:underline shrink-0"
                            >
                              Mark read
                            </button>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed break-words font-sans">
                          {n.message}
                        </p>

                        <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-slate-400 font-mono">
                            {n.createdAt
                              ? new Date(n.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Recent'}
                          </span>

                          {targetLink && (
                            <span className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-200/60 transition-colors">
                              <span>{targetLink.label}</span>
                              <span>→</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Role Badge */}
        {user && (
          <div className="hidden sm:flex items-center gap-1.5 pl-2.5 border-l border-slate-200">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {user.role}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

export default TopBar;
