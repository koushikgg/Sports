import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { asc, eq, getDb, sports, teams, venues } from '@sports/db';
import { getTournamentDetail } from '@sports/scoring';
import '@sports/sports-engine/src/all';
import { ProfileBack } from '@/components/players/player-view';
import { buildFixturePrompt } from '@sports/sports-engine/src/fixture-import';
import { loadFixtureContext } from '@/lib/fixture-context';
import { RatchShell } from '@/components/ratch/shell';
import { TournamentPanel } from '@/components/tournaments/detail';
import '@/components/tournaments/tournaments.css';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { user } = await getShellUser();
  const t = /^[0-9a-f-]{36}$/i.test(id) ? await getTournamentDetail(id, !!user) : null;
  return { title: t?.name ?? 'Tournament', description: t ? `Standings, fixtures and results for ${t.name}.` : undefined };
}

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getShellUser();
  const t = /^[0-9a-f-]{36}$/i.test(id) ? await getTournamentDetail(id, !!user) : null;
  if (!t) notFound();
  // teams an admin can still add: same sport, not already entered
  const inside = new Set((t.meta?.teams ?? []).map((x) => x.id));
  const candidates = user?.role === 'admin'
    ? (await getDb().select({ id: teams.id, name: teams.name }).from(teams).innerJoin(sports, eq(sports.id, teams.sportId)).where(eq(sports.key, t.sportKey)).orderBy(asc(teams.name))).filter((x) => !inside.has(x.id))
    : undefined;
  const allVenues = user?.role === 'admin' ? await getDb().select({ id: venues.id, name: venues.name }).from(venues).orderBy(asc(venues.name)) : undefined;
  const canEditMatches = user?.role === 'admin' || !!user?.managed?.includes(id);
  const fixturePrompt = user?.role === 'admin'
    ? (() => loadFixtureContext(id).then((l) => (l ? buildFixturePrompt(l.ctx) : undefined)))()
    : undefined;
  return (
    <RatchShell active="tournaments" user={user}>
      <ProfileBack href="/tournaments" label="ALL TOURNAMENTS" />
      <TournamentPanel t={t} isAdmin={user?.role === 'admin'} candidates={candidates} fixturePrompt={await fixturePrompt} venues={allVenues} canEditMatches={canEditMatches} />
    </RatchShell>
  );
}
