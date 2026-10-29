import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, ROUTE_RULES, accessFor, canScoreMatch, decideGoogleSignIn, navFor, parseList, safeReturnPath, type Viewer } from './access';

const roles: (null | 'scorer' | 'admin')[] = [null, 'scorer', 'admin'];
const viewerOf = (r: null | 'scorer' | 'admin'): Viewer => r ?? 'guest';

describe('accessFor', () => {
  it('public pages are open to everyone', () => {
    for (const p of ['/', '/matches', '/tournaments', '/sports', '/sports/cricket', '/sports/cricket/matches/abc', '/display/abc', '/login']) {
      for (const r of roles) expect(accessFor(r, p), `${r} ${p}`).toBe('ok');
    }
  });

  it('guests are sent to sign in for protected pages; wrong roles are forbidden', () => {
    expect(accessFor(null, '/admin')).toBe('login');
    expect(accessFor(null, '/create')).toBe('login');
    expect(accessFor(null, '/tournaments/abc/create')).toBe('login');
    expect(accessFor('scorer', '/tournaments/abc/create')).toBe('forbidden');
    expect(accessFor('admin', '/tournaments/abc/create')).toBe('ok');
    expect(accessFor(null, '/tournaments/abc')).toBe('ok');
    expect(accessFor(null, '/teams')).toBe('login');
    expect(accessFor('scorer', '/admin')).toBe('forbidden');
    expect(accessFor('scorer', '/admin/teams')).toBe('forbidden');
    expect(accessFor('scorer', '/create')).toBe('forbidden');
    expect(accessFor('admin', '/admin/teams')).toBe('ok');
    expect(accessFor('admin', '/create')).toBe('ok');
  });

  it('members (scorer and admin) can see the directories and the score queue', () => {
    for (const p of ['/teams', '/players', '/score', '/score/abc']) {
      expect(accessFor('scorer', p)).toBe('ok');
      expect(accessFor('admin', p)).toBe('ok');
      expect(accessFor(null, p)).toBe('login');
    }
  });

  it('the scoring console at its old admin URL stays open to scorers, but no other admin page does', () => {
    expect(accessFor('scorer', '/admin/matches/123/score')).toBe('ok');
    expect(accessFor('scorer', '/admin/matches/123')).toBe('forbidden');
    expect(accessFor('scorer', '/admin/matches')).toBe('forbidden');
    expect(accessFor(null, '/admin/matches/123/score')).toBe('login');
  });

  it('does not treat lookalike paths as protected', () => {
    expect(accessFor(null, '/administer')).toBe('ok');
    expect(accessFor(null, '/teamsheet')).toBe('ok');
    expect(accessFor(null, '/scoreboard')).toBe('ok');
  });
});

describe('navigation matches access', () => {
  it('shows exactly the items a role may open, and every shown item really opens', () => {
    for (const r of roles) {
      for (const item of navFor(r)) expect(accessFor(r, item.href), `${r} sees ${item.label}`).toBe('ok');
      for (const item of NAV_ITEMS.filter((n) => !n.allow.includes(viewerOf(r)))) {
        expect(navFor(r).some((n) => n.key === item.key), `${r} must not see ${item.label}`).toBe(false);
      }
    }
  });

  it('every protected nav item is hidden from guests', () => {
    for (const item of NAV_ITEMS) {
      if (accessFor(null, item.href) !== 'ok') expect(navFor(null).some((n) => n.key === item.key)).toBe(false);
    }
  });

  it('role menus: guest < scorer < admin', () => {
    expect(navFor(null).map((n) => n.key)).toEqual(['home', 'matches', 'tournaments']);
    expect(navFor('scorer').map((n) => n.key)).toEqual(['home', 'matches', 'tournaments', 'teams', 'players', 'score']);
    expect(navFor('admin').map((n) => n.key)).toEqual(['home', 'matches', 'tournaments', 'teams', 'players', 'score', 'create']);
  });

  it('rules never allow nobody', () => {
    for (const r of ROUTE_RULES) expect(r.allow.length).toBeGreaterThan(0);
  });
});

