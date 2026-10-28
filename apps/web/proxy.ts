import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/*
 * Next.js 16 Proxy (formerly Middleware): the route guard.
 * Only the PRIVATE areas listed below need a session; everything else (public pages,
 * and unknown URLs, which must show the 404 page) is left alone. Keep private pages under
 * /dashboard (or add a new prefix to PRIVATE_PREFIXES).
 */

// Every private page lives under /dashboard/..., so one prefix protects them all.
const PRIVATE_PREFIXES = ['/dashboard', '/admin'];

const isPrivate = (pathname: string) =>
  PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

// Signed-in users have no business on these.
const AUTH_ONLY = new Set(['/login', '/register', '/forgot-password', '/reset-password']);

/** Only allow same-origin, non-protocol-relative redirect targets. */
function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('mhub_access') || request.cookies.has('mhub_refresh');

  if (!hasSession && isPrivate(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && AUTH_ONLY.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get('next')) ?? '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|sw.js|pwa-icon|icon|apple-icon|opengraph-image).*)',
  ],
};
