import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { accessFor } from '@sports/shared';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

/** Route protection lives in @sports/shared (ROUTE_RULES) so the nav and the page guards agree with it. */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const access = accessFor(req.auth?.user?.role, pathname);

  if (access === 'login') {
    const url = new URL('/login', req.nextUrl);
    url.searchParams.set('callbackUrl', pathname + search);
    return NextResponse.redirect(url);
  }
  if (access === 'forbidden') {
    return NextResponse.rewrite(new URL('/forbidden', req.nextUrl), { status: 403 });
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/admin/:path*', '/create/:path*', '/tournaments/:id/create', '/profile/:path*', '/score/:path*', '/teams/:path*', '/players/:path*'],
};
