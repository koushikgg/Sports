import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@sports/sports-engine/src/all';
import { getSnapshot } from '@sports/scoring';
import { canScoreMatch } from '@sports/shared';
import '@/components/cricket/ratch.css';
import '@/components/matches/matches.css';
import './match.css';
import { LiveMatch, MatchHeader } from './live-match';
import { RatchShell } from '@/components/ratch/shell';
import { asc, getDb, venues } from '@sports/db';
import { getMatchCard } from '@/lib/queries';
import { getShellUser } from '@/lib/shell-user';

export async function matchMetadata(id: string): Promise<Metadata> {
  const { user } = await getShellUser();
  const m = await getMatchCard(id, !!user);
  if (!m) return {};
  const title = `${m.teamA} vs ${m.teamB} — ${m.status === 'live' ? 'live score' : m.sportName}`;
  const description = [m.summary.sides.map((s) => `${s.name} ${s.score}`).join(' · '), m.summary.status].filter(Boolean).join(' — ');
  return { title, description, openGraph: { title, description, type: 'website' }, twitter: { card: 'summary_large_image', title, description } };
}

/** The match page. `where` says which route it was opened from; a match is only found at its own route. */
export async function MatchPageView({ id, where }: { id: string; where: { sport: string } | { tournament: string } }) {
  const { user } = await getShellUser();
  const [card, snapshot] = await Promise.all([getMatchCard(id, !!user), getSnapshot(id)]);
  if (!card || !snapshot) notFound();
  if ('sport' in where ? card.sportKey !== where.sport : card.tournamentId !== where.tournament) notFound();
  const canScore = canScoreMatch(user, card);
  const scheduleVenues = user?.role === 'admin' && card.status === 'scheduled' && card.seq === 0 ? (await getDb().select({ name: venues.name }).from(venues).orderBy(asc(venues.name))).map((v) => v.name) : undefined;

  return (
    <RatchShell active={card.tournamentId ? 'tournaments' : 'matches'} user={user}>
      <MatchHeader card={card} sportName={card.sportName} canScore={canScore} scheduleVenues={scheduleVenues} />
      <LiveMatch initial={snapshot} card={card} canScore={canScore} />
    </RatchShell>
  );
}
