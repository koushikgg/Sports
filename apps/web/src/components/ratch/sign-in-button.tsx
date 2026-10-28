'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/** Top-right login button for signed-out visitors. Sends them back to the page they were on after signing in. */
export function SignInButton() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const back = path === '/login' ? '' : `?callbackUrl=${encodeURIComponent(path + (search ? `?${search}` : ''))}`;
  return (
    <Link href={`/login${back}`} className="rx-login">
      LOGIN
    </Link>
  );
}