describe('canScoreMatch', () => {
  const live = { assignedScorerId: null, status: 'live' };
  it('guests cannot score', () => expect(canScoreMatch(null, live)).toBe(false));
  it('admins can score any unfinished match', () => {
    expect(canScoreMatch({ id: 'a', role: 'admin' }, { assignedScorerId: 'someone', status: 'scheduled' })).toBe(true);
  });
  it('a scorer can score unassigned matches and their own, not someone else’s', () => {
    expect(canScoreMatch({ id: 's', role: 'scorer' }, live)).toBe(true);
    expect(canScoreMatch({ id: 's', role: 'scorer' }, { assignedScorerId: 's', status: 'live' })).toBe(true);
    expect(canScoreMatch({ id: 's', role: 'scorer' }, { assignedScorerId: 'x', status: 'live' })).toBe(false);
  });
  it('nobody scores a finished match', () => {
    expect(canScoreMatch({ id: 'a', role: 'admin' }, { assignedScorerId: null, status: 'completed' })).toBe(false);
    expect(canScoreMatch({ id: 'a', role: 'admin' }, { assignedScorerId: null, status: 'abandoned' })).toBe(false);
  });
});

describe('decideGoogleSignIn', () => {
  const base = { email: 'asha@company.com', emailVerified: true, existing: null, adminEmails: [] as string[], allowedDomain: null };
  const user = { id: 'u1', role: 'scorer' as const };

  it('lets an invited person in', () => {
    expect(decideGoogleSignIn({ ...base, existing: user })).toEqual({ allow: true });
  });
  it('turns away someone who was never invited', () => {
    expect(decideGoogleSignIn(base)).toEqual({ allow: false, reason: 'not_invited' });
  });
  it('requires a verified email', () => {
    expect(decideGoogleSignIn({ ...base, existing: user, emailVerified: false })).toEqual({ allow: false, reason: 'unverified' });
    expect(decideGoogleSignIn({ ...base, existing: user, emailVerified: null })).toEqual({ allow: false, reason: 'unverified' });
    expect(decideGoogleSignIn({ ...base, existing: user, email: null })).toEqual({ allow: false, reason: 'unverified' });
  });
  it('a listed bootstrap admin may sign in and gets an admin account created', () => {
    expect(decideGoogleSignIn({ ...base, adminEmails: ['boss@company.com', ' Asha@Company.com '] })).toEqual({ allow: true, create: { role: 'admin' } });
  });
  it('an existing account is never re-created, even if the email is also a bootstrap admin', () => {
    expect(decideGoogleSignIn({ ...base, existing: user, adminEmails: ['asha@company.com'] })).toEqual({ allow: true });
  });
  it('matches emails case-insensitively', () => {
    expect(decideGoogleSignIn({ ...base, email: 'ASHA@Company.COM', adminEmails: ['asha@company.com'] })).toEqual({ allow: true, create: { role: 'admin' } });
  });
  it('can be restricted to one email domain, which also blocks bootstrap admins from elsewhere', () => {
    expect(decideGoogleSignIn({ ...base, existing: user, allowedDomain: 'company.com' })).toEqual({ allow: true });
    expect(decideGoogleSignIn({ ...base, existing: user, email: 'x@gmail.com', allowedDomain: 'company.com' })).toEqual({ allow: false, reason: 'domain' });
    expect(decideGoogleSignIn({ ...base, email: 'x@gmail.com', adminEmails: ['x@gmail.com'], allowedDomain: 'company.com' })).toEqual({ allow: false, reason: 'domain' });
  });
  it('a lookalike domain does not pass the domain check', () => {
    expect(decideGoogleSignIn({ ...base, existing: user, email: 'a@evilcompany.com', allowedDomain: 'company.com' }).allow).toBe(false);
    expect(decideGoogleSignIn({ ...base, existing: user, email: 'a@company.com.evil.io', allowedDomain: 'company.com' }).allow).toBe(false);
  });
});

describe('parseList and safeReturnPath', () => {
  it('parses env lists', () => {
    expect(parseList(' A@x.com, ,b@y.com ')).toEqual(['a@x.com', 'b@y.com']);
    expect(parseList(undefined)).toEqual([]);
    expect(parseList('')).toEqual([]);
  });
  it('keeps same-site paths and rejects everything that could leave the site', () => {
    expect(safeReturnPath('/tournaments?t=1')).toBe('/tournaments?t=1');
    expect(safeReturnPath('/')).toBe('/');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', 'evil', '', null, undefined]) {
      expect(safeReturnPath(bad as string | null | undefined), String(bad)).toBe('/');
    }
    expect(safeReturnPath('//evil.com', '/matches')).toBe('/matches');
  });
});
