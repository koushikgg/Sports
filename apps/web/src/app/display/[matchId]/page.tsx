import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@sports/sports-engine/src/all';
import { getSnapshot } from '@sports/scoring';
import { TvBoard } from '@/components/tv-board';
import { getMatchCard } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'TV display', robots: { index: false } };

export default async function DisplayPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const [m, snapshot] = await Promise.all([getMatchCard(matchId), getSnapshot(matchId)]);
  if (!m || !snapshot) notFound();
  return <TvBoard initial={snapshot} title={`${m.teamA} vs ${m.teamB}`} />;
}
