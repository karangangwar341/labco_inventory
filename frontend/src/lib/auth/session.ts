/**
 * Cookie-based session utilities supporting secure sessions and auth tokens.
 */

export function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )session_token=([^;]+)'));
  if (match) return match[2];
  // Fallback for development if cookie is not yet set
  return localStorage.getItem('session_token');
}

export function setSessionToken(token: string): void {
  if (typeof document !== 'undefined') {
    // 7-day expiration matching inactivity baseline
    const maxAge = 7 * 24 * 60 * 60;
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
