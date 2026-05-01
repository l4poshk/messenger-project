// ──────────────────────────────────────────────
// Cookie helpers for auth middleware
// The Next.js middleware (Edge) can't read localStorage,
// so we sync auth state to a cookie for route protection.
// ──────────────────────────────────────────────

const AUTH_COOKIE_NAME = 'messenger-auth-token';
const COOKIE_MAX_AGE_DAYS = 30;

export function setAuthCookie(token: string): void {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${AUTH_COOKIE_NAME}=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function removeAuthCookie(): void {
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0`;
}
