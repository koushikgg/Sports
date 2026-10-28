import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import '@/styles/ratch-base.css';
import './shell.css';
import Link from 'next/link';

/** Top-level destinations. Only some exist yet; the rest render as disabled until they are built. */
const NAV = [
  { key: 'matches', label: 'MATCHES', href: '/matches' },
  { key: 'tournaments', label: 'TOURNAMENTS' },
  { key: 'teams', label: 'TEAMS' },
  { key: 'players', label: 'PLAYERS' },
  { key: 'standings', label: 'STANDINGS' },
] as const;

export type NavKey = (typeof NAV)[number]['key'];

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export function RatchShell({
  active,
  user,
  children,
}: {
  active: NavKey;
  user: { name: string; role: 'admin' | 'scorer' } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="ratch rx-page" data-theme="dark">
      <a href="#main" className="rx-skip">Skip to content</a>
      <header className="rx-nav">
        <Link href="/matches" className="rx-brand">
          <span className="rx-brand-dot" />
          <span className="rx-brand-name">Sports Hub</span>
        </Link>
        <nav className="rx-links" aria-label="Main">
          {NAV.map((n) =>
            'href' in n ? (
              <Link key={n.key} href={n.href} className="rx-link" data-active={n.key === active ? 'true' : undefined} aria-current={n.key === active ? 'page' : undefined}>
                {n.label}
              </Link>
            ) : (
              <span key={n.key} className="rx-link" aria-disabled="true" title="Coming soon">{n.label}</span>
            ),
          )}
        </nav>
        {user ? (
          <div className="rx-user">
            {user.role === 'admin' ? (
              <Link href="/admin" className="rx-role" data-role="admin" title="Open the admin area">ADMIN</Link>
            ) : (
              <span className="rx-role" data-role={user.role}>{user.role.toUpperCase()}</span>
            )}
            <span className="rx-avatar" aria-label={user.name} title={user.name}>{initials(user.name)}</span>
          </div>
        ) : (
          <Link href="/login" className="rx-link rx-signin">SIGN IN</Link>
        )}
      </header>
      <main id="main" className="rx-main">{children}</main>
    </div>
  );
}
