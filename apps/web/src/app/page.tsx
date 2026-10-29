import type { Metadata } from 'next';
import Link from 'next/link';
import '@sports/sports-engine/src/all';
import { getCricketLeaders, getSnapshot, listTournaments } from '@sports/scoring';
import { Featured } from '@/components/matches/featured';
import { sportColor, statusGroup } from '@/components/matches/model';
import { RatchShell } from '@/components/ratch/shell';
import '@/components/showcase/showcase.css';
import { TileGrid } from '@/components/showcase/tiles';
import { LeaderBoard } from '@/components/sports/leaders';
import { canScoreMatch } from '@sports/shared';
import { getAllSports, listMatchCards } from '@/lib/queries';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { absolute: 'Ratchet — every match, live' },
  description: 'Live scores, fixtures, standings and results for every game played around the office.',
};

const BAND = {
  guest: { title: 'Run the games? Sign in.', text: 'Organisers and scorers sign in to schedule matches and keep the live score moving.', href: '/login', label: 'SIGN IN' },
  scorer: { title: 'Your scoring queue', text: 'Matches assigned to you, and matches with no scorer yet, are waiting.', href: '/score', label: 'OPEN QUEUE' },
  admin: { title: 'Set up the next game', text: 'Create a tournament with its teams and rules, or schedule a single match with playing XIs.', href: '/create', label: 'CREATE' },
} as const;

export default async function Showcase() {
  const { user } = await getShellUser();
  const signedIn = !!user;
  const [matches, sports, tournaments] = await Promise.all([
    listMatchCards({ limit: 200, signedIn }),
    getAllSports(),
    listTournaments(signedIn),
  ]);

  const live = matches.filter((m) => statusGroup(m.status) === 'live');
  const upcoming = matches.filter((m) => m.status === 'scheduled').sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999')).slice(0, 3);
  const results = matches.filter((m) => statusGroup(m.status) === 'ft').slice(0, 3);
  const spotlight = live.filter((m) => m.sportKey === 'cricket').sort((a, b) => b.seq - a.seq)[0];
  const [featured, leaders] = await Promise.all([
    spotlight ? getSnapshot(spotlight.id) : null,
    sports.some((s) => s.key === 'cricket' && s.enabled) ? getCricketLeaders(5) : null,
  ]);
  const ongoing = tournaments.filter((t) => t.status !== 'done').slice(0, 3);
  const band = BAND[user?.role ?? 'guest'];

  return (
    <RatchShell active="home" user={user}>
      <section className="sx-hero" aria-label="Welcome">
        <div>
          <span className="sx-eyebrow">COMPANY SPORTS</span>
          <h1>Every match. <span>Live.</span></h1>
          <p>Ball-by-ball scores, fixtures, standings and results for every game played around the office.</p>
          <div className="sx-cta">
            <Link href="/matches" className="mx-btn mx-btn-lg" data-variant="amber">{live.length ? `${live.length} LIVE NOW` : 'SEE ALL MATCHES'}</Link>
            <Link href="/tournaments" className="mx-btn mx-btn-lg" data-variant="gray">TOURNAMENTS</Link>
            {user && <Link href={user.role === 'admin' ? '/create' : '/score'} className="mx-btn mx-btn-lg" data-variant="blue">{user.role === 'admin' ? 'CREATE' : 'SCORE'}</Link>}
          </div>
        </div>
        <div className="sx-hero-card">
          {featured && spotlight ? (
            <Featured key={featured.matchId} initial={featured} competition={spotlight.competition} canScore={canScoreMatch(user, spotlight)} />
          ) : (
            <p className="sx-empty">No match is live right now. The next fixtures are below.</p>
          )}
        </div>
      </section>

      <section className="sx-stats" aria-label="At a glance">
        <Link href="/matches" className="sx-stat" data-live={live.length > 0 ? 'true' : undefined}><b>{live.length}</b><span className="lbl">LIVE NOW</span></Link>
        <Link href="/matches" className="sx-stat"><b>{matches.filter((m) => m.status === 'scheduled').length}</b><span className="lbl">UPCOMING</span></Link>
        <Link href="/matches" className="sx-stat"><b>{matches.filter((m) => statusGroup(m.status) === 'ft').length}</b><span className="lbl">RESULTS</span></Link>
        <Link href="/tournaments" className="sx-stat"><b>{tournaments.length}</b><span className="lbl">TOURNAMENTS</span></Link>
      </section>

      <section className="sx-section" aria-labelledby="live-h">
        <div className="sx-section-head"><h2 id="live-h">Live now</h2><span style={{ flex: 1 }} /><Link href="/matches" className="mx-viewall">ALL MATCHES</Link></div>
        <TileGrid matches={live.slice(0, 3)} viewer={user} empty="No matches are live right now." />
      </section>

      <div className="sx-two">
        <section className="sx-section" aria-labelledby="up-h">
          <div className="sx-section-head"><h2 id="up-h">Upcoming</h2></div>
          <TileGrid matches={upcoming} viewer={user} empty="No fixtures scheduled." />
        </section>
        <section className="sx-section" aria-labelledby="res-h">
          <div className="sx-section-head"><h2 id="res-h">Recent results</h2></div>
          <TileGrid matches={results} viewer={user} empty="No results yet." />
        </section>
      </div>

      {ongoing.length > 0 && (
        <section className="sx-section" aria-labelledby="tour-h">
          <div className="sx-section-head"><h2 id="tour-h">Tournaments</h2><span style={{ flex: 1 }} /><Link href="/tournaments" className="mx-viewall">ALL TOURNAMENTS</Link></div>
          <div className="tn-grid">
            {ongoing.map((t) => (
              <Link key={t.id} href={`/tournaments?t=${t.id}`} className="tn-card" style={{ ['--tn' as string]: sportColor(t.sportKey) }}>
                <div className="cw-row-between"><span className="lbl">{t.sportName.toUpperCase()}</span><span className="mx-badge" data-tone={t.status === 'live' ? 'live' : 'up'}><i />{t.status === 'live' ? 'ONGOING' : 'UPCOMING'}</span></div>
                <div><b className="tn-name">{t.name}</b><small>{t.formatLabel} · {t.teamCount} teams</small></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {leaders && (leaders.runs.length > 0 || leaders.wickets.length > 0) && (
        <section className="sx-section" aria-labelledby="lead-h">
          <div className="sx-section-head"><h2 id="lead-h">Cricket leaders</h2></div>
          <div className="sx-two">
            <LeaderBoard title="TOP RUN-SCORERS" unit="runs" rows={leaders.runs} />
            <LeaderBoard title="TOP WICKET-TAKERS" unit="wkts" rows={leaders.wickets} />
          </div>
        </section>
      )}

      <section className="sx-band" aria-label={band.title}>
        <div><h2>{band.title}</h2><p>{band.text}</p></div>
        <Link href={band.href} className="mx-btn mx-btn-lg" data-variant="amber">{band.label}</Link>
      </section>
    </RatchShell>
  );
}
