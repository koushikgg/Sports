import Link from 'next/link';
import '@/components/create/create.css';
import { RatchShell, type ShellUser } from './shell';

/**
 * Shown instead of a 404 when someone opens a link to something private. It says so plainly, without showing the name or
 * any scores. The people who may see it (admins and the tournament's managers) never get here.
 */
export function PrivateNotice({ user, what, why, backHref, backLabel, here, active = null }: {
  user: ShellUser | null;
  what: 'tournament' | 'match';
  /** private-tournament: hidden from everyone but admins and managers. members-only: needs a signed-in account. */
  why: 'private-tournament' | 'members-only' | 'private';
  backHref: string;
  backLabel: string;
  /** Where to come back to after signing in. */
  here: string;
  active?: string | null;
}) {
  const members = why === 'members-only';
  return (
    <RatchShell active={active} user={user}>
      <div className="cw-denied" role="status">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: 'var(--amber)' }}>
          <rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        <h1>{members ? `This ${what} is for members` : `This ${what} is private`}</h1>
        <p>
          {members
            ? `Sign in to see this ${what}.`
            : what === 'tournament'
              ? 'Only this tournament’s managers and the admins can see it.'
              : 'It belongs to a private tournament. Only that tournament’s managers and the admins can see it.'}
          {!members && !user && ' If you manage it, sign in first.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {!user && <Link href={`/login?callbackUrl=${encodeURIComponent(here)}`} className="mx-btn mx-btn-lg" data-variant="amber">SIGN IN</Link>}
          <Link href={backHref} className="mx-btn mx-btn-lg" data-variant="gray">{backLabel}</Link>
        </div>
      </div>
    </RatchShell>
  );
}
