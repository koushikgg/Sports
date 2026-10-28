'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  ['/admin', 'DASHBOARD'],
  ['/admin/sports', 'SPORTS'],
  ['/admin/teams', 'TEAMS'],
  ['/admin/players', 'PLAYERS'],
  ['/admin/tournaments', 'TOURNAMENTS'],
  ['/admin/matches', 'MATCHES'],
  ['/admin/users', 'USERS'],
] as const;

/** Section tabs under the top nav on every admin page. */
export function AdminNav({ children }: { children?: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  return (
    <div className="rx-subnav">
      <span className="lbl rx-subnav-label">ADMIN</span>
      <nav aria-label="Admin" className="rx-subnav-tabs">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} data-active={active(href) ? 'true' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
