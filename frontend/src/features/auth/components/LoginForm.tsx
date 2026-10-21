'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../auth.store';
import { Button } from '../../../components/ui/Button';
import { ApiError } from '../../../lib/api/errors';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Active countdown timer when locked out
  useEffect(() => {
    if (!isLocked || lockoutTimer <= 0) return;

    const timer = setInterval(() => {
      setLockoutTimer((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          setErrorMsg('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLocked, lockoutTimer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    setLoading(true);
    setErrorMsg('');

    try {
      await login({ username, password });
      const targetUrl = searchParams.get('redirect') || '/inventory';
      router.push(targetUrl);
    } catch (err: unknown) {
      const isApiErr =
        err instanceof ApiError ||
        (typeof err === 'object' && err !== null && 'status' in err);
      const apiErr = err as ApiError;

      if (isApiErr) {
        if (apiErr.isLocked || apiErr.status === 423) {
          setIsLocked(true);
          const retrySeconds = apiErr.details?.retryAfterSeconds || 900;
          setLockoutTimer(retrySeconds);
          setErrorMsg(
            apiErr.message ||
              'Account temporarily locked due to 5 failed attempts. Please wait for the lockout countdown or contact your Super Admin.'
          );
        } else if (apiErr.status === 429) {
          setErrorMsg('Rate limit exceeded: too many requests from this network. Please wait a minute before retrying.');
        } else {
          const newAttempts = failedAttempts + 1;
          setFailedAttempts(newAttempts);
          setErrorMsg(
            apiErr.message ||
              `Invalid credentials. (${Math.max(0, 5 - newAttempts)} attempts remaining before temporary lockout)`
          );
        }
      } else {
        const message = err instanceof Error ? err.message : 'Invalid username or password';
        setErrorMsg(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemoRole = (roleUser: string) => {
    setUsername(roleUser);
    setPassword('Password123!');
    setErrorMsg('');
  };

  return (
    <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-7 sm:p-9 shadow-xl shadow-slate-200/60 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Operations Sign In</h2>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/80">
            Secure Portal
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Enter your authorized facility credentials to access inventory
        </p>
      </div>

      {/* Security Lockout or Error Alert */}
      {errorMsg && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
            isLocked
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span className="text-sm shrink-0 mt-0.5">{isLocked ? '🔒' : '⚠️'}</span>
          <div className="flex-1 space-y-1">
            <p className="font-semibold leading-snug">{errorMsg}</p>
            {isLocked && lockoutTimer > 0 && (
              <p className="font-mono text-[11px] text-amber-800 font-bold">
                Lockout remaining: {Math.floor(lockoutTimer / 60)}m {lockoutTimer % 60}s
              </p>
            )}
          </div>
        </div>
      )}

      {/* Form Fields */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Username */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 block">
            Username or Operator ID
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <input
              type="text"
              required
              disabled={isLocked || loading}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. storeadmin, superadmin"
              className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50/80 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-100 disabled:text-slate-400 transition-all duration-150"
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 block">
              Password
            </label>
            <span className="text-[10px] text-slate-400">Encrypted</span>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              disabled={isLocked || loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter account password"
              className="w-full pl-9 pr-10 py-2.5 bg-slate-50/80 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-100 disabled:text-slate-400 transition-all duration-150"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          isLoading={loading}
          disabled={isLocked}
          className="w-full py-2.5 text-xs font-semibold shadow-sm hover:shadow transition-all"
        >
          Sign In to Operations Console
        </Button>
      </form>

      {/* Quick Role Fill for Testing (Development / Non-Production Only) */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Quick fill role credentials (Dev only):</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleFillDemoRole('superadmin')}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-blue-50 hover:border-blue-300 text-[11px] font-medium text-slate-700 hover:text-blue-700 transition-colors text-center"
            >
              Super Admin
            </button>
            <button
              type="button"
              onClick={() => handleFillDemoRole('storeadmin')}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-blue-50 hover:border-blue-300 text-[11px] font-medium text-slate-700 hover:text-blue-700 transition-colors text-center"
            >
              Store Admin
            </button>
            <button
              type="button"
              onClick={() => handleFillDemoRole('clientadmin')}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-blue-50 hover:border-blue-300 text-[11px] font-medium text-slate-700 hover:text-blue-700 transition-colors text-center"
            >
              Client Admin
            </button>
          </div>
        </div>
      )}

      {/* Security Policy Reminder */}
      <div className="pt-1 text-center space-y-1">
        <p className="text-[11px] text-slate-400">
          Self-service registration disabled by governance policy.
        </p>
        <p className="text-[11px] text-slate-500 font-medium">
          Need access or password reset? Contact your Facility Super Admin.
        </p>
      </div>
    </div>
  );
}

export default LoginForm;
