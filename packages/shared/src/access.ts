import type { Role } from './index';

/** Who is looking: a signed-out guest, or a signed-in role. */
export type Viewer = 'guest' | Role;

const EVERYONE: Viewer[] = ['guest', 'scorer', 'admin'];
const MEMBERS: Viewer[] = ['scorer', 'admin'];
const ADMINS: Viewer[] = ['admin'];

/**
 * Route protection, first match wins. Anything not listed is public.
 * The middleware, the nav and the page guards all read this one list.
 */
export const ROUTE_RULES: { pattern: RegExp; allow: Viewer[] }[] = [
  // the scoring console keeps working at its old URL (it redirects), and is open to scorers
  { pattern: /^\/admin\/matches\/[^/]+\/score\/?$/, allow: MEMBERS },
  { pattern: /^\/admin(\/|$)/, allow: ADMINS },
  { pattern: /^\/create(\/|$)/, allow: ADMINS },
  { pattern: /^\/score(\/|$)/, allow: MEMBERS },
  { pattern: /^\/teams(\/|$)/, allow: MEMBERS },
  { pattern: /^\/players(\/|$)/, allow: MEMBERS },
];

export type Access = 'ok' | 'login' | 'forbidden';

/** ok: allowed. login: signed-out guest should sign in first. forbidden: signed in but not allowed. */
export function accessFor(role: Role | null | undefined, pathname: string): Access {
  const rule = ROUTE_RULES.find((r) => r.pattern.test(pathname));
  if (!rule) return 'ok';
  const viewer: Viewer = role ?? 'guest';
  if (rule.allow.includes(viewer)) return 'ok';
  return viewer === 'guest' ? 'login' : 'forbidden';
}

export interface NavItem {
  key: string;
  label: string;
  href: string;
  allow: Viewer[];
}

/** Top navigation. Each item is shown only to the roles that may open it. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'HOME', href: '/', allow: EVERYONE },
  { key: 'matches', label: 'MATCHES', href: '/matches', allow: EVERYONE },
  { key: 'tournaments', label: 'TOURNAMENTS', href: '/tournaments', allow: EVERYONE },
  { key: 'standings', label: 'STANDINGS', href: '/standings', allow: EVERYONE },
  { key: 'teams', label: 'TEAMS', href: '/teams', allow: MEMBERS },
  { key: 'players', label: 'PLAYERS', href: '/players', allow: MEMBERS },
  { key: 'score', label: 'SCORE', href: '/score', allow: MEMBERS },
  { key: 'create', label: 'CREATE', href: '/create', allow: ADMINS },
];

export const navFor = (role: Role | null | undefined): NavItem[] => {
  const viewer: Viewer = role ?? 'guest';
  return NAV_ITEMS.filter((n) => n.allow.includes(viewer));
};

/** Whether a scorer or admin may score this match (admins always; scorers only if unassigned or assigned to them). */
export function canScoreMatch(
  user: { id: string; role: Role } | null | undefined,
  match: { assignedScorerId: string | null; status: string },
): boolean {
  if (!user) return false;
  if (match.status === 'completed' || match.status === 'abandoned') return false;
  if (user.role === 'admin') return true;
  return user.role === 'scorer' && (!match.assignedScorerId || match.assignedScorerId === user.id);
}

// ---------------------------------------------------------------------------
// Google sign-in policy
// ---------------------------------------------------------------------------

export type GoogleDenied = 'unverified' | 'domain' | 'not_invited';

export type GoogleDecision =
  | { allow: true; /** Present when the person has no account yet and is a listed bootstrap admin. */ create?: { role: Role } }
  | { allow: false; reason: GoogleDenied };

const emailDomain = (email: string) => email.split('@')[1]?.toLowerCase() ?? '';

/**
 * Who may sign in with Google. Sign-in is invite-only: the Google email must match an account an admin
 * created, unless it is listed in ADMIN_EMAILS (so the first admin can get in). Optionally the email
 * domain is restricted too. Pure so it can be tested; the database lookup happens in the caller.
 */
export function decideGoogleSignIn(input: {
  email?: string | null;
  emailVerified?: boolean | null;
  existing: { id: string; role: Role } | null;
  adminEmails: string[];
  allowedDomain?: string | null;
}): GoogleDecision {
  const email = input.email?.trim().toLowerCase();
  if (!email || input.emailVerified !== true) return { allow: false, reason: 'unverified' };
  if (input.allowedDomain && emailDomain(email) !== input.allowedDomain.trim().toLowerCase()) return { allow: false, reason: 'domain' };
  if (input.existing) return { allow: true };
  if (input.adminEmails.map((e) => e.trim().toLowerCase()).includes(email)) return { allow: true, create: { role: 'admin' } };
  return { allow: false, reason: 'not_invited' };
}

/** Parse a comma-separated env value into trimmed, non-empty, lowercase entries. */
export const parseList = (value: string | undefined | null): string[] =>
  (value ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Only same-site paths are valid return URLs. Blocks https://evil.com, //evil.com and /\evil.com. */
export function safeReturnPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !/^\/(?![/\\])/.test(value)) return fallback;
  return value;
}
