'use client';

import React from 'react';
import { useAuth } from '../auth.store';
import { Button } from '../../../components/ui/Button';

export function SessionReplacedModal() {
  const { sessionReplaced, dismissSessionReplaced } = useAuth();

  if (!sessionReplaced) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="max-w-md w-full bg-white border border-[#fee4e2] rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2.5 text-[#b42318] font-bold text-base">
          <span className="text-xl">⚠️</span>
          <h3>Active Session Terminated</h3>
        </div>
        <p className="text-xs text-[#5b6678] leading-relaxed">
          Your account has signed in from another device, browser, or IP address. Under single-active-session security rules, prior sessions are revoked immediately to prevent concurrent hijacking.
        </p>
        <div className="pt-2 flex justify-end">
          <Button variant="danger" onClick={dismissSessionReplaced}>
            Sign In Again
          </Button>
        </div>
      </div>
    </div>
  );
}
