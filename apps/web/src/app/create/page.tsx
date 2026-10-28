import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq, getDb, inArray, players, sports, teamMembers, teams, tournaments, users, venues } from '@sports/db';
import type { TournamentMeta } from '@sports/shared';
import '@/components/create/create.css';
import { Wizard } from '@/components/create/wizard';
import { RatchShell } from '@/components/ratch/shell';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create', robots: { index: false } };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ mode?: string; tournament?: string }> }) {
  const { user } = await getShellUser();
  const { mode, tournament } = await searchParams;

  if (user?.role !== 'admin') {
    return (
      <RatchShell active={null} user={user}>
        <div className="cw-denied">
          <h1>Organisers only</h1>
          <p>Creating tournaments and matches needs an admin account.</p>
          <Link href={user ? '/' : '/login?callbackUrl=/create'} className="mx-btn mx-btn-lg" data-variant="amber">{user ? 'BACK TO MATCHES' : 'SIGN IN'}</Link>
        </div>
      </RatchShell>
    );
  }

  const db = getDb();
  const [sportRows, teamRows, venueRows, tournamentRows, rosterRows, scorerRows] = await Promise.all([
    db.select().from(sports).orderBy(asc(sports.name)),
    db.select().from(teams).orderBy(asc(teams.name)),
    db.select().from(venues).orderBy(asc(venues.name)),
    db.select().from(tournaments).orderBy(asc(tournaments.name)),
    db
      .select({ teamId: teamMembers.teamId, id: players.id, name: players.name, role: players.role })
      .from(teamMembers)
      .innerJoin(players, eq(players.id, teamMembers.playerId))
      .orderBy(asc(players.name)),
    db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(inArray(users.role, ['admin', 'scorer'])).orderBy(asc(users.name)),
  ]);

  const rosters: Record<string, { id: string; name: string; role: string | null }[]> = {};
  for (const r of rosterRows) (rosters[r.teamId] ??= []).push({ id: r.id, name: r.name, role: r.role });

  return (
    <RatchShell active={null} user={user}>
      <Wizard
        initialMode={mode === 'match' ? 'match' : 'tournament'}
        initialTournamentId={tournament ?? null}
        currentUserId={null}
        sports={sportRows.map((s) => ({ id: s.id, key: s.key, name: s.name }))}
        teams={teamRows.map((t) => ({ id: t.id, name: t.name, shortName: t.shortName, sportId: t.sportId }))}
        venues={venueRows.map((x) => ({ id: x.id, name: x.name }))}
        tournaments={tournamentRows.map((t) => {
          const meta = t.meta as unknown as Partial<TournamentMeta>;
          return { id: t.id, name: t.name, sportId: t.sportId, overs: meta.overs ?? null, teamIds: (meta.teams ?? []).map((x) => x.id), venueIds: (meta.venues ?? []).map((x) => x.id) };
        })}
        rosters={rosters}
        scorers={scorerRows}
      />
    </RatchShell>
  );
}
