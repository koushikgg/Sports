import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@sports/sports-engine/src/all';
import { getSnapshot } from '@sports/scoring';
import '@/components/cricket/ratch.css';
import '@/components/matches/matches.css';
import '@/components/match/match.css';
import { LiveMatch, MatchHeader } from '@/components/match/live-match';
import { RatchShell } from '@/components/ratch/shell';
import { getMatchCard } from '@/lib/queries';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ sport: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = await getMatchCard(id);
  if (!m) return {};
  const title = `${m.teamA} vs ${m.teamB} — ${m.status === 'live' ? 'live score' : m.sportName}`;
  const description = [m.summary.sides.map((s) => `${s.name} ${s.score}`).join(' · '), m.summary.status].filter(Boolean).join(' — ');
  return { title, description, openGraph: { title, description, type: 'website' }, twitter: { card: 'summary_large_image', title, description } };
}

export default async function MatchPage({ params }: Props) {
  const { sport, id } = await params;
  const [card, snapshot, { user, canScore }] = await Promise.all([getMatchCard(id), getSnapshot(id), getShellUser()]);
  if (!card || !snapshot || card.sportKey !== sport) notFound();

  return (
    <RatchShell active="matches" user={user}>
      <MatchHeader card={card} sportName={card.sportName} canScore={canScore} />
      <LiveMatch initial={snapshot} card={card} canScore={canScore} />
    </RatchShell>
  );
}
