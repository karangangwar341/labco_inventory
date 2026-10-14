'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth.store';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ApiError } from '../../../lib/api/errors';

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    setLoading(true);
    setErrorMsg('');

    try {
      await login({ username, password });
      router.push('/inventory');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.isLocked || err.status === 423) {
          setIsLocked(true);
          const retrySeconds = err.details?.retryAfterSeconds || 900;
          setLockoutTimer(retrySeconds);
          setErrorMsg(err.message || 'Account locked due to 5 consecutive failed attempts. Please contact Super Admin or try again after 15 minutes.');
        } else if (err.status === 429) {
          setErrorMsg('Rate limit exceeded: too many login attempts from this network. Please wait a minute before retrying.');
        } else {
          const newAttempts = failedAttempts + 1;
          setFailedAttempts(newAttempts);
          setErrorMsg(err.message || `Invalid credentials. (${Math.max(0, 5 - newAttempts)} attempts remaining before temporary lockout)`);
        }
      } else {
        const message = err instanceof Error ? err.message : 'Invalid username or password';
        setErrorMsg(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm bg-white border border-[#dbe3ee] rounded-xl p-8 shadow-sm space-y-5">
      <div className="text-center space-y-2">
        <div className="w-10 h-10 rounded-lg bg-[#2563eb] mx-auto flex items-center justify-center text-white font-bold text-lg shadow-sm">
          L
        </div>
        <h1 className="text-xl font-bold text-[#172033] tracking-tight">Labco Instruments</h1>
        <p className="text-xs text-[#5b6678]">Warehouse Operations & AI Ledger</p>
      </div>

      <div className="p-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg space-y-1 text-xs text-[#172033]">
        <div className="flex items-center gap-1.5 text-[#2563eb] font-semibold">
          <span>🛡️</span> Zero-Trust Security Policy
        </div>
        <p className="text-[11px] text-[#5b6678]">
          IP-throttled to 10 requests/min. 5 failed login attempts trigger an automatic 15-minute account lock.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-[#fef3f2] border border-[#fee4e2] rounded-lg text-[#b42318] text-xs flex items-start gap-2">
          <span>⚠️</span>
          <div>
            <p className="font-semibold">{errorMsg}</p>
            {isLocked && (
              <p className="mt-1 text-[#b42318] font-mono">
                Lockout active. Try again in {Math.floor(lockoutTimer / 60)}m {lockoutTimer % 60}s.
              </p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <Input
          label="Username or ID"
          type="text"
          required
          disabled={isLocked || loading}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. superadmin"
        />

        <Input
          label="Password"
          type="password"
          required
          disabled={isLocked || loading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
        />

        <Button
          type="submit"
          variant="primary"
          isLoading={loading}
          disabled={isLocked}
          className="w-full mt-2"
        >
          Sign In to Operations Console
        </Button>
      </form>

      <div className="border-t border-[#dbe3ee] pt-3 text-center">
        <p className="text-[11px] text-[#5b6678]">
          Self-service registration disabled by governance policy. Contact your Super Admin for account provisioning.
        </p>
      </div>
    </div>
  );
}

export default LoginForm;
