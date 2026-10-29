import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import '@/styles/ratch-base.css';
import './shell.css';
import Link from 'next/link';
import { navFor, type Role } from '@sports/shared';
import { signOut } from '@/auth';
import { SignInButton } from './sign-in-button';
import { UserMenu } from './user-menu';
import { Suspense } from 'react';

export type ShellUser = { id: string; name: string; role: Role; avatar?: string | null; /** Tournaments this person manages: they score and edit the matches there. */ managed?: string[] };

/**
 * Top-level shell. The navigation is built from the viewer's role (see NAV_ITEMS in @sports/shared),
 * so people only see links they can open. The middleware enforces the same rules.
 */
export function RatchShell({
  active,
  user,
  children,
}: {
  /** Key of the nav item to highlight (home, matches, tournaments...), or null on pages outside the nav. */
  active: string | null;
  user: ShellUser | null;
  children: React.ReactNode;
}) {
  const items = navFor(user?.role);
  return (
    <div className="ratch rx-page" data-theme="dark">
      <a href="#main" className="rx-skip">Skip to content</a>
      <header className="rx-nav">
        <Link href="/" className="rx-brand">
          <span className="rx-brand-dot" />
          <span className="rx-brand-name">Ratchet</span>
        </Link>
        <nav className="rx-links" aria-label="Main">
          {items.map((n) => (
            <Link key={n.key} href={n.href} className="rx-link" data-active={n.key === active ? 'true' : undefined} data-key={n.key} aria-current={n.key === active ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        {user ? (
          <div className="rx-user">
            {user.role === 'admin' ? (
              <Link href="/admin" className="rx-role" data-role="admin" title="Open the admin area">ADMIN</Link>
            ) : (
              <span className="rx-role" data-role={user.role}>{user.role.toUpperCase()}</span>
            )}
            <UserMenu
              name={user.name}
              role={user.role}
              avatar={user.avatar}
              signOut={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            />
          </div>
        ) : (
          <Suspense fallback={<Link href="/login" className="rx-login">LOGIN</Link>}>
            <SignInButton />
          </Suspense>
        )}
      </header>
      <main id="main" className="rx-main">{children}</main>
    </div>
  );
}
