/**
 * Cookie-based session utilities supporting secure sessions and auth tokens.
 */

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

export function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )session_token=([^;]+)'));
  if (match) return match[2];
  // Fallback for development if cookie is not yet set
  return localStorage.getItem('session_token');
}

export function setSessionToken(token: string): void {
  if (typeof document !== 'undefined') {
    // 30-day extended expiration matching session duration
    const maxAge = 30 * 24 * 60 * 60;
    const isSecure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `session_token=${token}; path=/; max-age=${maxAge}; SameSite=Lax${isSecure}`;
    localStorage.setItem('session_token', token);
  }
}

export function clearSessionToken(): void {
  if (typeof document !== 'undefined') {
    document.cookie = 'session_token=; path=/; max-age=0; SameSite=Lax';
    localStorage.removeItem('session_token');
    localStorage.removeItem('user_session');
  }
}
