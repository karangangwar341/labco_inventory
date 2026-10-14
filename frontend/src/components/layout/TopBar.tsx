'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../features/auth/auth.store';
import { notificationsService } from '../../features/notifications/notifications.service';
import { InAppNotification } from '../../features/notifications/notifications.types';

interface TopBarProps {
  onOpenMobileMenu?: () => void;
  actions?: React.ReactNode;
}

export function TopBar({ onOpenMobileMenu, actions }: TopBarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoadingNotifs(true);
      const res = await notificationsService.getNotifications({ limit: 10 });
      setNotifications(res?.notifications || []);
      setUnreadCount(res?.unreadCount || 0);
    } catch {
      // Backend notifications fetch handled gracefully
    } finally {
      setIsLoadingNotifs(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationsService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore error
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsService.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch {
      // Ignore error
    }
  };

  // Compute title & breadcrumbs from pathname
  const getPageInfo = () => {
    if (!pathname || pathname === '/') return { title: 'Operations Overview', breadcrumb: null };
    if (pathname === '/inventory') return { title: 'Inventory & Stock Balances', breadcrumb: null };
    if (pathname === '/requests') return { title: 'Stock Requests', breadcrumb: null };
    if (pathname === '/requests/new') return { title: 'New Stock Request', breadcrumb: { label: 'Stock Requests', href: '/requests' } };
    if (pathname.startsWith('/requests/')) return { title: 'Request Details', breadcrumb: { label: 'Stock Requests', href: '/requests' } };
    if (pathname === '/approvals') return { title: 'Approvals Queue', breadcrumb: null };
    if (pathname === '/shipments') return { title: 'Shipments & Inbound Receipts', breadcrumb: null };
    if (pathname.startsWith('/shipments/')) return { title: 'Shipment Details', breadcrumb: { label: 'Shipments', href: '/shipments' } };
    if (pathname === '/catalog') return { title: 'Product Catalog', breadcrumb: null };
    if (pathname === '/manufacturing') return { title: 'Manufacturing & BOM', breadcrumb: null };
    if (pathname === '/departments') return { title: 'Departments & Internal Movements', breadcrumb: null };
    if (pathname === '/imports') return { title: 'AI Document Ingestion', breadcrumb: null };
    if (pathname === '/reports') return { title: 'Reports & Audit Logs', breadcrumb: null };
    if (pathname === '/admin/users') return { title: 'User Management', breadcrumb: null };
    if (pathname === '/admin/settings') return { title: 'System Settings', breadcrumb: null };
    if (pathname === '/backups') return { title: 'Resiliency & Backups', breadcrumb: null };
    return { title: 'Warehouse Operations', breadcrumb: null };
  };

  const { title, breadcrumb } = getPageInfo();

  return (
    <header className="sticky top-0 z-20 h-14 bg-white border-b border-[#dbe3ee] px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile Trigger + Breadcrumbs & Title */}
      <div className="flex items-center gap-3">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-1.5 rounded-md text-[#5b6678] hover:text-[#172033] hover:bg-[#f1f5f9] transition"
            aria-label="Open navigation menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-2">
          {breadcrumb && (
            <>
              <Link
                href={breadcrumb.href}
                className="text-xs font-medium text-[#5b6678] hover:text-[#2563eb] transition"
              >
                {breadcrumb.label}
              </Link>
              <span className="text-[#5b6678] text-xs">/</span>
            </>
          )}
          <h1 className="text-sm font-semibold text-[#172033] tracking-tight">{title}</h1>
        </div>
      </div>

      {/* Right: Optional Page Contextual Actions + System Status */}
      <div className="flex items-center gap-3">
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) fetchNotifications();
            }}
            className="p-1.5 rounded-md text-[#5b6678] hover:text-[#172033] hover:bg-[#f1f5f9] transition relative"
            aria-label="View system notifications"
            title="System notifications"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-[#2563eb] text-white text-[10px] font-bold rounded-full">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-[#dbe3ee] rounded-xl shadow-lg p-3 text-xs z-50 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-[#dbe3ee]">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-[#172033]">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#eff6ff] text-[#2563eb]">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] text-[#2563eb] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {isLoadingNotifs ? (
                <div className="py-4 text-center text-[#5b6678]">Loading alerts...</div>
              ) : notifications.length === 0 ? (
                <div className="py-4 text-center text-[#5b6678]">No new notifications.</div>
              ) : (
                <div className="divide-y divide-[#dbe3ee] max-h-72 overflow-y-auto">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`py-2.5 transition ${!n.readAt ? 'bg-[#f8fafc] px-2 rounded-lg' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-[#172033]">{n.title}</p>
                        {!n.readAt && (
                          <button
                            onClick={() => handleMarkAsRead(n.id)}
                            className="text-[10px] text-[#2563eb] hover:underline shrink-0"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-[#5b6678] mt-0.5 leading-relaxed">{n.message}</p>
                      <span className="text-[10px] text-[#5b6678] mt-1 block">
                        {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User context indicator */}
        {user && (
          <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-[#dbe3ee] text-xs text-[#5b6678]">
            <span className="w-2 h-2 rounded-full bg-[#18794e]" title="Active session" />
            <span className="font-medium text-[#172033]">{user.role}</span>
          </div>
        )}
      </div>
    </header>
  );
}

export default TopBar;
