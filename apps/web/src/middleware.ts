// ──────────────────────────────────────────────
// Next.js Middleware — Route protection
// Runs on Edge Runtime BEFORE page renders
//
// Strategy: Check for auth token in cookies/localStorage
// Since middleware runs on edge (no localStorage), we use
// a custom cookie that the client sets on login.
// ──────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Pages that don't require authentication
const PUBLIC_PATHS = ['/login', '/register'];

// Static/api paths to skip entirely
const SKIP_PATHS = ['/_next', '/api', '/favicon.ico'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets and API routes
  if (SKIP_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for auth cookie (set by client after login)
  const authToken = request.cookies.get('messenger-auth-token')?.value;
  const isAuthenticated = !!authToken;
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  // ── Not authenticated → redirect to /login ──
  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Authenticated → redirect away from login/register ──
  if (isAuthenticated && isPublicPath) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
